import { describe, it, expect, vi, Mock } from 'vitest'
import { registerChatTools } from '../../src/tools/chatTools.js'
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

describe('set_chat_archived handler', () => {
  it('calls sync.setArchived with jid and archived', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.setArchived).mockResolvedValue(undefined)

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_archived')
    const handler = tool?.[2] as (input: { jid: string, archived: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', archived: true })
    expect(sync.setArchived).toHaveBeenCalledWith('user@s.whatsapp.net', true)
    expect(result.isError).toBe(false)
  })

  it('returns error when sync.setArchived fails', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.setArchived).mockRejectedValue(new Error('no chat'))

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_archived')
    const handler = tool?.[2] as (input: { jid: string, archived: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', archived: false })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: no chat', type: 'text' })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_archived')
    const handler = tool?.[2] as (input: { jid: string, archived: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', archived: true })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
    expect(sync.setArchived).not.toHaveBeenCalled()
  })
})

describe('set_chat_read handler', () => {
  it('calls sync.setRead with jid and read', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.setRead).mockResolvedValue(undefined)

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_read')
    const handler = tool?.[2] as (input: { jid: string, read: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', read: true })
    expect(sync.setRead).toHaveBeenCalledWith('user@s.whatsapp.net', true)
    expect(result.isError).toBe(false)
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_read')
    const handler = tool?.[2] as (input: { jid: string, read: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', read: true })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
    expect(sync.setRead).not.toHaveBeenCalled()
  })
})

describe('get_all_chats tool', () => {
  it('returns store.getChats() as structured output', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getChats).mockReturnValue([{ id: 'c1', name: 'Chat1' }])

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_chats')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ chats: [{ id: 'c1', name: 'Chat1' }] })
  })

  it('returns empty array when no chats exist', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_chats')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ chats: [] })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerChatTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_chats')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})
