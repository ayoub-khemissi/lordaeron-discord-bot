import {
  Events,
  GuildChannel,
  PermissionFlagsBits,
  type Client,
  type Message,
} from "discord.js";
import { logger } from "./logger.js";

/** Messages within this window (ms) to trigger spam detection */
const WINDOW_MS = 5_000;
/** Number of messages in the window to consider spam */
const SPAM_THRESHOLD = 5;
/** Timeout duration in seconds for spammers */
const TIMEOUT_SECONDS = 60;

const messageLog = new Map<string, number[]>();

function isExempt(message: Message): boolean {
  if (!message.member || !message.guild) return true;
  if (message.author.bot) return true;
  if (message.guild.ownerId === message.author.id) return true;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

export function setupAntispam(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (isExempt(message)) return;

    const now = Date.now();
    const userId = message.author.id;

    // Track message timestamps
    const timestamps = messageLog.get(userId) ?? [];
    timestamps.push(now);

    // Keep only messages within the window
    const recent = timestamps.filter((t) => now - t < WINDOW_MS);
    messageLog.set(userId, recent);

    if (recent.length >= SPAM_THRESHOLD) {
      try {
        // Timeout the user
        if (message.member?.moderatable) {
          await message.member.timeout(TIMEOUT_SECONDS * 1000, "Spam detection");
        }

        // Delete recent messages from this user in this channel
        const channelMessages = await message.channel.messages.fetch({ limit: 20 });
        const spamMessages = channelMessages.filter(
          (m) => m.author.id === userId && now - m.createdTimestamp < WINDOW_MS,
        );

        if (spamMessages.size > 1 && "bulkDelete" in message.channel) {
          await message.channel.bulkDelete(spamMessages);
        }

        // Clear their log
        messageLog.delete(userId);

        const channelName =
          message.channel instanceof GuildChannel ? `#${message.channel.name}` : "DM";
        logger.warn(
          "antispam",
          `Timed out ${message.author.tag} for ${TIMEOUT_SECONDS}s`,
          `Channel: ${channelName}\nMessages deleted: ${spamMessages.size}`,
        );
      } catch (err) {
        logger.error("antispam", `Failed to handle spam from ${message.author.tag}`, String(err));
      }
    }
  });

  // Clean up old entries every 30 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of messageLog) {
      const recent = timestamps.filter((t) => now - t < WINDOW_MS);
      if (recent.length === 0) {
        messageLog.delete(userId);
      } else {
        messageLog.set(userId, recent);
      }
    }
  }, 30_000);
}
