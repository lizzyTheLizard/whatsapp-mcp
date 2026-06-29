import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { type WhatsAppHandler } from '../sync.js'
import { withErrorHandling } from './common.js'

export function registerContactResources(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  // TODO OutputSchema and better description for this tool
  server.registerTool('get_all_contacts', { description: 'Get all WhatsApp contacts' },
    async () => withErrorHandling(sync, () => ({ contacts: store.getContacts() })),

  )
}
