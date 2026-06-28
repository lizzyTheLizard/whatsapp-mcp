import { describe, it, expect, vi, Mock } from 'vitest'
import { registerAuthTools } from '../../src/tools/authTools.js'
import type { WhatsAppStore } from '../../src/store.js'
import type { WhatsAppHandler, SyncStatus } from '../../src/sync.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
const mockQrToBuffer = vi.hoisted(() => vi.fn())
vi.mock('qrcode', () => ({ default: { toBuffer: mockQrToBuffer } }))

function createMockServer(): McpServer & { registerTool: Mock } {
  return {
    registerTool: vi.fn(),
  } as McpServer & { registerTool: Mock }
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

describe('get_auth_qr handler', () => {
  it('registers the get_auth_qr tool', () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()

    registerAuthTools(server, store, sync)

    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_auth_qr')
    expect(tool).toBeDefined()
    expect((tool as unknown[])[1]).toMatchObject({ description: 'Get a QR code for WhatsApp authentication' })
  })

  it('returns QR code result when status is needAuth', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync({ type: 'needAuth', qr: 'test-qr-data' })
    mockQrToBuffer.mockResolvedValue(Buffer.from('png-data'))

    registerAuthTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_auth_qr')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result: CallToolResult = await handler()
    expect(mockQrToBuffer).toHaveBeenCalledWith('test-qr-data', { type: 'png', width: 400, margin: 2 })
    expect(result.isError).toBe(false)
    expect(result.content[0].type).toBe('text')
    expect(result.content[1].type).toBe('image')
    expect((result.content[1] as { mimeType: string }).mimeType).toBe('image/png')
    expect(result.content[2]).toEqual({ type: 'text', text: 'test-qr-data' })
  })

  it.each([
    ['ready', { type: 'ready' } as const],
    ['connecting', { type: 'connecting' } as const],
    ['closed', { type: 'closed' } as const],
  ])('returns error when status is %s', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerAuthTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_auth_qr')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result: CallToolResult = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: Authentication is not required at this time.', type: 'text' })
  })
})

describe('get_status handler', () => {
  it('registers the get_status tool', () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()

    registerAuthTools(server, store, sync)

    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_status')
    expect(tool).toBeDefined()
    expect((tool as unknown[])[1]).toMatchObject({ description: 'Get the current server status.' })
  })

  it.each([
    ['ready', { type: 'ready' } as const],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const],
    ['connecting', { type: 'connecting' } as const],
    ['closed', { type: 'closed' } as const],
  ])('returns error when status is %s', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerAuthTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_status')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result: CallToolResult = await handler()
    expect(result.isError).toBe(false)
    expect(result.content[0]).toEqual({ text: status.type, type: 'text' })
  })
})
