import { describe, it, expect, vi, Mock } from 'vitest'
import { registerContactResources } from './contactTools.js'
import type { WhatsAppStore } from '../store.js'
import type { WhatsAppHandler, SyncStatus } from '../sync.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

function createMockServer(): McpServer & { registerResource: Mock, registerTool: Mock } {
  return {
    registerResource: vi.fn(),
    registerTool: vi.fn(),
  } as McpServer & { registerResource: Mock, registerTool: Mock }
}

function createMockStore(): WhatsAppStore {
  return {
    bind: vi.fn(),
    getChats: vi.fn().mockReturnValue([]),
    getChat: vi.fn().mockReturnValue(undefined),
    getContacts: vi.fn().mockReturnValue([]),
    getContact: vi.fn().mockReturnValue(undefined),
    getMessages: vi.fn().mockReturnValue([]),
    getMessage: vi.fn().mockReturnValue(undefined),
    reset: vi.fn(),
    getAuth: vi.fn(),
  }
}

function createMockSync(status: SyncStatus = { type: 'ready' }): WhatsAppHandler {
  return {
    close: vi.fn(),
    getStatus: vi.fn().mockReturnValue(status),
    sendMessage: vi.fn(),
    setArchived: vi.fn(),
    setRead: vi.fn(),
  }
}

describe('contacts resources', () => {
  it('contacts resource handler returns store.getContacts()', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getContacts).mockReturnValue([{ id: 'c1', name: 'Contact1' }])

    registerContactResources(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'contacts')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler()
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('contacts://app/c1')
  })

  it('single contact resource handler returns store.getContact(contactId)', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getContact).mockReturnValue({ id: 'c1', name: 'Found' })

    registerContactResources(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'contact')
    const handler = call?.[3] as (input: undefined, params: { contactId: string }) => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler(undefined, { contactId: 'c1' })
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('contacts://app/c1')
  })

  it('resource returns empty array when no data exists', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()

    registerContactResources(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'contacts')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler()
    expect(result.contents).toEqual([])
  })

  it.each([
    ['connecting', { type: 'connecting' }] as const,
    ['closed', { type: 'closed' }] as const,
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' }] as const,
  ])('throws when status is %s in contacts resource handler', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerContactResources(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'contacts')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    await expect(async () => handler()).rejects.toThrow()
  })

  it.each([
    ['connecting', { type: 'connecting' }] as const,
    ['closed', { type: 'closed' }] as const,
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' }] as const,
  ])('throws when status is %s in single contact resource handler', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerContactResources(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'contact')
    const handler = call?.[3] as (input: undefined, params: { contactId: string }) => Promise<ReadResourceResult>

    await expect(async () => handler(undefined, { contactId: 'c1' })).rejects.toThrow()
  })
})
