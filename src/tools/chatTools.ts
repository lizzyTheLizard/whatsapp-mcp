import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WhatsAppHandler } from '../core/handler.js'
import z from 'zod'
import { JidSchema, withErrorHandling } from './common.js'

export function registerChatTools(server: McpServer, sync: WhatsAppHandler) {
  server.registerTool('get_all_chats', { description: 'Retrieve all WhatsApp chats with their metadata', outputSchema: AllChatsSchema },
    () => withErrorHandling(sync, () => ({ chats: sync.getChats() })),
  )

  server.registerTool('set_chat_archived', { description: 'Set a WhatsApp chat as archived or unarchived', inputSchema: ArchiveChatSchema },
    args => withErrorHandling(sync, () => sync.setArchived(args.jid, args.archived).then(() => `Chat ${args.jid}: archived status set to ${String(args.archived)}`)),
  )

  server.registerTool('set_chat_read', { description: 'Set a WhatsApp chat as read or unread', inputSchema: ReadChatSchema },
    args => withErrorHandling(sync, () => sync.setRead(args.jid, args.read).then(() => `Chat ${args.jid}: read status set to ${String(args.read)}`)),
  )
}

const ArchiveChatSchema = z.object({
  jid: JidSchema.describe('The unique identifier (JID) of the chat'),
  archived: z.boolean()
    .describe('Whether the chat should be archived (true) or unarchived (false).'),
})

const ReadChatSchema = z.object({
  jid: JidSchema.describe('The unique identifier (JID) of the chat'),
  read: z.boolean()
    .describe('Whether the chat should be marked as read (true) or unread (false).'),
})

const AllChatsSchema = z.object({
  chats: z.array(z.object({
    jid: JidSchema.describe('The unique identifier (JID) of the chat'),
    unreadCount: z.number().describe('Number of unread messages in this chat'),
    readOnly: z.boolean().describe('Whether the chat is read-only'),
    name: z.string().describe('Display name of the chat'),
    archived: z.boolean().describe('Whether the chat is archived'),
    lastMessageTimestamp: z.number().describe('Unix timestamp of the last message'),
    isGroup: z.boolean().describe('Whether this is a group chat'),
  })),
}).describe('List of all WhatsApp chats')
