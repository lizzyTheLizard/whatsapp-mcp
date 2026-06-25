import { describe, it, expect, vi, Mock } from 'vitest'
import { registerChatTools } from './chatTools.js'
import type { WhatsAppStore } from '../store.js'
import type { WhatsAppHandler, SyncStatus } from '../sync.js'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
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
    ['needAuth', { type: 'needAuth', qr: 'qr' } as const, 'Authentication needed, please authenticate yourself first'],
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
    ['needAuth', { type: 'needAuth', qr: 'qr' } as const, 'Authentication needed, please authenticate yourself first'],
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

describe('chats resources', () => {
  it('chats resource handler returns store.getChats() as content', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getChats).mockReturnValue([{ id: 'c1', name: 'Chat1' }])

    registerChatTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'chats')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler()
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('chats://app/c1')
  })

  it('single chat resource handler returns store.getChat(chatId)', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getChat).mockReturnValue({ id: 'c1', name: 'Found' })

    registerChatTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'chat')
    const handler = call?.[3] as (input: undefined, params: { chatId: string }) => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler(undefined, { chatId: 'c1' })
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('chats://app/c1')
  })

  it.each([
    ['connecting', { type: 'connecting' }] as const,
    ['closed', { type: 'closed' }] as const,
    ['needAuth', { type: 'needAuth', qr: 'qr' }] as const,
  ])('throws when status is %s in chats resource handler', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerChatTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'chats')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    await expect(async () => handler()).rejects.toThrow()
  })

  it.each([
    ['connecting', { type: 'connecting' }] as const,
    ['closed', { type: 'closed' }] as const,
    ['needAuth', { type: 'needAuth', qr: 'qr' }] as const,
  ])('throws when status is %s in single chat resource handler', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerChatTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'chat')
    const handler = call?.[3] as (input: undefined, params: { chatId: string }) => Promise<ReadResourceResult>

    await expect(async () => handler(undefined, { chatId: 'c1' })).rejects.toThrow()
  })
})
