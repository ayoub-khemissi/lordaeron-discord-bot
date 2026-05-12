import {
  Events,
  GuildChannel,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type Message,
  type TextBasedChannel,
} from "discord.js";
import { promises as fs } from "fs";
import path from "path";
import { logger } from "./logger.js";

/**
 * Window in which we look for cross-channel reposts of the same content.
 */
const WINDOW_MS = 60_000;

/**
 * Number of distinct channels with the same content before we consider
 * the account compromised (typical hijack flood pattern: same message
 * in welcome / general / suggestions / bug-reports / ...).
 */
const CHANNEL_THRESHOLD = 3;

/**
 * Ban duration applied to suspected hijacked accounts (24h). The user
 * is auto-unbanned after this delay; long enough that the real owner
 * has time to recover the account before they can rejoin.
 */
const BAN_DURATION_MS = 86_400_000;

/**
 * On ban, ask Discord to delete the last 24h of messages from this user
 * across all channels (max value Discord accepts).
 */
const BAN_MESSAGE_PURGE_SECONDS = 86_400;

/**
 * Discord invite link patterns. The Discord ToS prevents linking other
 * servers from non-partner guilds, and this is the dominant payload of
 * account-takeover floods.
 */
const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg)\/[a-zA-Z0-9-]+/i;

interface RecentPost {
  channelId: string;
  messageId: string;
  contentKey: string;
  timestamp: number;
}

interface PendingUnban {
  guildId: string;
  userId: string;
  unbanAt: number;
}

const recentByUser = new Map<string, RecentPost[]>();

const UNBAN_FILE = path.resolve("data/antihijack-unbans.json");

async function loadPendingUnbans(): Promise<PendingUnban[]> {
  try {
    const raw = await fs.readFile(UNBAN_FILE, "utf8");
    return JSON.parse(raw) as PendingUnban[];
  } catch {
    return [];
  }
}

async function savePendingUnbans(unbans: PendingUnban[]): Promise<void> {
  await fs.mkdir(path.dirname(UNBAN_FILE), { recursive: true });
  await fs.writeFile(UNBAN_FILE, JSON.stringify(unbans, null, 2));
}

async function scheduleUnban(client: Client, entry: PendingUnban): Promise<void> {
  const delay = Math.max(0, entry.unbanAt - Date.now());
  setTimeout(async () => {
    try {
      const guild = await client.guilds.fetch(entry.guildId);
      await guild.bans.remove(entry.userId, "Anti-hijack: auto-unban after 24h").catch(() => undefined);
      logger.info("antihijack", `Auto-unbanned user ${entry.userId}`);
    } catch (err) {
      logger.error("antihijack", `Failed to auto-unban ${entry.userId}`, String(err));
    } finally {
      const remaining = (await loadPendingUnbans()).filter(
        (e) => !(e.userId === entry.userId && e.guildId === entry.guildId),
      );
      await savePendingUnbans(remaining);
    }
  }, delay);
}

async function recordPendingUnban(client: Client, guildId: string, userId: string): Promise<void> {
  const entry: PendingUnban = { guildId, userId, unbanAt: Date.now() + BAN_DURATION_MS };
  const existing = (await loadPendingUnbans()).filter(
    (e) => !(e.userId === userId && e.guildId === guildId),
  );
  existing.push(entry);
  await savePendingUnbans(existing);
  await scheduleUnban(client, entry);
}

function normalizeContent(content: string): string {
  // Lowercase, strip whitespace, strip trailing punctuation; long enough
  // that the normalization is still distinctive but resilient to small
  // mutations like an extra exclamation mark.
  return content
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!?.]+$/g, "")
    .trim()
    .slice(0, 200);
}

function isExempt(message: Message): boolean {
  if (!message.member || !message.guild) return true;
  if (message.author.bot) return true;
  if (message.guild.ownerId === message.author.id) return true;
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

async function deletePost(client: Client, post: RecentPost): Promise<boolean> {
  try {
    const channel = (await client.channels.fetch(post.channelId)) as TextBasedChannel | null;
    if (!channel || !("messages" in channel)) return false;
    const msg = await channel.messages.fetch(post.messageId).catch(() => null);
    if (!msg) return false;
    await msg.delete();
    return true;
  } catch {
    return false;
  }
}

async function quarantine(
  message: Message,
  reason: string,
  posts: RecentPost[],
): Promise<void> {
  const client = message.client;
  const guild = message.guild as Guild;
  let deleted = 0;

  // Best-effort: delete the tracked posts from our local map. Discord's
  // ban API also purges the last 24h of messages, so this is mostly to
  // make removal instant rather than wait on Discord's async purge.
  for (const post of posts) {
    if (await deletePost(client, post)) deleted++;
  }

  // Ban with a 24h message-purge window. Discord bans are permanent by
  // default — we schedule an unban after BAN_DURATION_MS and persist the
  // schedule to disk so it survives bot restarts.
  let banned = false;
  try {
    if (guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await guild.bans.create(message.author.id, {
        reason: `Anti-hijack: ${reason}`,
        deleteMessageSeconds: BAN_MESSAGE_PURGE_SECONDS,
      });
      banned = true;
      await recordPendingUnban(client, guild.id, message.author.id);
    }
  } catch (err) {
    logger.error("antihijack", `Failed to ban ${message.author.tag}`, String(err));
  }

  recentByUser.delete(message.author.id);

  logger.warn(
    "antihijack",
    `${banned ? "Banned" : "Quarantine failed for"} ${message.author.tag} — ${reason}`,
    `User ID: ${message.author.id}\nMessages deleted locally: ${deleted}/${posts.length}\nBan: ${banned ? "yes, 24h auto-unban scheduled" : "no (missing permission?)"}\nSample: ${message.content.slice(0, 200)}`,
  );
}

async function resumePendingUnbans(client: Client): Promise<void> {
  const entries = await loadPendingUnbans();
  if (entries.length === 0) return;
  logger.info("antihijack", `Resuming ${entries.length} pending unban(s)`);
  for (const entry of entries) {
    await scheduleUnban(client, entry);
  }
}

export function setupAntihijack(client: Client): void {
  client.once(Events.ClientReady, () => {
    resumePendingUnbans(client).catch((err) =>
      logger.error("antihijack", `Failed to resume pending unbans`, String(err)),
    );
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    if (isExempt(message)) return;
    if (!message.content) return;

    const now = Date.now();
    const userId = message.author.id;
    const contentKey = normalizeContent(message.content);
    const hasInvite = INVITE_REGEX.test(message.content);

    // 1) Always strip Discord-invite links from non-exempt users. This
    //    is the highest-signal payload for hijack floods.
    if (hasInvite) {
      try {
        await message.delete();
        const channelName =
          message.channel instanceof GuildChannel ? `#${message.channel.name}` : "DM";
        logger.warn(
          "antihijack",
          `Removed Discord invite from ${message.author.tag}`,
          `Channel: ${channelName}\nContent: ${message.content.slice(0, 200)}`,
        );
      } catch (err) {
        logger.error("antihijack", `Failed to delete invite message`, String(err));
      }
      // Fall through so the message still counts toward cross-channel detection.
    }

    // 2) Track this post and look for the same content reposted across
    //    multiple channels in the rolling window.
    const history = (recentByUser.get(userId) ?? []).filter((p) => now - p.timestamp < WINDOW_MS);
    history.push({
      channelId: message.channel.id,
      messageId: message.id,
      contentKey,
      timestamp: now,
    });
    recentByUser.set(userId, history);

    const sameContent = history.filter((p) => p.contentKey === contentKey);
    const distinctChannels = new Set(sameContent.map((p) => p.channelId));

    if (distinctChannels.size >= CHANNEL_THRESHOLD) {
      const reason = hasInvite
        ? `invite flood across ${distinctChannels.size} channels`
        : `repost flood across ${distinctChannels.size} channels`;
      await quarantine(message, reason, sameContent);
    } else if (hasInvite && distinctChannels.size >= 2) {
      // Lower threshold when the payload is a Discord invite — two channels
      // with the same invite link is already overwhelmingly malicious.
      await quarantine(message, `invite link in ${distinctChannels.size} channels`, sameContent);
    }
  });

  setInterval(() => {
    const now = Date.now();
    for (const [userId, posts] of recentByUser) {
      const recent = posts.filter((p) => now - p.timestamp < WINDOW_MS);
      if (recent.length === 0) recentByUser.delete(userId);
      else recentByUser.set(userId, recent);
    }
  }, 30_000);
}
