import { REST, Routes } from 'discord.js';
import { data as modrinthCommand } from './commands/modrinth.js';

const token    = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;

const rest = new REST().setToken(token);

(async () => {
  console.log('Deploying slash commands…');
  await rest.put(Routes.applicationCommands(clientId), {
    body: [modrinthCommand.toJSON()],
  });
  console.log('Done.');
})();
