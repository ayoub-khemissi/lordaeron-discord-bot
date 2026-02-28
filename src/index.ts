import { connectDiscord } from "./discord.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  console.log("Starting Lordaeron Discord Bot...");

  await connectDiscord();
  await startServer();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
