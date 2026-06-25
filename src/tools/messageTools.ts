import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'
import { type WAMessage } from '@whiskeysockets/baileys'
import { JidSchema, registerEntityResources, toCallResult, toCallError } from './common.js'

export function registerMessageTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerEntityResources(
    server, 'messages', 'message',
    () => store.getMessages(), id => store.getMessage(id),
    m => `messages://app/${m.key.id}`, m => m.key.id,
  )

  server.registerTool(
    'send_message',
    { description: 'Send a WhatsApp-Message to a given JID.', inputSchema: SendMessageSchema },
    async (args) => {
      try {
        const message: WAMessage = await sync.sendMessage(args.jid, args.message)
        return toCallResult(`Message sent to ${message.key.remoteJid ?? 'unknown'}: "${message.message?.conversation ?? 'unknown'}"`)
      }
      catch (error) {
        return toCallError(error as Error)
      }
    },
  )
}

const SendMessageSchema = z.object({
  jid: JidSchema,
  message: z.string()
    .min(1, 'Message body is required')
    .describe('The body of the message to be sent. Can contain unicode characters like emojis.'),
})
