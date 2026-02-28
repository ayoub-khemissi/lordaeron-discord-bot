import Fastify from "fastify";
import { config } from "./config.js";
import { client } from "./discord.js";
import { messagesRoute } from "./routes/messages.js";

export async function startServer(): Promise<void> {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => ({
    status: "ok",
    discord: client.isReady() ? "connected" : "disconnected",
  }));

  await app.register(messagesRoute);

  await app.listen({ port: config.api.port, host: config.api.host });
  console.log(`HTTP server listening on ${config.api.host}:${config.api.port}`);
}
