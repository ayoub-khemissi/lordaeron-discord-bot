import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { sendMessage, editMessage, getMessages, type ChannelName } from "../discord.js";

const VALID_CHANNELS = ["changelog", "announcements", "staff-logs", "staff-tickets"] as const;

const bodySchema = {
  type: "object",
  required: ["channel", "content"],
  properties: {
    channel: { type: "string", enum: VALID_CHANNELS as unknown as string[] },
    content: { type: "string", minLength: 1, maxLength: 4000 },
  },
  additionalProperties: false,
} as const;

const editBodySchema = {
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

interface EditParams {
  messageId: string;
}

interface GetQuery {
  channel: ChannelName;
  limit?: string;
  before?: string;
}

export async function messagesRoute(app: FastifyInstance): Promise<void> {
  const authHandler = async (request: { headers: { [key: string]: string | string[] | undefined } }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    const apiKey = request.headers["x-api-key"];
    if (apiKey !== config.api.key) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  };

  app.get<{ Querystring: GetQuery }>(
    "/api/messages",
    {
      preHandler: authHandler,
    },
    async (request) => {
      const { channel, limit, before } = request.query;
      if (!channel || !VALID_CHANNELS.includes(channel as typeof VALID_CHANNELS[number])) {
        return { error: "Invalid or missing channel query parameter" };
      }
      const messages = await getMessages(channel, limit ? Number(limit) : 20, before);
      return { success: true, messages };
    },
  );

  app.post<{ Body: MessageBody }>(
    "/api/messages",
    {
      schema: { body: bodySchema },
      preHandler: authHandler,
    },
    async (request) => {
      const { channel, content } = request.body;
      const messageId = await sendMessage(channel, content);
      return { success: true, messageId };
    },
  );

  app.patch<{ Body: MessageBody; Params: EditParams }>(
    "/api/messages/:messageId",
    {
      schema: { body: editBodySchema },
      preHandler: authHandler,
    },
    async (request) => {
      const { channel, content } = request.body;
      const { messageId } = request.params;
      await editMessage(channel, messageId, content);
      return { success: true, messageId };
    },
  );
}
