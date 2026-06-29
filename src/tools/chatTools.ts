import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, withErrorHandling } from './common.js'

export function registerChatTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  // TODO OutputSchema and better description for this tool
  server.registerTool('get_all_chats', { description: 'Get all WhatsApp chats' },
    () => withErrorHandling(sync, () => ({ chats: store.getChats() })),
  )

  server.registerTool('set_chat_archived', { description: 'Set a WhatsApp chat as archived or unarchived', inputSchema: ArchiveChatSchema },
    args => withErrorHandling(sync, () => sync.setArchived(args.jid, args.archived).then(() => `Chat ${args.jid}: archived status set to ${String(args.archived)}`)),
  )

  server.registerTool('set_chat_read', { description: 'Set a WhatsApp chat as read or unread', inputSchema: ReadChatSchema },
    args => withErrorHandling(sync, () => sync.setRead(args.jid, args.read).then(() => `Chat ${args.jid}: read status set to ${String(args.read)}`)),
  )
}

const ArchiveChatSchema = z.object({
  jid: JidSchema,
  archived: z.boolean()
    .describe('Whether the chat should be archived (true) or unarchived (false).'),
})

const ReadChatSchema = z.object({
  jid: JidSchema,
  read: z.boolean()
    .describe('Whether the chat should be marked as read (true) or unread (false).'),
})
