import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, registerEntityResources, withErrorHandling, toCallResult, toCallError } from './common.js'

export function registerMessageTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerEntityResources(
    server, 'messages', 'message',
    () => store.getMessages(), id => store.getMessage(id),
    m => `messages://app/${m.key.id}`, m => m.key.id,
    () => sync.getStatus(),
  )

  server.registerTool(
    'send_message',
    { description: 'Send a WhatsApp-Message to a given JID.', inputSchema: SendMessageSchema },
    async args => withErrorHandling(
      () => sync.getStatus(),
      () => sync.sendMessage(args.jid, args.message),
      msg => toCallResult(`Message sent to ${msg.key.remoteJid ?? 'unknown'}: "${msg.message?.conversation ?? 'unknown'}"`),
      e => toCallError(e),
    ),
  )
}

const SendMessageSchema = z.object({
  jid: JidSchema,
  message: z.string()
    .min(1, 'Message body is required')
    .describe('The body of the message to be sent. Can contain unicode characters like emojis.'),
})
