import { EmbedBuilder, Colors } from 'discord.js';
import type { ModrinthProject, ModrinthVersion } from './modrinth.js';

const CHANNEL_COLOURS: Record<string, number> = {
  release: Colors.Green,
  beta:    Colors.Yellow,
  alpha:   Colors.Red,
};

const CHANNEL_LABELS: Record<string, string> = {
  release: '✅ Stable',
  beta:    '🧪 Beta',
  alpha:   '⚠️ Alpha',
};

const CHANGELOG_MAX = 800;

function truncateChangelog(changelog: string | null, versionUrl: string): string {
  if (!changelog || changelog.trim().length === 0) return '*No changelog provided.*';
  // Strip markdown images (often huge in modrinth changelogs)
  const stripped = changelog.replace(/!\[.*?\]\(.*?\)/g, '').trim();
  if (stripped.length <= CHANGELOG_MAX) return stripped;
  return `${stripped.slice(0, CHANGELOG_MAX).trimEnd()}…\n[Read full changelog](${versionUrl})`;
}

export function buildUpdateEmbed(
  project: ModrinthProject,
  version: ModrinthVersion,
): EmbedBuilder {
  const versionUrl = `https://modrinth.com/${project.project_type}/${project.slug}/version/${version.version_number}`;
  const projectUrl = `https://modrinth.com/${project.project_type}/${project.slug}`;

  const gameVersions = version.game_versions.join(', ') || 'Unknown';
  const loaders    = version.loaders.map(l => l[0].toUpperCase() + l.slice(1)).join(', ') || 'Unknown';

  return new EmbedBuilder()
    .setColor(CHANNEL_COLOURS[version.version_type] ?? Colors.Blurple)
    .setAuthor({ name: project.title, url: projectUrl, iconURL: project.icon_url ?? undefined })
    .setTitle(`${version.name}  (${version.version_number})`)
    .setURL(versionUrl)
    .setDescription(truncateChangelog(version.changelog, versionUrl))
    .addFields(
      { name: 'Release Channel', value: CHANNEL_LABELS[version.version_type] ?? version.version_type, inline: true },
      { name: 'Game Versions',   value: gameVersions, inline: true },
      { name: 'Loaders',         value: loaders,      inline: true },
    )
    .setFooter({ text: 'Modrinth', iconURL: 'https://docs.modrinth.com/img/logo.svg' })
    .setTimestamp(new Date(version.date_published));
}
