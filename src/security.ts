import {
  Events,
  GuildChannel,
  PermissionFlagsBits,
  type Client,
  type GuildBasedChannel,
  type Message,
} from "discord.js";
import { logger } from "./logger.js";

/** Max user mentions allowed per message (0 = no user mentions allowed) */
const mentionLimit = Number(process.env.DISCORD_MENTION_LIMIT ?? 3);

/** Role IDs exempt from mention restrictions (comma-separated in env) */
const exemptRoleIds = (process.env.DISCORD_EXEMPT_ROLE_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * Deny @everyone and @here for the @everyone role on a single channel.
 * Returns true if the permission was changed, false if already locked.
 */
async function lockChannel(channel: GuildBasedChannel): Promise<boolean> {
  // Only process text-like channels (text, voice, forum, announcement, stage, category)
  if (!("permissionOverwrites" in channel)) return false;

  const guildChannel = channel as GuildChannel;
  const everyoneRoleId = guildChannel.guild.roles.everyone.id;
  const existing = guildChannel.permissionOverwrites.cache.get(everyoneRoleId);

  // Already denied
  if (existing?.deny.has(PermissionFlagsBits.MentionEveryone)) return false;

  await guildChannel.permissionOverwrites.edit(everyoneRoleId, {
    MentionEveryone: false, // false = deny
  });

  return true;
}

/**
 * Lock down all channels in a guild.
 * Returns the number of channels that were modified.
 */
async function lockAllChannels(client: Client): Promise<number> {
  let modified = 0;

  for (const guild of client.guilds.cache.values()) {
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
      if (!channel) continue;
      try {
        if (await lockChannel(channel)) {
          logger.info("security", `Locked @everyone mentions in #${channel.name}`);
          modified++;
        }
      } catch (err) {
        logger.error("security", `Failed to lock #${channel.name}`, String(err));
      }
    }
  }

  return modified;
}

/**
 * Check if a member has an exempt role.
 */
function isExempt(message: Message): boolean {
  if (!message.member) return false;
  // Server owner is always exempt
  if (message.guild?.ownerId === message.author.id) return true;
  // Admins are always exempt
  if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  // Check exempt roles
  return message.member.roles.cache.some((role) => exemptRoleIds.includes(role.id));
}

/**
 * Register all security event handlers on the client.
 */
export function setupSecurity(client: Client): void {
  // ── On ready: lock all existing channels ──
  client.once(Events.ClientReady, async () => {
    logger.info("security", "Auditing channel permissions...");
    const count = await lockAllChannels(client);
    logger.info("security", `Startup audit complete — ${count} channel(s) updated`);
  });

  // ── Auto-lock new channels ──
  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) return;
    try {
      const changed = await lockChannel(channel);
      if (changed) {
        logger.info("security", `Auto-locked new channel #${channel.name}`);
      }
    } catch (err) {
      logger.error("security", `Failed to auto-lock #${channel.name}`, String(err));
    }
  });

  // ── Mention abuse detection ──
  client.on(Events.MessageCreate, async (message) => {
    // Ignore bots
    if (message.author.bot) return;
    if (!message.guild) return;

    // Check if member is exempt
    if (isExempt(message)) return;

    // Check for @everyone / @here that somehow got through (e.g. via API)
    if (message.mentions.everyone) {
      try {
        await message.delete();
        const channelName = (message.channel as GuildChannel).name;
        logger.warn(
          "security",
          `Deleted @everyone message from ${message.author.tag}`,
          `Channel: #${channelName}\nContent: ${message.content.slice(0, 200)}`,
        );
      } catch (err) {
        logger.error("security", `Failed to delete @everyone message`, String(err));
      }
      return;
    }

    // Check excessive user mentions
    if (mentionLimit > 0 && message.mentions.users.size > mentionLimit) {
      try {
        await message.delete();
        await message.channel.send({
          content: `<@${message.author.id}>, you cannot mention more than ${mentionLimit} users in a single message.`,
        });
        logger.warn(
          "security",
          `Blocked ${message.mentions.users.size} mentions from ${message.author.tag}`,
          `Channel: #${(message.channel as GuildChannel).name}\nMentioned: ${message.mentions.users.map((u) => u.tag).join(", ")}`,
        );
      } catch (err) {
        logger.error("security", `Failed to handle mention abuse`, String(err));
      }
    }
  });
}
