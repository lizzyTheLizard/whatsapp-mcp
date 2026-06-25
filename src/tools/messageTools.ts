import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, registerEntityResources, registerTool } from './common.js'

export function registerMessageTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerEntityResources(
    server, 'messages', 'message',
    () => store.getMessages(), id => store.getMessage(id),
    m => `messages://app/${m.key.id}`, m => m.key.id,
    () => sync.getStatus(),
  )

  registerTool<z.infer<typeof SendMessageSchema>>(
    server,
    'send_message',
    SendMessageSchema,
    'Send a WhatsApp-Message to a given JID.',
    async (args) => { await sync.sendMessage(args.jid, args.message); return `Message sent to ${args.jid}: "${args.message}"` },
    () => sync.getStatus(),
  )
}

const SendMessageSchema = z.object({
  jid: JidSchema,
  message: z.string()
    .min(1, 'Message body is required')
    .describe('The body of the message to be sent. Can contain unicode characters like emojis.'),
})
