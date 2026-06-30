import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetMockSocket, createStartedHandlerWithMockSocket, getMockSocket, emitOnMockSocket, hasMockSocketBeenRestarted } from './mockSocket.js'
import { initialDataStore } from './mockDataStore.js'
import { createHandler } from '../src/sync.js'
import { createStore } from '../src/store.js'

beforeEach(() => {
  resetMockSocket()
})

describe('createHandler', () => {
  it('initial state is notstarted', () => {
    const handler = createHandler(createStore(undefined))
    expect(handler.getStatus()).toEqual({ type: 'notstarted' })
  })

  it('transitions to connecting', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    emitOnMockSocket({ connection: 'connecting' })
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
  })

  it('transitions to needAuth on QR', async () => {
    const handler = await createStartedHandlerWithMockSocket({ qr: 'base64qr===' })
    expect(handler.getStatus()).toEqual({ type: 'needAuth', qr: 'base64qr===' })
  })

  it('transitions to ready on connection open', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' })
    expect(handler.getStatus()).toEqual({ type: 'ready' })
  })

  it('transitions to closed on connection close without error', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'close' })
    expect(handler.getStatus()).toEqual({ type: 'closed' })
  })

  it('transitions to closed with error on connection close with error', async () => {
    const error = new Error('generic failure')
    const handler = await createStartedHandlerWithMockSocket({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'closed', error })
  })

  it('ignores intermediate connection updates', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    emitOnMockSocket({ connection: 'connecting' })
    // state stays 'connecting', emit an open to resolve the start promise
    emitOnMockSocket({ connection: 'open' })
    expect(handler.getStatus()).toEqual({ type: 'ready' })
  })
})

describe('error handling', () => {
  it('handles 401 error by resetting store and restarting', async () => {
    const store = createStore(initialDataStore)
    const handler = await createStartedHandlerWithMockSocket(undefined, store)
    const error = Object.assign(new Error('auth failed'), { output: { statusCode: 401 } })
    emitOnMockSocket({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
    expect(hasMockSocketBeenRestarted()).toBe(true)
    expect(store.getChats()).toHaveLength(0)
  })

  it('handles 515 error by resetting store and restarting with re-login', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    const error = Object.assign(new Error('reconnect needed'), { output: { statusCode: 515 } })
    emitOnMockSocket({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
    expect(hasMockSocketBeenRestarted()).toBe(true)
  })

  it('non-401/515 error stays closed with error', async () => {
    const error = Object.assign(new Error('other error'), { output: { statusCode: 500 } })
    const handler = await createStartedHandlerWithMockSocket({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'closed', error })
    expect(hasMockSocketBeenRestarted()).toBe(false)
  })

  it('plain Error without output does not trigger reconnection', async () => {
    const error = new Error('no output property')
    const handler = await createStartedHandlerWithMockSocket({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'closed', error })
    expect(hasMockSocketBeenRestarted()).toBe(false)
  })

  it('non-Error value falls through to closed with the value as error', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'close', lastDisconnect: { error: 'string error' } })
    expect(handler.getStatus().type).toBe('closed')
    expect(handler.getStatus()).toHaveProperty('error', 'string error')
    expect(hasMockSocketBeenRestarted()).toBe(false)
  })
})

describe('getStatus', () => {
  it('returns the current state', async () => {
    const store = createStore(undefined)
    const handler = createHandler(store)
    expect(handler.getStatus().type).toBe('notstarted')
    const startPromise = handler.start()
    emitOnMockSocket({ connection: 'open' })
    await startPromise
    expect(handler.getStatus().type).toBe('ready')
  })
})

describe('sendMessage', () => {
  it('throws when state is connecting', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hello')).rejects.toThrow('Server still connecting')
  })

  it('throws when state is closed', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'close' })
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hello')).rejects.toThrow('Connection closed')
  })

  it('throws when state is needAuth', async () => {
    const handler = await createStartedHandlerWithMockSocket({ qr: 'qr' })
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hello')).rejects.toThrow('Authentication needed')
  })

  it('calls sock.sendMessage when ready', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' })
    const socket = getMockSocket()
    await handler.sendMessage('test@s.whatsapp.net', 'Hello!')
    expect(socket.sendMessage).toHaveBeenCalledWith('test@s.whatsapp.net', { text: 'Hello!' })
  })

  it('throws when sock.sendMessage returns null', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' })
    const socket = getMockSocket()
    socket.sendMessage.mockResolvedValue(null)
    await vi.waitFor(() => { expect(handler.getStatus().type).toBe('ready') })
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hi')).rejects.toThrow('Failed to send message')
  })
})

describe('setArchived', () => {
  it('throws when state is connecting', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    await expect(handler.setArchived('test@s.whatsapp.net', true)).rejects.toThrow('Server still connecting')
  })

  it('throws when chat is not found', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' })
    await expect(handler.setArchived('unknown@s.whatsapp.net', true)).rejects.toThrow('No chat found')
  })

  it('calls chatModify with empty lastMessages when chat has no last message', async () => {
    const store = createStore(undefined)
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' }, store)
    store.getRawChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net' })
    const socket = getMockSocket()
    await handler.setArchived('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { archive: true, lastMessages: [] },
      'test@s.whatsapp.net',
    )
  })

  it('throws when last message has no key', async () => {
    const store = createStore(undefined)
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' }, store)
    store.getRawChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: {} }] })
    await expect(handler.setArchived('test@s.whatsapp.net', true)).rejects.toThrow('has no key')
  })

  it('calls chatModify with archive and last message when valid', async () => {
    const store = createStore(undefined)
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' }, store)
    const lastMsg = { key: { id: 'last', remoteJid: 'test@s.whatsapp.net' }, message: { conversation: 'bye' } }
    store.getRawChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: lastMsg }] })
    const socket = getMockSocket()
    await handler.setArchived('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { archive: true, lastMessages: [lastMsg] },
      'test@s.whatsapp.net',
    )
  })
})

describe('setRead', () => {
  it('throws when state is connecting', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    await expect(handler.setRead('test@s.whatsapp.net', true)).rejects.toThrow('Server still connecting')
  })

  it('throws when chat is not found', async () => {
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' })
    await expect(handler.setRead('unknown@s.whatsapp.net', true)).rejects.toThrow('No chat found')
  })

  it('calls chatModify with empty lastMessages when chat has no last message', async () => {
    const store = createStore(undefined)
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' }, store)
    store.getRawChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net' })
    const socket = getMockSocket()
    await handler.setRead('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { markRead: true, lastMessages: [] },
      'test@s.whatsapp.net',
    )
  })

  it('throws when last message has no key', async () => {
    const store = createStore(undefined)
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' }, store)
    store.getRawChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: {} }] })
    await expect(handler.setRead('test@s.whatsapp.net', true)).rejects.toThrow('has no key')
  })

  it('calls chatModify with markRead and last message when valid', async () => {
    const store = createStore(undefined)
    const handler = await createStartedHandlerWithMockSocket({ connection: 'open' }, store)
    const lastMsg = { key: { id: 'last', remoteJid: 'test@s.whatsapp.net' }, message: { conversation: 'hi' } }
    store.getRawChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: lastMsg }] })
    const socket = getMockSocket()
    await handler.setRead('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { markRead: true, lastMessages: [lastMsg] },
      'test@s.whatsapp.net',
    )
  })
})

describe('close', () => {
  it('sets state to closed and calls sock.end', async () => {
    const handler = await createStartedHandlerWithMockSocket()
    const socket = getMockSocket()
    handler.close()
    expect(socket.end).toHaveBeenCalled()
    expect(handler.getStatus()).toEqual({ type: 'closed' })
  })
})
