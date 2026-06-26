import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { type WhatsAppHandler } from '../sync.js'
import { toCallError, toStructuredOutput, withErrorHandling } from './common.js'

export function registerContactResources(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  server.registerTool('get_all_contacts', { description: 'Get all WhatsApp contacts' },
    async () => withErrorHandling(
      () => sync.getStatus(),
      () => toStructuredOutput({ contacts: store.getContacts() }),
      e => toCallError(e),
    ),
  )
}
