import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { config, type ChannelName } from "./config.js";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

export async function connectDiscord(): Promise<void> {
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
