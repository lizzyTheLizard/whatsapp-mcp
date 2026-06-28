import { describe, it, expect, vi, Mock } from 'vitest'
import { registerMessageTools } from '../../src/tools/messageTools.js'
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

describe('send_message handler', () => {
  it('calls sync.sendMessage with jid and message', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.sendMessage).mockResolvedValue({
      key: { id: 'm1', remoteJid: 'user@s.whatsapp.net' },
      message: { conversation: 'Hello!' },
    })

    registerMessageTools(server, store, sync)
    const sendMessageTool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'send_message')
    const handler = sendMessageTool?.[2] as (input: { jid: string, message: string }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(sync.sendMessage).toHaveBeenCalledWith('user@s.whatsapp.net', 'Hello!')
    expect(result.isError).toBe(false)
    expect(result.content[0]).toEqual({ text: 'Message sent to user@s.whatsapp.net: "Hello!"', type: 'text' })
  })

  it('returns error result when sync.sendMessage fails', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.sendMessage).mockRejectedValue(new Error('connection lost'))

    registerMessageTools(server, store, sync)
    const sendMessageTool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'send_message')
    const handler = sendMessageTool?.[2] as (input: { jid: string, message: string }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: connection lost', type: 'text' })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerMessageTools(server, store, sync)
    const sendMessageTool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'send_message')
    const handler = sendMessageTool?.[2] as (input: { jid: string, message: string }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
    expect(sync.sendMessage).not.toHaveBeenCalled()
  })
})

describe('get_all_messages tool', () => {
  it('returns store.getMessages() as structured output', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getMessages).mockReturnValue([{ key: { id: 'm1' }, message: { conversation: 'hi' } }])

    registerMessageTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_messages')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [{ key: { id: 'm1' }, message: { conversation: 'hi' } }] })
  })

  it('returns empty array when no messages exist', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()

    registerMessageTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_messages')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [] })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerMessageTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_messages')
    const handler = tool?.[2] as () => Promise<CallToolResult>

    const result = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})

describe('get_all_messages_for_chat tool', () => {
  it('filters messages by remoteJid', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getMessages).mockReturnValue([
      { key: { id: 'm1', remoteJid: 'chat1@s.whatsapp.net' }, message: { conversation: 'a' } },
      { key: { id: 'm2', remoteJid: 'chat2@s.whatsapp.net' }, message: { conversation: 'b' } },
    ])

    registerMessageTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_messages_for_chat')
    const handler = tool?.[2] as (input: string) => Promise<CallToolResult>

    const result = await handler('chat1@s.whatsapp.net')
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({
      messages: [{ key: { id: 'm1', remoteJid: 'chat1@s.whatsapp.net' }, message: { conversation: 'a' } }],
    })
  })

  it('returns empty when no messages match the jid', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getMessages).mockReturnValue([
      { key: { id: 'm1', remoteJid: 'chat1@s.whatsapp.net' }, message: { conversation: 'a' } },
    ])

    registerMessageTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_messages_for_chat')
    const handler = tool?.[2] as (input: string) => Promise<CallToolResult>

    const result = await handler('other@s.whatsapp.net')
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [] })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerMessageTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'get_all_messages_for_chat')
    const handler = tool?.[2] as (input: string) => Promise<CallToolResult>

    const result = await handler('chat1@s.whatsapp.net')
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})
