import { describe, it, expect, vi, Mock } from 'vitest'
import { registerMessageTools } from './messageTools.js'
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
    ['needAuth', { type: 'needAuth', qr: 'qr' } as const, 'Authentication needed, please authenticate yourself first'],
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

describe('messages resources', () => {
  it('messages resource handler returns store.getMessages()', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getMessages).mockReturnValue([{ key: { id: 'm1' }, message: { conversation: 'hi' } }])

    registerMessageTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'messages')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler()
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('messages://app/m1')
  })

  it('single message resource handler returns store.getMessage(messageId)', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getMessage).mockReturnValue({ key: { id: 'm1' }, message: { conversation: 'found' } })

    registerMessageTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'message')
    const handler = call?.[3] as (input: undefined, params: { messageId: string }) => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler(undefined, { messageId: 'm1' })
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('messages://app/m1')
  })

  it.each([
    ['connecting', { type: 'connecting' }] as const,
    ['closed', { type: 'closed' }] as const,
    ['needAuth', { type: 'needAuth', qr: 'qr' }] as const,
  ])('throws when status is %s in messages resource handler', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerMessageTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'messages')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    await expect(async () => handler()).rejects.toThrow()
  })

  it.each([
    ['connecting', { type: 'connecting' }] as const,
    ['closed', { type: 'closed' }] as const,
    ['needAuth', { type: 'needAuth', qr: 'qr' }] as const,
  ])('throws when status is %s in single message resource handler', async (_, status) => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync(status)

    registerMessageTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'message')
    const handler = call?.[3] as (input: undefined, params: { messageId: string }) => Promise<ReadResourceResult>

    await expect(async () => handler(undefined, { messageId: 'm1' })).rejects.toThrow()
  })
})
