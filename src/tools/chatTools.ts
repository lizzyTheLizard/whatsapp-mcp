import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, registerEntityResources, withErrorHandling, toCallResult, toCallError } from './common.js'

export function registerChatTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerEntityResources(
    server, 'chats', 'chat',
    () => store.getChats(), id => store.getChat(id),
    c => `chats://app/${c.id}`, c => c.name ?? c.id,
    () => sync.getStatus(),
  )

  server.registerTool(
    'set_chat_archived',
    { description: 'Set a WhatsApp chat as archived or unarchived.', inputSchema: ArchiveChatSchema },
    async args => withErrorHandling(
      () => sync.getStatus(),
      () => sync.setArchived(args.jid, args.archived),
      () => toCallResult(`Chat ${args.jid} archived status set to ${String(args.archived)}`),
      e => toCallError(e),
    ),
  )

  server.registerTool(
    'set_chat_read',
    { description: 'Set a WhatsApp chat as read or unread.', inputSchema: ReadChatSchema },
    async args => withErrorHandling(
      () => sync.getStatus(),
      () => sync.setRead(args.jid, args.read),
      () => toCallResult(`Chat ${args.jid} read status set to ${String(args.read)}`),
      e => toCallError(e),
    ),
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
