import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, registerEntityResources, registerTool } from './common.js'

export function registerChatTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerEntityResources(
    server, 'chats', 'chat',
    () => store.getChats(),
    id => store.getChat(id),
    c => `chats://app/${c.id}`,
    c => c.name ?? c.id,
    () => sync.getStatus(),
  )

  registerTool<z.infer<typeof ArchiveChatSchema>>(
    server,
    'set_chat_archived',
    ArchiveChatSchema,
    'Set a WhatsApp chat as archived or unarchived.',
    async (args) => { await sync.setArchived(args.jid, args.archived); return `Chat ${args.jid} archived status set to ${String(args.archived)}` },
    () => sync.getStatus(),
  )

  registerTool<z.infer<typeof ReadChatSchema>>(
    server,
    'set_chat_read',
    ReadChatSchema,
    'Set a WhatsApp chat as read or unread.',
    async (args) => { await sync.setRead(args.jid, args.read); return `Chat ${args.jid} read status set to ${String(args.read)}` },
    () => sync.getStatus(),
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
