# Lordaeron Discord Bot

A Discord bot that posts messages (changelogs, announcements, status updates) to configurable channels. It exposes a REST API so other services (e.g. the Lordaeron front-end) can trigger messages programmatically.

## Features

- **REST API** — `POST /api/messages` to send messages to Discord channels
- **Health check** — `GET /api/health` to monitor bot and connection status
- **API key auth** — simple `X-API-Key` header for internal service-to-service calls
- **Configurable channels** — add a channel with 1 env var + 1 line of code
- **Security module** (`src/security.ts`) — on startup, audits all channels and denies `MentionEveryone` on the @everyone role. Auto-locks new channels on creation. Detects @everyone abuse and excessive user mentions (configurable threshold via `DISCORD_MENTION_LIMIT`, default 3). Exempt roles configurable via `DISCORD_EXEMPT_ROLE_IDS`.
- **Welcome module** (`src/welcome.ts`) — sends a welcome message when a new member joins and auto-assigns a role (configurable via `DISCORD_AUTO_ROLE_ID`).
- **Anti-spam module** (`src/antispam.ts`) — detects message spam (5 messages in 5 seconds), times out the spammer for 60 seconds, and bulk-deletes their spam messages. Exempt: bots, admins, and users with `ManageMessages`.

## Tech Stack

- Node.js + TypeScript (strict, ESM)
- [discord.js](https://discord.js.org/) v14
- [Fastify](https://fastify.dev/) v5
- tsup (build) + tsx (dev)
- pnpm

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and fill environment variables
cp .env.example .env

# Development (watch mode)
pnpm dev

# Production build
pnpm build
pnpm start
```

See [docs/install-ubuntu.md](docs/install-ubuntu.md) for a full Ubuntu server setup guide.

## Discord Developer Portal

The bot requires the following Gateway Intents enabled in the [Discord Developer Portal](https://discord.com/developers/applications) under **Bot > Privileged Gateway Intents**:

- `Guilds` (default)
- `GuildMessages` (default)
- **`GuildMembers`** (privileged -- must be enabled manually)
- **`MessageContent`** (privileged -- must be enabled manually)

The last two are required by the welcome, security, and anti-spam modules.

## Configuration

| Variable | Description | Required |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Discord bot token from the [Developer Portal](https://discord.com/developers/applications) | Yes |
| `DISCORD_CHANNEL_CHANGELOG` | Channel ID for changelog messages | Yes |
| `DISCORD_CHANNEL_ANNOUNCEMENTS` | Channel ID for announcement messages | Yes |
| `DISCORD_CHANNEL_STAFF_LOGS` | Channel ID for staff log messages | Yes |
| `DISCORD_CHANNEL_STAFF_TICKETS` | Channel ID for staff ticket messages | Yes |
| `DISCORD_STAFF_ROLE_ID` | Role ID for staff members | Yes |
| `DISCORD_AUTO_ROLE_ID` | Role ID to auto-assign to new members (welcome module) | Yes |
| `DISCORD_MENTION_LIMIT` | Max user mentions before the security module acts (default: `3`) | No |
| `DISCORD_EXEMPT_ROLE_IDS` | Comma-separated role IDs exempt from security checks | No |
| `BOT_API_KEY` | Shared secret for API authentication | Yes |
| `BOT_API_PORT` | HTTP server port (default: `3100`) | No |
| `BOT_API_HOST` | HTTP server host (default: `127.0.0.1`) | No |

### Adding a new channel

1. Add `DISCORD_CHANNEL_<NAME>=<id>` to `.env`
2. Add the mapping in `src/config.ts` (`channelMap` object)

## API

### `POST /api/messages`

Send a message to a Discord channel. Requires `X-API-Key` header.

```bash
curl -X POST http://127.0.0.1:3100/api/messages \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"channel": "changelog", "content": "## Patch 1.2\n- Fixed Wintergrasp"}'
```

**Response:**
```json
{ "success": true, "messageId": "123456789" }
```

### `GET /api/messages`

Retrieve previous messages from a channel. Useful to check context and avoid duplicates. Requires `X-API-Key` header.

```bash
curl http://127.0.0.1:3100/api/messages?channel=changelog&limit=5 \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{ "success": true, "messages": [{ "id": "123", "content": "...", "author": "Lordaeron#2440", "createdAt": "..." }] }
```

Optional query parameters: `limit` (default 20), `before` (message ID for pagination).

### `PATCH /api/messages/:messageId`

Edit an existing message. Requires `X-API-Key` header.

```bash
curl -X PATCH http://127.0.0.1:3100/api/messages/123456789 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"channel": "changelog", "content": "## Patch 1.2 (updated)\n- Fixed Wintergrasp"}'
```

**Response:**
```json
{ "success": true, "messageId": "123456789" }
```

### `GET /api/health`

Check bot status. No authentication required.

```bash
curl http://127.0.0.1:3100/api/health
```

**Response:**
```json
{ "status": "ok", "discord": "connected" }
```

## Usage from Other Services

```typescript
await fetch("http://127.0.0.1:3100/api/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.DISCORD_BOT_API_KEY!,
  },
  body: JSON.stringify({
    channel: "changelog",
    content: "## Patch Notes v1.2\n- Fixed Wintergrasp",
  }),
});
```
