import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { sendMessage, type ChannelName } from "../discord.js";

const VALID_CHANNELS = ["changelog", "announcements"] as const;

const bodySchema = {
  type: "object",
  required: ["channel", "content"],
  properties: {
    channel: { type: "string", enum: VALID_CHANNELS as unknown as string[] },
    content: { type: "string", minLength: 1, maxLength: 4000 },
  },
  additionalProperties: false,
} as const;

interface MessageBody {
  channel: ChannelName;
  content: string;
}

export async function messagesRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: MessageBody }>(
    "/api/messages",
    {
      schema: { body: bodySchema },
      preHandler: async (request, reply) => {
        const apiKey = request.headers["x-api-key"];
        if (apiKey !== config.api.key) {
          return reply.status(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request) => {
      const { channel, content } = request.body;
      const messageId = await sendMessage(channel, content);
      return { success: true, messageId };
    },
  );
}
