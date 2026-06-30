import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, withErrorHandling } from './common.js'

export function registerMessageTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  server.registerTool('send_message', { description: 'Send a WhatsApp-Message to a given JID', inputSchema: SendMessageSchema },
    async args => withErrorHandling(sync, () => sync.sendMessage(args.jid, args.message).then(() => `Message sent to ${args.jid}: "${args.message}"`)),
  )

  server.registerTool('get_all_messages', { description: 'Retrieve all WhatsApp messages across all chats. This can return a large amount of data.', outputSchema: AllMessagesSchema },
    async () => withErrorHandling(sync, () => ({ messages: store.getMessages() })),
  )

  server.registerTool('get_all_messages_for_chat', { description: 'Retrieve all WhatsApp messages for a specific chat.', inputSchema: GetChatMessagesSchema, outputSchema: AllMessagesSchema },
    async args => withErrorHandling(sync, () => ({ messages: store.getMessagesForChat(args.jid) })),
  )
}

const SendMessageSchema = z.object({
  jid: JidSchema.describe('The JID of the recipient. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group'),
  message: z.string()
    .min(1, 'Message body is required')
    .describe('The body of the message to be sent. Can contain unicode characters like emojis.'),
})

const GetChatMessagesSchema = z.object({
  jid: JidSchema.describe('The JID of the chat. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group'),
})

const AllMessagesSchema = z.object({
  messages: z.array(z.object({
    id: z.string().describe('Unique identifier of the message'),
    from: z.object({
      jid: JidSchema.describe('The JID of the sender'),
      name: z.string().describe('Display name of the sender'),
      phone: z.string().optional().describe('Phone number of the sender in international format'),
    }).describe('Sender information (undefined if the message was sent by you)').optional(),
    message: z.string().describe('Text content of the message'),
    messageTimestamp: z.number().describe('Unix timestamp of when the message was sent'),
  })),
}).describe('List of all WhatsApp messages across all chats')
