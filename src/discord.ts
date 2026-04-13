import { Client, GatewayIntentBits, TextChannel, type Message } from "discord.js";
import { config, type ChannelName } from "./config.js";
import { setupSecurity } from "./security.js";
import { setupWelcome } from "./welcome.js";
import { setupAntispam } from "./antispam.js";
import { initLogger } from "./logger.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

export async function connectDiscord(): Promise<void> {
  initLogger(client);
  setupSecurity(client);
  setupWelcome(client);
  setupAntispam(client);

  return new Promise((resolve, reject) => {
    client.once("ready", () => {
      console.log(`Discord bot connected as ${client.user?.tag}`);
      resolve();
    });
    client.once("error", reject);
    client.login(config.discord.token).catch(reject);
  });
}

export async function sendMessage(
  channelName: ChannelName,
  content: string,
): Promise<string> {
  const channelId = config.discord.channels[channelName];
  const channel = await client.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel "${channelName}" (${channelId}) is not a text channel`);
  }

  const message = await channel.send(content);
  return message.id;
}

export async function editMessage(
  channelName: ChannelName,
  messageId: string,
  content: string,
): Promise<void> {
  const channelId = config.discord.channels[channelName];
  const channel = await client.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel "${channelName}" (${channelId}) is not a text channel`);
  }

  const message = await channel.messages.fetch(messageId);
  await message.edit(content);
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export async function getMessages(
  channelName: ChannelName,
  limit: number = 20,
  before?: string,
): Promise<DiscordMessage[]> {
  const channelId = config.discord.channels[channelName];
  const channel = await client.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel "${channelName}" (${channelId}) is not a text channel`);
  }

  const options: { limit: number; before?: string } = { limit };
  if (before) options.before = before;

  const messages = await channel.messages.fetch(options);

  return messages.map((m: Message) => ({
    id: m.id,
    content: m.content,
    author: m.author.tag,
    createdAt: m.createdAt.toISOString(),
  }));
}
