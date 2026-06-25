import { McpServer } from '@modelcontextprotocol/sdk/server/mcp'
import { type WhatsAppStore } from '../store.js'
import { registerEntityResources } from './common.js'

export function registerContactResources(server: McpServer, store: WhatsAppStore) {
  registerEntityResources(
    server, 'contacts', 'contact',
    () => store.getContacts(), id => store.getContact(id),
    c => `contacts://app/${c.id}`, c => c.name ?? c.id,
  )
}
