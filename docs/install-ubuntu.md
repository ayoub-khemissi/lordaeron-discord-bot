# Ubuntu Server Installation

Step-by-step guide to deploy the Lordaeron Discord Bot on Ubuntu (22.04+).

## Prerequisites

### Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### pnpm

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### pm2

```bash
npm install -g pm2
pm2 startup  # follow the printed command to enable auto-start on reboot
```

## Setup

### 1. Clone the repository

```bash
cd /home/ubuntu/lordaeron
git clone git@github.com:ayoub-khemissi/lordaeron-discord-bot.git
cd lordaeron-discord-bot
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in the required values:

| Variable | Description | Required |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from the [Developer Portal](https://discord.com/developers/applications) | Yes |
| `DISCORD_CHANNEL_CHANGELOG` | Channel ID for changelog messages | Yes |
| `DISCORD_CHANNEL_ANNOUNCEMENTS` | Channel ID for announcement messages | Yes |
| `BOT_API_KEY` | Shared secret for API authentication | Yes |
| `BOT_API_PORT` | HTTP server port (default: `3100`) | No |
| `BOT_API_HOST` | HTTP server host (default: `127.0.0.1`) | No |

Generate a secure API key:

```bash
openssl rand -hex 32
```

### 4. Build

```bash
pnpm build
```

### 5. Test manually

```bash
pnpm start
```

In another terminal:

```bash
curl http://127.0.0.1:3100/api/health
```

You should see `{"status":"ok","discord":"connected"}`. Stop the process with `Ctrl+C`.

## Running with pm2

### Start the bot

```bash
pm2 start dist/index.js --name lordaeron-discord-bot --node-args="--env-file=.env"
```

### Save the process list

```bash
pm2 save
```

### Useful commands

```bash
pm2 status                          # list all processes
pm2 logs lordaeron-discord-bot      # tail logs
pm2 restart lordaeron-discord-bot   # restart
pm2 stop lordaeron-discord-bot      # stop
pm2 delete lordaeron-discord-bot    # remove from pm2
```

## Deploy Strategy

### Manual deploy (SSH)

Connect to the server and run:

```bash
cd /home/ubuntu/lordaeron/lordaeron-discord-bot
git pull
pnpm install
pnpm build
pm2 restart lordaeron-discord-bot
```

### One-liner deploy

```bash
ssh ubuntu@<server-ip> "cd /home/ubuntu/lordaeron/lordaeron-discord-bot && git pull && pnpm install && pnpm build && pm2 restart lordaeron-discord-bot"
```

### Deploy script

A `deploy.sh` script is available at the project root:

```bash
./deploy.sh
```

### Rollback

If a deploy introduces a bug, revert to the previous commit and redeploy:

```bash
cd /home/ubuntu/lordaeron/lordaeron-discord-bot
git log --oneline -5            # find the last good commit
git revert HEAD                 # revert the bad commit (keeps history clean)
pnpm install
pnpm build
pm2 restart lordaeron-discord-bot
```

### Post-deploy verification

After every deploy, verify the bot is healthy:

```bash
pm2 status lordaeron-discord-bot   # should show "online", 0 restarts
curl http://127.0.0.1:3100/api/health  # should return {"status":"ok","discord":"connected"}
```
