# Ubuntu Server Installation

Step-by-step guide to deploy the Lordaeron Discord Bot on Ubuntu (22.04+).

## Prerequisites

### Node.js 22+

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### pnpm

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## Setup

### 1. Clone the repository

```bash
cd /opt
sudo git clone git@github.com:ayoub-khemissi/lordaeron-discord-bot.git
sudo chown -R $USER:$USER lordaeron-discord-bot
cd lordaeron-discord-bot
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
nano .env
```

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

## Running as a Service

### Create a systemd unit

```bash
sudo nano /etc/systemd/system/lordaeron-discord-bot.service
```

Paste the following:

```ini
[Unit]
Description=Lordaeron Discord Bot
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/lordaeron-discord-bot
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/lordaeron-discord-bot/.env

[Install]
WantedBy=multi-user.target
```

### Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable lordaeron-discord-bot
sudo systemctl start lordaeron-discord-bot
```

### Check status

```bash
sudo systemctl status lordaeron-discord-bot
sudo journalctl -u lordaeron-discord-bot -f
```

## Updating

```bash
cd /opt/lordaeron-discord-bot
git pull
pnpm install
pnpm build
sudo systemctl restart lordaeron-discord-bot
```
