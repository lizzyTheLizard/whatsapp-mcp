import { describe, it, expect, vi } from 'vitest'
import { registerMessageTools } from '../../src/tools/messageTools.js'
import { registerTools } from './mockServer.js'

const validMsg = (id: string, remoteJid: string, text: string) => ({
  id,
  from: { jid: remoteJid, name: 'User' },
  message: text,
  messageTimestamp: 1000,
})

describe('send_message handler', () => {
  it('calls sync.sendMessage with jid and message', async () => {
    const serverMock = registerTools(registerMessageTools)
    const handler = serverMock.getRegisteredToolHandler('send_message')

    const result = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(serverMock.sync.sendMessage).toHaveBeenCalledWith('user@s.whatsapp.net', 'Hello!')
    expect(result.isError).toBe(false)
    expect(result.content[0]).toEqual({ text: 'Message sent to user@s.whatsapp.net: "Hello!"', type: 'text' })
  })

  it('returns error result when sync.sendMessage fails', async () => {
    const serverMock = registerTools(registerMessageTools)
    vi.mocked(serverMock.sync.sendMessage).mockRejectedValue(new Error('connection lost'))
    const handler = serverMock.getRegisteredToolHandler('send_message')

    const result = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: connection lost', type: 'text' })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerMessageTools, status)
    const handler = serverMock.getRegisteredToolHandler('send_message')

    const result = await handler({ jid: 'user@s.whatsapp.net', message: 'Hello!' })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
    expect(serverMock.sync.sendMessage).not.toHaveBeenCalled()
  })
})

describe('get_all_messages tool', () => {
  it('returns store.getMessages() as structured output', async () => {
    const serverMock = registerTools(registerMessageTools)
    vi.mocked(serverMock.store.getMessages).mockReturnValue([validMsg('m1', 'user1@s.whatsapp.net', 'hi')])
    const handler = serverMock.getRegisteredToolHandler('get_all_messages')

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [validMsg('m1', 'user1@s.whatsapp.net', 'hi')] })
  })

  it('returns empty array when no messages exist', async () => {
    const serverMock = registerTools(registerMessageTools)
    const handler = serverMock.getRegisteredToolHandler('get_all_messages')

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [] })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerMessageTools, status)
    const handler = serverMock.getRegisteredToolHandler('get_all_messages')

    const result = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})

describe('get_all_messages_for_chat tool', () => {
  it('filters messages by remoteJid', async () => {
    const serverMock = registerTools(registerMessageTools)
    vi.mocked(serverMock.store.getMessagesForChat).mockReturnValue([validMsg('m1', 'chat1@s.whatsapp.net', 'a')])
    const handler = serverMock.getRegisteredToolHandler('get_all_messages_for_chat')

    const result = await handler('chat1@s.whatsapp.net')
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [validMsg('m1', 'chat1@s.whatsapp.net', 'a')] })
  })

  it('returns empty when no messages match the jid', async () => {
    const serverMock = registerTools(registerMessageTools)
    vi.mocked(serverMock.store.getMessagesForChat).mockReturnValue([])
    const handler = serverMock.getRegisteredToolHandler('get_all_messages_for_chat')

    const result = await handler('other@s.whatsapp.net')
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({ messages: [] })
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerMessageTools, status)
    const handler = serverMock.getRegisteredToolHandler('get_all_messages_for_chat')

    const result = await handler('chat1@s.whatsapp.net')
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})
