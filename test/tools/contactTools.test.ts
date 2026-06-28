import { describe, it, expect, vi, Mock } from 'vitest'
import { registerContactResources } from '../../src/tools/contactTools.js'
import type { WhatsAppStore } from '../../src/store.js'
import type { WhatsAppHandler, SyncStatus } from '../../src/sync.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

function createMockServer(): McpServer & { registerTool: Mock } {
  return {
    registerTool: vi.fn(),
  } as unknown as McpServer & { registerTool: Mock }
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
    getMessagesForChat: vi.fn().mockReturnValue([]),
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

describe('get_all_contacts tool', () => {
  it('returns store.getContacts() as structured output', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getContacts).mockReturnValue([{ id: 'c1', name: 'Contact1' }])

    registerContactResources(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_contacts')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ contacts: [{ id: 'c1', name: 'Contact1' }] })
  })

  it('returns empty array when no contacts exist', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()

    registerContactResources(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_contacts')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ contacts: [] })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerContactResources(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_contacts')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})
