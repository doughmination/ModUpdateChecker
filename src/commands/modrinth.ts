import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Colors,
  TextChannel,
} from 'discord.js';
import { pool } from '../db/index.js';
import { fetchProject } from '../lib/modrinth.js';
import { fetchLatestVersions } from '../lib/modrinth.js';

export const data = new SlashCommandBuilder()
  .setName('modrinth')
  .setDescription('Manage Modrinth project update tracking')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  // ── track ──────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub
      .setName('track')
      .setDescription('Start tracking a Modrinth project for updates')
      .addStringOption(opt =>
        opt.setName('project_id').setDescription('Modrinth project ID or slug').setRequired(true),
      )
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel to post updates in (defaults to current channel)'),
      )
      .addRoleOption(opt =>
        opt.setName('role').setDescription('Role to ping on updates (optional)'),
      ),
  )

  // ── untrack ────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub
      .setName('untrack')
      .setDescription('Stop tracking a Modrinth project')
      .addStringOption(opt =>
        opt.setName('project_id').setDescription('Modrinth project ID or slug').setRequired(true),
      ),
  )

  // ── list ───────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('list').setDescription('List all tracked projects in this server'),
  )

  // ── set-channel ────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub
      .setName('set-channel')
      .setDescription('Change the update channel for a tracked project')
      .addStringOption(opt =>
        opt.setName('project_id').setDescription('Modrinth project ID or slug').setRequired(true),
      )
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('New channel').setRequired(true),
      ),
  )

  // ── set-role ───────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub
      .setName('set-role')
      .setDescription('Set or clear the ping role for a tracked project')
      .addStringOption(opt =>
        opt.setName('project_id').setDescription('Modrinth project ID or slug').setRequired(true),
      )
      .addRoleOption(opt =>
        opt.setName('role').setDescription('Role to ping (omit to clear)'),
      ),
  )

  // ── set-releases ───────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub
      .setName('set-releases')
      .setDescription('Configure which release channels trigger updates')
      .addStringOption(opt =>
        opt.setName('project_id').setDescription('Modrinth project ID or slug').setRequired(true),
      )
      .addBooleanOption(opt =>
        opt.setName('stable').setDescription('Track stable releases').setRequired(true),
      )
      .addBooleanOption(opt =>
        opt.setName('beta').setDescription('Track beta releases').setRequired(true),
      )
      .addBooleanOption(opt =>
        opt.setName('alpha').setDescription('Track alpha releases').setRequired(true),
      ),
  );

// ─────────────────────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'track')        return handleTrack(interaction);
  if (sub === 'untrack')      return handleUntrack(interaction);
  if (sub === 'list')         return handleList(interaction);
  if (sub === 'set-channel')  return handleSetChannel(interaction);
  if (sub === 'set-role')     return handleSetRole(interaction);
  if (sub === 'set-releases') return handleSetReleases(interaction);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(msg: string) {
  return new EmbedBuilder().setColor(Colors.Green).setDescription(`✅ ${msg}`);
}
function err(msg: string) {
  return new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ ${msg}`);
}

async function resolveProjectId(slug: string): Promise<string | null> {
  try {
    const p = await fetchProject(slug);
    return p.id;
  } catch {
    return null;
  }
}

// ── /modrinth track ───────────────────────────────────────────────────────────

async function handleTrack(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const input     = i.options.getString('project_id', true).trim();
  const role      = i.options.getRole('role');
  const channelOpt = i.options.getChannel('channel');
  const channelId = channelOpt?.id ?? i.channelId;
  const guildId   = i.guildId!;

  // Verify project exists and resolve to canonical ID
  let project;
  try {
    project = await fetchProject(input);
  } catch {
    await i.editReply({ embeds: [err(`Could not find a Modrinth project with ID or slug \`${input}\`.`)] });
    return;
  }

  // Seed last_version_id so we don't flood on first poll
  const versions = await fetchLatestVersions(project.id).catch(() => []);
  const lastVersionId = versions[0]?.id ?? null;

  try {
    await pool.query(
      `INSERT INTO tracked_projects
         (guild_id, project_id, channel_id, ping_role_id, track_stable, last_version_id)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       ON CONFLICT (guild_id, project_id) DO NOTHING`,
      [guildId, project.id, channelId, role?.id ?? null, lastVersionId],
    );
  } catch (e) {
    await i.editReply({ embeds: [err('Database error while adding the project.')] });
    console.error(e);
    return;
  }

  const channelMention = `<#${channelId}>`;
  const rolePart = role ? ` · pings <@&${role.id}>` : '';
  await i.editReply({
    embeds: [ok(`Now tracking **${project.title}** in ${channelMention}${rolePart}.\nStable releases are on by default — use \`/modrinth set-releases\` to enable beta/alpha.`)],
  });
}

// ── /modrinth untrack ─────────────────────────────────────────────────────────

async function handleUntrack(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const input   = i.options.getString('project_id', true).trim();
  const guildId = i.guildId!;

  // Accept both slug and raw ID
  const projectId = (await resolveProjectId(input)) ?? input;

  const result = await pool.query(
    'DELETE FROM tracked_projects WHERE guild_id = $1 AND project_id = $2',
    [guildId, projectId],
  );

  if ((result.rowCount ?? 0) === 0) {
    await i.editReply({ embeds: [err(`No tracked project found matching \`${input}\`.`)] });
  } else {
    await i.editReply({ embeds: [ok(`Stopped tracking \`${input}\`.`)] });
  }
}

// ── /modrinth list ────────────────────────────────────────────────────────────

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const { rows } = await pool.query(
    'SELECT * FROM tracked_projects WHERE guild_id = $1 ORDER BY added_at ASC',
    [i.guildId!],
  );

  if (rows.length === 0) {
    await i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Blurple).setDescription('No projects are being tracked in this server.')] });
    return;
  }

  const lines = rows.map((r: any) => {
    const channels = [
      r.track_stable ? '✅ Stable' : null,
      r.track_beta   ? '🧪 Beta'   : null,
      r.track_alpha  ? '⚠️ Alpha'  : null,
    ].filter(Boolean).join(', ');
    const role = r.ping_role_id ? ` · <@&${r.ping_role_id}>` : '';
    return `**\`${r.project_id}\`** → <#${r.channel_id}>${role}\n  ${channels}`;
  });

  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(`Tracked projects (${rows.length})`)
    .setDescription(lines.join('\n\n'));

  await i.editReply({ embeds: [embed] });
}

// ── /modrinth set-channel ─────────────────────────────────────────────────────

async function handleSetChannel(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const input     = i.options.getString('project_id', true).trim();
  const channel   = i.options.getChannel('channel', true);
  const guildId   = i.guildId!;
  const projectId = (await resolveProjectId(input)) ?? input;

  const result = await pool.query(
    'UPDATE tracked_projects SET channel_id = $1 WHERE guild_id = $2 AND project_id = $3',
    [channel.id, guildId, projectId],
  );

  if ((result.rowCount ?? 0) === 0) {
    await i.editReply({ embeds: [err(`No tracked project found matching \`${input}\`.`)] });
  } else {
    await i.editReply({ embeds: [ok(`Updates for \`${input}\` will now post in <#${channel.id}>.`)] });
  }
}

// ── /modrinth set-role ────────────────────────────────────────────────────────

async function handleSetRole(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const input     = i.options.getString('project_id', true).trim();
  const role      = i.options.getRole('role');
  const guildId   = i.guildId!;
  const projectId = (await resolveProjectId(input)) ?? input;

  const result = await pool.query(
    'UPDATE tracked_projects SET ping_role_id = $1 WHERE guild_id = $2 AND project_id = $3',
    [role?.id ?? null, guildId, projectId],
  );

  if ((result.rowCount ?? 0) === 0) {
    await i.editReply({ embeds: [err(`No tracked project found matching \`${input}\`.`)] });
  } else {
    const msg = role ? `Ping role for \`${input}\` set to <@&${role.id}>.` : `Ping role for \`${input}\` cleared.`;
    await i.editReply({ embeds: [ok(msg)] });
  }
}

// ── /modrinth set-releases ────────────────────────────────────────────────────

async function handleSetReleases(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply({ ephemeral: true });

  const input     = i.options.getString('project_id', true).trim();
  const stable    = i.options.getBoolean('stable', true);
  const beta      = i.options.getBoolean('beta',   true);
  const alpha     = i.options.getBoolean('alpha',  true);
  const guildId   = i.guildId!;
  const projectId = (await resolveProjectId(input)) ?? input;

  if (!stable && !beta && !alpha) {
    await i.editReply({ embeds: [err('You must enable at least one release channel.')] });
    return;
  }

  const result = await pool.query(
    `UPDATE tracked_projects
     SET track_stable = $1, track_beta = $2, track_alpha = $3
     WHERE guild_id = $4 AND project_id = $5`,
    [stable, beta, alpha, guildId, projectId],
  );

  if ((result.rowCount ?? 0) === 0) {
    await i.editReply({ embeds: [err(`No tracked project found matching \`${input}\`.`)] });
  } else {
    const summary = [
      stable ? '✅ Stable' : null,
      beta   ? '🧪 Beta'   : null,
      alpha  ? '⚠️ Alpha'  : null,
    ].filter(Boolean).join(', ');
    await i.editReply({ embeds: [ok(`Release channels for \`${input}\` updated: ${summary}`)] });
  }
}
