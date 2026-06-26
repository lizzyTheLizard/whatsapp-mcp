import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { JidSchema, toCallError, toStructuredOutput, toTextResult, withErrorHandling } from './common.js'

export function registerMessageTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  server.registerTool('send_message', { description: 'Send a WhatsApp-Message to a given JID', inputSchema: SendMessageSchema },
    async args => withErrorHandling(
      () => sync.getStatus(),
      async () => { await sync.sendMessage(args.jid, args.message); return toTextResult(`Message sent to ${args.jid}: "${args.message}"`) },
      e => toCallError(e),
    ),
  )

  server.registerTool('get_all_messages', { description: 'Get all WhatsApp messages' },
    async () => withErrorHandling(
      () => sync.getStatus(),
      () => toStructuredOutput({ messages: store.getMessages() }),
      e => toCallError(e),
    ),
  )

  server.registerTool('get_all_messages_for_chat', { description: 'Get all WhatsApp messages for a specific chat', inputSchema: JidSchema },
    async args => withErrorHandling(
      () => sync.getStatus(),
      () => toStructuredOutput({ messages: store.getMessages().filter(m => m.key.remoteJid === args) }),
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
