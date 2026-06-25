import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type CallToolResult, type ListResourcesResult, type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { type SyncStatus } from '../sync.js'
import z from 'zod'

export const toReadResource = (contents: ReadResourceResult['contents']) => ({ contents })
export const toListResource = (resources: ListResourcesResult['resources']) => ({ resources })
export const toCallResult = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: false })
export const toCallError = (error: Error): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true })

function ensureReady(getStatus: () => SyncStatus): void {
  const status = getStatus()
  if (status.type === 'connecting') throw new Error('Server still connecting, please wait')
  if (status.type === 'closed') throw new Error('Connection closed, please restart server')
  if (status.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
}

export async function withErrorHandling<T, R>(
  getStatus: () => SyncStatus,
  action: () => Promise<T>,
  onSuccess: (result: T) => R,
  onError: (error: Error) => R,
): Promise<R> {
  try {
    ensureReady(getStatus)
    const result = await action()
    return onSuccess(result)
  }
  catch (error) {
    return onError(error as Error)
  }
}

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
      () => Promise.resolve(getAll().flatMap(toResource)),
      entities => toReadResource(entities),
      (error) => { throw error },
    ),
  )

  server.registerResource(
    singularType,
    new ResourceTemplate(`${pluralType}://app/{${singularType}Id}`, {
      list: async () => withErrorHandling(
        getStatus,
        () => Promise.resolve(getAll().map(e => ({ uri: toUri(e), name: toName(e) }))),
        resources => toListResource(resources),
        (error) => { throw error },
      ),
    }),
    { title: `A single WhatsApp ${singularType}`, description: `Details of a single WhatsApp ${singularType}`, mimeType: 'application/json' },
    async (_, params) => withErrorHandling(
      getStatus,
      () => Promise.resolve(toResource(get(params[`${singularType}Id`] as string))),
      contents => toReadResource(contents),
      (error) => { throw error },
    ),
  )
}

export const JidSchema = z.union([
  z.string().min(1, 'JID is required').endsWith('@s.whatsapp.net', 'JID not a valid WhatsApp JID)'),
  z.string().min(1, 'JID is required').endsWith('@g.us', 'JID not a valid WhatsApp JID)'),
]).describe('The JID of the recipient or chat. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group')
