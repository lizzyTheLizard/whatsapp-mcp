import { describe, it, expect, vi, Mock } from 'vitest'
import { z } from 'zod'
import { registerWhatsAppTools } from './tools.js'
import type { WhatsAppStore } from './store.js'
import type { WhatsAppHandler } from './sync.js'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp'

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

function createMockSync(): WhatsAppHandler {
  return {
    close: vi.fn(),
    getStatus: vi.fn(),
    sendMessage: vi.fn(),
    setArchived: vi.fn(),
    setRead: vi.fn(),
  }
}

describe('registerWhatsAppTools', () => {
  it('registers resources and tools on the server', () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    registerWhatsAppTools(server, store, sync)
    expect(server.registerResource).toHaveBeenCalled()
    expect(server.registerTool).toHaveBeenCalled()
  })

  it('registers 5 resources (chats, chat, contacts, contact, messages, message)', () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    registerWhatsAppTools(server, store, sync)
    expect(server.registerResource).toHaveBeenCalledTimes(6)
  })

  it('registers 3 tools (send_message, set_chat_archived, set_chat_read)', () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    registerWhatsAppTools(server, store, sync)
    expect(server.registerTool).toHaveBeenCalledTimes(3)
  })
})

describe('send_message handler', () => {
  it('calls sync.sendMessage with jid and message', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.sendMessage).mockResolvedValue({
      key: { id: 'm1', remoteJid: 'user@s.whatsapp.net' },
      message: { conversation: 'Hello!' },
    })

    registerWhatsAppTools(server, store, sync)
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

    registerWhatsAppTools(server, store, sync)
    const sendMessageTool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'send_message')
    const handler = sendMessageTool?.[2] as (input: { jid: string, message: string }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: connection lost', type: 'text' })
  })
})

describe('set_chat_archived handler', () => {
  it('calls sync.setArchived with jid and archived', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.setArchived).mockResolvedValue(undefined)

    registerWhatsAppTools(server, store, sync)
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

    registerWhatsAppTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_archived')
    const handler = tool?.[2] as (input: { jid: string, archived: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', archived: false })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: no chat', type: 'text' })
  })
})

describe('set_chat_read handler', () => {
  it('calls sync.setRead with jid and read', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(sync.setRead).mockResolvedValue(undefined)

    registerWhatsAppTools(server, store, sync)
    const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === 'set_chat_read')
    const handler = tool?.[2] as (input: { jid: string, read: boolean }) => Promise<CallToolResult>

    const result: CallToolResult = await handler({ jid: 'user@s.whatsapp.net', read: true })
    expect(sync.setRead).toHaveBeenCalledWith('user@s.whatsapp.net', true)
    expect(result.isError).toBe(false)
  })
})

describe('resource handlers', () => {
  it('chats resource handler returns store.getChats() as content', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getChats).mockReturnValue([{ id: 'c1', name: 'Chat1' }])

    registerWhatsAppTools(server, store, sync)
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

    registerWhatsAppTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'chat')
    const handler = call?.[3] as (input: undefined, params: { chatId: string }) => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler(undefined, { chatId: 'c1' })
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('chats://app/c1')
  })

  it('contacts resource handler returns store.getContacts()', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getContacts).mockReturnValue([{ id: 'c1', name: 'Contact1' }])

    registerWhatsAppTools(server, store, sync)
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

    registerWhatsAppTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'contact')
    const handler = call?.[3] as (input: undefined, params: { contactId: string }) => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler(undefined, { contactId: 'c1' })
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('contacts://app/c1')
  })

  it('messages resource handler returns store.getMessages()', async () => {
    const server = createMockServer()
    const store = createMockStore()
    const sync = createMockSync()
    vi.mocked(store.getMessages).mockReturnValue([{ key: { id: 'm1' }, message: { conversation: 'hi' } }])

    registerWhatsAppTools(server, store, sync)
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

    registerWhatsAppTools(server, store, sync)
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'message')
    const handler = call?.[3] as (input: undefined, params: { messageId: string }) => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler(undefined, { messageId: 'm1' })
    expect(result.contents).toHaveLength(1)
    expect(result.contents[0].uri).toBe('messages://app/m1')
  })

  it('resource returns empty array when no data exists', async () => {
    const server = createMockServer()
    const store = createMockStore()

    registerWhatsAppTools(server, store, createMockSync())
    const call = server.registerResource.mock.calls.find((c: string[]) => c[0] === 'chats')
    const handler = call?.[3] as () => Promise<ReadResourceResult>

    const result: ReadResourceResult = await handler()
    expect(result.contents).toEqual([])
  })
})
