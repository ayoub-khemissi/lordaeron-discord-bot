#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Pulling latest changes..."
git pull

echo "Installing dependencies..."
pnpm install

echo "Building..."
pnpm build

echo "Restarting pm2 process..."
pm2 restart lordaeron-discord-bot

echo "Verifying health..."
sleep 3
STATUS=$(pm2 jlist | node -e "
  const procs = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const bot = procs.find(p => p.name === 'lordaeron-discord-bot');
  console.log(bot?.pm2_env?.status ?? 'not found');
")

if [ "$STATUS" = "online" ]; then
  echo "Deploy successful - bot is online"
else
  echo "WARNING: bot status is '$STATUS'"
  exit 1
fi
