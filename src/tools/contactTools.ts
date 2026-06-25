import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppStore } from '../store.js'
import { type WhatsAppHandler } from '../sync.js'
import { registerEntityResources } from './common.js'

export function registerContactResources(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerEntityResources(
    server, 'contacts', 'contact',
    () => store.getContacts(), id => store.getContact(id),
    c => `contacts://app/${c.id}`, c => c.name ?? c.id,
    () => sync.getStatus(),
  )
}
