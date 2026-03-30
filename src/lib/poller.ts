import { Client, TextChannel } from 'discord.js';
import { pool } from '../db/index.js';
import { fetchProject, fetchLatestVersions, ModrinthVersion } from './modrinth.js';
import { buildUpdateEmbed } from './embed.js';

type ReleaseType = 'release' | 'beta' | 'alpha';

interface TrackedProject {
  id: number;
  guild_id: string;
  project_id: string;
  channel_id: string;
  ping_role_id: string | null;
  track_stable: boolean;
  track_beta: boolean;
  track_alpha: boolean;
  last_version_id: string | null;
}

function wantsVersion(row: TrackedProject, versionType: ReleaseType): boolean {
  if (versionType === 'release') return row.track_stable;
  if (versionType === 'beta')    return row.track_beta;
  if (versionType === 'alpha')   return row.track_alpha;
  return false;
}

async function checkProject(client: Client, row: TrackedProject): Promise<void> {
  try {
    const versions = await fetchLatestVersions(row.project_id);
    if (versions.length === 0) return;

    // Find new versions that appeared after last_version_id
    let newVersions: ModrinthVersion[];
    if (!row.last_version_id) {
      // First poll — just record the latest, don't announce
      newVersions = [];
    } else {
      const lastIndex = versions.findIndex(v => v.id === row.last_version_id);
      if (lastIndex === -1) {
        // last version has rolled off the list (very old) — treat everything as new
        newVersions = versions.filter(v => wantsVersion(row, v.version_type));
      } else {
        newVersions = versions.slice(0, lastIndex).filter(v => wantsVersion(row, v.version_type));
      }
    }

    // Update last_version_id to the newest regardless
    const latestId = versions[0].id;
    if (latestId !== row.last_version_id) {
      await pool.query(
        'UPDATE tracked_projects SET last_version_id = $1 WHERE id = $2',
        [latestId, row.id],
      );
    }

    if (newVersions.length === 0) return;

    const channel = await client.channels.fetch(row.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const textChannel = channel as TextChannel;

    const project = await fetchProject(row.project_id);

    // Post oldest-to-newest so the channel reads in chronological order
    for (const version of newVersions.reverse()) {
      const embed = buildUpdateEmbed(project, version);
      const content = row.ping_role_id ? `<@&${row.ping_role_id}>` : undefined;
      await textChannel.send({ content, embeds: [embed] });
    }
  } catch (err) {
    console.error(`[Poller] Error checking project ${row.project_id}:`, err);
  }
}

export async function startPoller(client: Client): Promise<void> {
  const interval = parseInt(process.env.POLL_INTERVAL_MS ?? '300000', 10);

  const poll = async () => {
    console.log('[Poller] Running poll cycle…');
    const { rows } = await pool.query<TrackedProject>('SELECT * FROM tracked_projects');
    await Promise.allSettled(rows.map(row => checkProject(client, row)));
    console.log(`[Poller] Done. Next poll in ${interval / 1000}s.`);
  };

  await poll();
  setInterval(poll, interval);
}
