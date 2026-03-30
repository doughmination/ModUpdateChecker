import { Client, GatewayIntentBits, Interaction } from 'discord.js';
import { initDb } from './db/index.js';
import { startPoller } from './lib/poller.js';
import { data as modrinthCommand, execute as modrinthExecute } from './commands/modrinth.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);
  await initDb();
  await startPoller(client);
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'modrinth') {
    await modrinthExecute(interaction).catch(err => {
      console.error('[Command] Error in /modrinth:', err);
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
