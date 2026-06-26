import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type CallToolResult, type ListResourcesResult, type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { type SyncStatus } from '../sync.js'
import z, { ZodType } from 'zod'
import { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'

export const JidSchema = z.union([
  z.string().min(1, 'JID is required').endsWith('@s.whatsapp.net', 'JID not a valid WhatsApp JID)'),
  z.string().min(1, 'JID is required').endsWith('@g.us', 'JID not a valid WhatsApp JID)'),
]).describe('The JID of the recipient or chat. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group')

export function registerEntityResources<T>(
  server: McpServer,
  pluralType: string,
  singularType: string,
  getAll: () => T[],
  get: (id: string) => T | undefined,
  toUri: (entity: T) => string,
  toName: (entity: T) => string,
  getStatus: () => SyncStatus,
) {
  const toResource = (entity: T | undefined) =>
    entity ? [{ uri: toUri(entity), mimeType: 'application/json' as const, text: JSON.stringify(entity) }] : []

  server.registerResource(
    pluralType,
    `${pluralType}://app`,
    { title: `All WhatsApp ${pluralType}`, description: `List WhatsApp ${pluralType}`, mimeType: 'application/json' },
    async () => withErrorHandling(
      getStatus,
      () => toReadResource(getAll().flatMap(e => toResource(e))),
      (error) => { throw error },
    ),
  )

  const resourceTemplate = new ResourceTemplate(
    `${pluralType}://app/{${singularType}Id}`, {
      list: async () => withErrorHandling(
        getStatus,
        () => toListResource(getAll().map(e => ({ uri: toUri(e), name: toName(e) }))),
        (error) => { throw error },
      ),
    })

  server.registerResource(
    singularType,
    resourceTemplate,
    { title: `A single WhatsApp ${singularType}`, description: `Details of a single WhatsApp ${singularType}`, mimeType: 'application/json' },
    async (_, params) => withErrorHandling(
      getStatus,
      () => toReadResource(toResource(get(params[`${singularType}Id`] as string))),
      (error) => { throw error },
    ),
  )
}

export function registerTool<I>(
  server: McpServer,
  name: string,
  inputSchema: ZodType<I>,
  description: string,
  action: (args: I) => Promise<string>,
  getStatus: () => SyncStatus,
) {
  server.registerTool<ZodRawShapeCompat, typeof inputSchema>(
    name,
    { description, inputSchema },
    async args => withErrorHandling(
      () => getStatus(),
      () => action(args).then(toCallResult),
      e => toCallError(e),
    ),
  )
}

export async function withErrorHandling<R>(
  getStatus: () => SyncStatus,
  action: () => R | Promise<R>,
  onError: (error: Error) => R | Promise<R>,
): Promise<R> {
  try {
    const status = getStatus()
    if (status.type === 'needAuth') throw new Error('Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication')
    if (status.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (status.type === 'closed') throw new Error('Connection closed, please restart server')
    return await action()
  }
  catch (error) {
    return await onError(error as Error)
  }
}

export const toCallError = (error: Error): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true })
export const toReadResource = (contents: ReadResourceResult['contents']) => ({ contents })
export const toListResource = (resources: ListResourcesResult['resources']) => ({ resources })
export const toCallResult = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: false })
