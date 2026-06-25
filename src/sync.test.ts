import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMakeWASocket = vi.hoisted(() => vi.fn())

vi.mock('@whiskeysockets/baileys', async (importOriginal) => {
  const actual: object = await importOriginal()
  return { ...actual, default: mockMakeWASocket, makeWASocket: mockMakeWASocket }
})

import { createHandler } from './sync.js'
import { createStore } from './store.js'

function createStoreMockEmitter() {
  return { process: vi.fn() }
}

function newMockSocket() {
  return {
    ev: {
      on: vi.fn(),
      process: vi.fn(),
    },
    end: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'mock', remoteJid: 'test' }, message: { conversation: 'ok' } }),
    chatModify: vi.fn().mockResolvedValue(undefined),
  }
}

function getConnectionUpdateHandler(socket: ReturnType<typeof newMockSocket>): ((update: Record<string, unknown>) => void) | undefined {
  const call = (socket.ev.on.mock.calls as [string, (update: Record<string, unknown>) => void][])
    .find(([name]) => name === 'connection.update')
  return call?.[1]
}

function emitConnectionUpdate(update: Record<string, unknown>) {
  const results = mockMakeWASocket.mock.results as { value: ReturnType<typeof newMockSocket>, type: string }[]
  if (results.length === 0) return
  const socket = results[results.length - 1].value
  const handler = getConnectionUpdateHandler(socket)
  if (handler) handler(update)
}

function getLatestSocket(): ReturnType<typeof newMockSocket> {
  const results = mockMakeWASocket.mock.results as { value: ReturnType<typeof newMockSocket>, type: string }[]
  return results[results.length - 1].value
}

beforeEach(() => {
  mockMakeWASocket.mockReset()
  mockMakeWASocket.mockReturnValue(newMockSocket())
})

describe('createHandler', () => {
  it('initial state is connecting', () => {
    const handler = createHandler(createStore())
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
  })

  it('transitions to needAuth on QR', () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ qr: 'base64qr===' })
    expect(handler.getStatus()).toEqual({ type: 'needAuth', qr: 'base64qr===' })
  })

  it('transitions to ready on connection open', () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'open' })
    expect(handler.getStatus()).toEqual({ type: 'ready' })
  })

  it('transitions to closed on connection close without error', () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'close' })
    expect(handler.getStatus()).toEqual({ type: 'closed' })
  })

  it('transitions to closed with error on connection close with error', () => {
    const handler = createHandler(createStore())
    const error = new Error('generic failure')
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'closed', error })
  })

  it('ignores intermediate connection updates', () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'connecting' })
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
  })
})

describe('error handling', () => {
  it('handles 401 error by resetting store and restarting', () => {
    const store = createStore()
    const handler = createHandler(store)
    const error = Object.assign(new Error('auth failed'), { output: { statusCode: 401 } })
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
    expect(mockMakeWASocket).toHaveBeenCalledTimes(2)
  })

  it('handles 515 error by resetting store and restarting with re-login', () => {
    const store = createStore()
    const handler = createHandler(store)
    const error = Object.assign(new Error('reconnect needed'), { output: { statusCode: 515 } })
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'connecting' })
    expect(mockMakeWASocket).toHaveBeenCalledTimes(2)
  })

  it('non-401/515 error stays closed with error', () => {
    const handler = createHandler(createStore())
    const error = Object.assign(new Error('other error'), { output: { statusCode: 500 } })
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'closed', error })
  })

  it('plain Error without output does not trigger reconnection', () => {
    const handler = createHandler(createStore())
    const error = new Error('no output property')
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
    expect(handler.getStatus()).toEqual({ type: 'closed', error })
  })

  it('non-Error value falls through to closed with the value as error', () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error: 'string error' } })
    expect(handler.getStatus().type).toBe('closed')
    expect(handler.getStatus()).toHaveProperty('error', 'string error')
  })

  it('401 error resets store data', () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    createHandler(store)
    ev.process.mockClear()
    const error = Object.assign(new Error('auth'), { output: { statusCode: 401 } })
    emitConnectionUpdate({ connection: 'close', lastDisconnect: { error } })
    expect(store.getChats()).toHaveLength(0)
  })
})

describe('getStatus', () => {
  it('returns the current state', () => {
    const store = createStore()
    const handler = createHandler(store)
    expect(handler.getStatus().type).toBe('connecting')
    emitConnectionUpdate({ connection: 'open' })
    expect(handler.getStatus().type).toBe('ready')
  })
})

describe('sendMessage', () => {
  it('throws when state is connecting', async () => {
    const handler = createHandler(createStore())
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hello')).rejects.toThrow('Server still connecting')
  })

  it('throws when state is closed', async () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'close' })
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hello')).rejects.toThrow('Connection closed')
  })

  it('throws when state is needAuth', async () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ qr: 'qr' })
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hello')).rejects.toThrow('Authentication needed')
  })

  it('calls sock.sendMessage when ready', async () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'open' })
    const socket = getLatestSocket()
    const result = await handler.sendMessage('test@s.whatsapp.net', 'Hello!')
    expect(socket.sendMessage).toHaveBeenCalledWith('test@s.whatsapp.net', { text: 'Hello!' })
    expect(result).toBeDefined()
  })

  it('throws when sock.sendMessage returns null', async () => {
    const handler = createHandler(createStore())
    getLatestSocket().sendMessage.mockResolvedValue(null)
    emitConnectionUpdate({ connection: 'open' })
    await expect(handler.sendMessage('test@s.whatsapp.net', 'hi')).rejects.toThrow('Failed to send message')
  })
})

describe('setArchived', () => {
  it('throws when state is connecting', async () => {
    const handler = createHandler(createStore())
    await expect(handler.setArchived('test@s.whatsapp.net', true)).rejects.toThrow('Server still connecting')
  })

  it('throws when chat is not found', async () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'open' })
    await expect(handler.setArchived('unknown@s.whatsapp.net', true)).rejects.toThrow('No chat found')
  })

  it('calls chatModify with empty lastMessages when chat has no last message', async () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    const handler = createHandler(store)
    emitConnectionUpdate({ connection: 'open' })
    store.getChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net' })
    const socket = getLatestSocket()
    await handler.setArchived('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { archive: true, lastMessages: [] },
      'test@s.whatsapp.net',
    )
  })

  it('throws when last message has no key', async () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    const handler = createHandler(store)
    emitConnectionUpdate({ connection: 'open' })
    store.getChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: {} }] })
    await expect(handler.setArchived('test@s.whatsapp.net', true)).rejects.toThrow('has no key')
  })

  it('calls chatModify with archive and last message when valid', async () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    const handler = createHandler(store)
    emitConnectionUpdate({ connection: 'open' })
    const lastMsg = { key: { id: 'last', remoteJid: 'test@s.whatsapp.net' }, message: { conversation: 'bye' } }
    store.getChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: lastMsg }] })
    const socket = getLatestSocket()
    await handler.setArchived('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { archive: true, lastMessages: [lastMsg] },
      'test@s.whatsapp.net',
    )
  })
})

describe('setRead', () => {
  it('throws when state is connecting', async () => {
    const handler = createHandler(createStore())
    await expect(handler.setRead('test@s.whatsapp.net', true)).rejects.toThrow('Server still connecting')
  })

  it('throws when chat is not found', async () => {
    const handler = createHandler(createStore())
    emitConnectionUpdate({ connection: 'open' })
    await expect(handler.setRead('unknown@s.whatsapp.net', true)).rejects.toThrow('No chat found')
  })

  it('calls chatModify with empty lastMessages when chat has no last message', async () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    const handler = createHandler(store)
    emitConnectionUpdate({ connection: 'open' })
    store.getChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net' })
    const socket = getLatestSocket()
    await handler.setRead('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { markRead: true, lastMessages: [] },
      'test@s.whatsapp.net',
    )
  })

  it('throws when last message has no key', async () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    const handler = createHandler(store)
    emitConnectionUpdate({ connection: 'open' })
    store.getChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: {} }] })
    await expect(handler.setRead('test@s.whatsapp.net', true)).rejects.toThrow('has no key')
  })

  it('calls chatModify with markRead and last message when valid', async () => {
    const store = createStore()
    const ev = createStoreMockEmitter()
    store.bind(ev)
    const handler = createHandler(store)
    emitConnectionUpdate({ connection: 'open' })
    const lastMsg = { key: { id: 'last', remoteJid: 'test@s.whatsapp.net' }, message: { conversation: 'hi' } }
    store.getChat = vi.fn().mockReturnValue({ id: 'test@s.whatsapp.net', messages: [{ message: lastMsg }] })
    const socket = getLatestSocket()
    await handler.setRead('test@s.whatsapp.net', true)
    expect(socket.chatModify).toHaveBeenCalledWith(
      { markRead: true, lastMessages: [lastMsg] },
      'test@s.whatsapp.net',
    )
  })
})

describe('close', () => {
  it('sets state to closed and calls sock.end', () => {
    const handler = createHandler(createStore())
    const socket = getLatestSocket()
    handler.close()
    expect(socket.end).toHaveBeenCalled()
    expect(handler.getStatus()).toEqual({ type: 'closed' })
  })
})
