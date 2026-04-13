import { Events, GuildMember, type Client } from "discord.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const AUTO_ROLE_ID = process.env.DISCORD_AUTO_ROLE_ID ?? "";
const WELCOME_CHANNEL = config.discord.channels["announcements"];

/**
 * Auto-assign role on join + send welcome message.
 */
export function setupWelcome(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    // Auto-role
    if (AUTO_ROLE_ID) {
      try {
        await member.roles.add(AUTO_ROLE_ID);
        logger.info("welcome", `Assigned auto-role to ${member.user.tag}`);
      } catch (err) {
        logger.error("welcome", `Failed to assign role to ${member.user.tag}`, String(err));
      }
    }

    // Welcome message
    try {
      const channel = await client.channels.fetch(WELCOME_CHANNEL);
      if (channel?.isTextBased() && "send" in channel) {
        await channel.send(
          `Welcome to **Lordaeron**, ${member}! Check out <#${config.discord.channels["announcements"]}> for the latest news and <#1189077923530027078> for the server rules.`,
        );
      }
    } catch (err) {
      logger.error("welcome", `Failed to send welcome message`, String(err));
    }
  });
}
