import { describe, it, expect, vi } from 'vitest'
import { registerChatTools } from '../../src/tools/chatTools.js'
import { registerTools } from './mockServer.js'

const validChat = { jid: 'c1', unreadCount: 0, readOnly: false, name: 'Chat1', archived: false, lastMessageTimestamp: 1000, isGroup: false }

describe('set_chat_archived handler', () => {
  it('calls sync.setArchived with jid and archived', async () => {
    const serverMock = registerTools(registerChatTools)
    vi.mocked(serverMock.sync.setArchived).mockResolvedValue(undefined)
    const handler = serverMock.getRegisteredToolHandler('set_chat_archived')

    const result = await handler({ jid: 'user@s.whatsapp.net', archived: true })
    expect(serverMock.sync.setArchived).toHaveBeenCalledWith('user@s.whatsapp.net', true)
    expect(result.isError).toBe(false)
  })

  it('returns error when sync.setArchived fails', async () => {
    const serverMock = registerTools(registerChatTools)
    vi.mocked(serverMock.sync.setArchived).mockRejectedValue(new Error('no chat'))
    const handler = serverMock.getRegisteredToolHandler('set_chat_archived')

    const result = await handler({ jid: 'user@s.whatsapp.net', archived: false })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: no chat', type: 'text' })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerChatTools, status)
    const handler = serverMock.getRegisteredToolHandler('set_chat_archived')

    const result = await handler({ jid: 'user@s.whatsapp.net', archived: true })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
    expect(serverMock.sync.setArchived).not.toHaveBeenCalled()
  })
})

describe('set_chat_read handler', () => {
  it('calls sync.setRead with jid and read', async () => {
    const serverMock = registerTools(registerChatTools)
    vi.mocked(serverMock.sync.setRead).mockResolvedValue(undefined)
    const handler = serverMock.getRegisteredToolHandler('set_chat_read')

    const result = await handler({ jid: 'user@s.whatsapp.net', read: true })
    expect(serverMock.sync.setRead).toHaveBeenCalledWith('user@s.whatsapp.net', true)
    expect(result.isError).toBe(false)
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerChatTools, status)
    const handler = serverMock.getRegisteredToolHandler('set_chat_read')

    const result = await handler({ jid: 'user@s.whatsapp.net', read: true })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
    expect(serverMock.sync.setRead).not.toHaveBeenCalled()
  })
})

describe('get_all_chats tool', () => {
  it('returns store.getChats() as structured output', async () => {
    const serverMock = registerTools(registerChatTools)
    vi.mocked(serverMock.store.getChats).mockReturnValue([validChat])
    const handler = serverMock.getRegisteredToolHandler('get_all_chats')

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual([validChat])
  })

  it('returns empty array when no chats exist', async () => {
    const serverMock = registerTools(registerChatTools)
    const handler = serverMock.getRegisteredToolHandler('get_all_chats')

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual([])
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerChatTools, status)
    const handler = serverMock.getRegisteredToolHandler('get_all_chats')

    const result = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})
