import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type WhatsAppHandler } from '../core/handler.js'
import z from 'zod'
import { JidSchema, withErrorHandling } from './common.js'

export function registerContactResources(server: McpServer, sync: WhatsAppHandler) {
  server.registerTool('get_all_contacts', { description: 'Retrieve all WhatsApp contacts', outputSchema: AllContactsSchema },
    async () => withErrorHandling(sync, () => ({ contacts: sync.getContacts() })),
  )
}

const AllContactsSchema = z.object({
  contacts: z.array(z.object({
    jid: JidSchema.describe('The unique identifier (JID) of the contact'),
    name: z.string().describe('Display name of the contact'),
    phone: z.string().describe('Phone number in international format'),
  })),
}).describe('List of all WhatsApp contacts')
