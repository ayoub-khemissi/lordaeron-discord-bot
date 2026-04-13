import { EmbedBuilder, TextChannel, type Client } from "discord.js";
import { config } from "./config.js";

type LogLevel = "info" | "warn" | "error";

const COLORS: Record<LogLevel, number> = {
  info: 0x3498db,  // blue
  warn: 0xf39c12,  // orange
  error: 0xe74c3c, // red
};

const ICONS: Record<LogLevel, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
};

let discordClient: Client | null = null;
let ready = false;

const pendingLogs: { level: LogLevel; module: string; message: string; details?: string }[] = [];

export function initLogger(client: Client): void {
  discordClient = client;
  client.once("ready", async () => {
    ready = true;
    // Flush pending logs that were queued before ready
    for (const log of pendingLogs) {
      await sendToDiscord(log.level, log.module, log.message, log.details);
    }
    pendingLogs.length = 0;
  });
}

async function sendToDiscord(
  level: LogLevel,
  module: string,
  message: string,
  details?: string,
): Promise<void> {
  if (!discordClient || !ready) return;

  try {
    const channelId = config.discord.channels["staff-logs"];
    if (!channelId) return;

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS[level])
      .setTitle(`${ICONS[level]} [${module.toUpperCase()}] ${message}`)
      .setTimestamp();

    if (details) {
      embed.setDescription(details.slice(0, 4000));
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    // Avoid infinite loop — only log to console if Discord logging fails
    console.error(`[logger] Failed to send log to Discord: ${err}`);
  }
}

function log(level: LogLevel, module: string, message: string, details?: string): void {
  // Always log to console
  const prefix = `[${module}]`;
  if (level === "error") {
    console.error(prefix, message, details ?? "");
  } else if (level === "warn") {
    console.warn(prefix, message, details ?? "");
  } else {
    console.log(prefix, message, details ?? "");
  }

  // Queue or send to Discord
  if (!ready) {
    pendingLogs.push({ level, module, message, details });
  } else {
    sendToDiscord(level, module, message, details);
  }
}

export const logger = {
  info: (module: string, message: string, details?: string) => log("info", module, message, details),
  warn: (module: string, message: string, details?: string) => log("warn", module, message, details),
  error: (module: string, message: string, details?: string) => log("error", module, message, details),
};
