#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "whatsapp-mcp", version: "0.1.0" });

const SendMessageSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
  message: z.string().min(1, "Message body is required"),
});

const ListChatsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
});

const ReadMessagesSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  limit: z.number().int().positive().optional().default(50),
});

server.registerTool(
  "send_message",
  {
    description: "Send a WhatsApp message to a recipient",
    inputSchema: SendMessageSchema,
  },
  async ({ to, message }) => ({
    content: [
      {
        type: "text" as const,
        text: `Message would be sent to ${to}: "${message}" (not yet implemented)`,
      },
    ],
  }),
);

server.registerTool(
  "list_chats",
  {
    description: "List recent WhatsApp chats",
    inputSchema: ListChatsSchema,
  },
  async ({ limit }) => ({
    content: [
      {
        type: "text" as const,
        text: `Listing up to ${limit} chats (not yet implemented)`,
      },
    ],
  }),
);

server.registerTool(
  "read_messages",
  {
    description: "Read messages from a WhatsApp chat",
    inputSchema: ReadMessagesSchema,
  },
  async ({ chatId, limit }) => ({
    content: [
      {
        type: "text" as const,
        text: `Reading up to ${limit} messages from ${chatId} (not yet implemented)`,
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("whatsapp-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
