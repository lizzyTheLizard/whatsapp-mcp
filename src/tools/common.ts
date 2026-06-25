import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type CallToolResult, type ListResourcesResult, type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import z from 'zod'

export const toReadResource = (contents: ReadResourceResult['contents']) => ({ contents })
export const toListResource = (resources: ListResourcesResult['resources']) => ({ resources })
export const toCallResult = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: false })
export const toCallError = (error: Error): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true })

export function registerEntityResources<T>(
  server: McpServer,
  pluralType: string,
  singularType: string,
  getAll: () => T[],
  get: (id: string) => T | undefined,
  toUri: (entity: T) => string,
  toName: (entity: T) => string,
) {
  const toResource = (entity: T | undefined) =>
    entity ? [{ uri: toUri(entity), mimeType: 'application/json' as const, text: JSON.stringify(entity) }] : []

  server.registerResource(
    pluralType,
    `${pluralType}://app`,
    { title: `All WhatsApp ${pluralType}`, description: `List WhatsApp ${pluralType}`, mimeType: 'application/json' },
    () => toReadResource(getAll().flatMap(toResource)),
  )

  server.registerResource(
    singularType,
    new ResourceTemplate(`${pluralType}://app/{${singularType}Id}`, {
      list: () => toListResource(getAll().map(e => ({ uri: toUri(e), name: toName(e) }))),
    }),
    { title: `A single WhatsApp ${singularType}`, description: `Details of a single WhatsApp ${singularType}`, mimeType: 'application/json' },
    (_, params) => toReadResource(toResource(get(params[`${singularType}Id`] as string))),
  )
}

export const JidSchema = z.union([
  z.string().min(1, 'JID is required').endsWith('@s.whatsapp.net', 'JID not a valid WhatsApp JID)'),
  z.string().min(1, 'JID is required').endsWith('@g.us', 'JID not a valid WhatsApp JID)'),
]).describe('The JID of the recipient or chat. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group')
