function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const channelMap = {
  changelog: "DISCORD_CHANNEL_CHANGELOG",
  announcements: "DISCORD_CHANNEL_ANNOUNCEMENTS",
  alerts: "DISCORD_CHANNEL_ALERTS",
  tickets: "DISCORD_CHANNEL_TICKETS",
  "staff-logs": "DISCORD_CHANNEL_STAFF_LOGS",
  "staff-tickets": "DISCORD_CHANNEL_STAFF_TICKETS",
} as const;

export type ChannelName = keyof typeof channelMap;

export const config = {
  discord: {
    token: required("DISCORD_BOT_TOKEN"),
    channels: Object.fromEntries(
      Object.entries(channelMap).map(([name, envVar]) => [name, required(envVar)]),
    ) as Record<ChannelName, string>,
  },
  staffRoleId: process.env.DISCORD_STAFF_ROLE_ID ?? "",
  api: {
    port: Number(process.env.BOT_API_PORT ?? 3100),
    host: process.env.BOT_API_HOST ?? "127.0.0.1",
    key: required("BOT_API_KEY"),
  },
};
