import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStore, Emitter } from './store.js'
import { createExportableAuth, ExportableAuthState } from './auth.js'
import type { BaileysEventMap } from '@whiskeysockets/baileys'

type EventHandler = (events: Partial<BaileysEventMap>) => void | Promise<void>

function createMockEmitter(): (Emitter & { emit: (events: Partial<BaileysEventMap>) => void }) {
  let handler: EventHandler | undefined
  return {
    process: vi.fn((h: EventHandler) => { handler = h }),
    emit: (events: Partial<BaileysEventMap>) => { void handler?.(events) },
  }
}

describe('createStore', () => {
  it('starts with empty chats, contacts, messages', () => {
    const store = createStore()
    expect(store.getChats()).toEqual([])
    expect(store.getContacts()).toEqual([])
    expect(store.getMessages()).toEqual([])
  })

  it('loads initial data from DataStore', () => {
    const store = createStore(undefined, {
      chats: JSON.stringify([['c1', { id: 'c1', name: 'Chat' }]]),
      contacts: JSON.stringify([['c1', { id: 'c1', name: 'Contact' }]]),
      messages: JSON.stringify([['m1', { key: { id: 'm1', remoteJid: 'c1' }, message: { conversation: 'hi' } }]]),
      auth: '',
    })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat('c1')?.name).toBe('Chat')
    expect(store.getContacts()).toHaveLength(1)
    expect(store.getContact('c1')?.name).toBe('Contact')
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage('m1')?.message?.conversation).toBe('hi')
  })

  it('loads auth from initial data', () => {
    const auth = createExportableAuth()
    const store = createStore(undefined, {
      chats: '', contacts: '', messages: '', auth: auth.toAuthState(),
    })
    expect(store.getAuth().creds.registrationId).toBe(auth.creds.registrationId)
  })
})

describe('event processing', () => {
  it('bind registers the process handler with ev.process', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    expect(ev.process).toHaveBeenCalledTimes(1)
    expect(ev.process).toHaveBeenCalledWith(expect.any(Function))
  })

  it('processes messaging-history.set', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messaging-history.set': {
        chats: [{ id: 'c1', name: 'Old Chat' }],
        contacts: [{ id: 'c1', name: 'Old Contact' }],
        messages: [{ key: { id: 'm1' }, message: { conversation: 'old' } }],
      },
    })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getContacts()).toHaveLength(1)
    expect(store.getMessages()).toHaveLength(1)
  })

  it('processes chats.upsert — adds new chats', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1', name: 'New Chat' }] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat('c1')?.name).toBe('New Chat')
  })

  it('processes chats.upsert — merges into existing chats', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1', name: 'First' }] })
    ev.emit({ 'chats.upsert': [{ id: 'c1', archived: true }] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat('c1')?.name).toBe('First')
    expect(store.getChat('c1')?.archived).toBe(true)
  })

  it('processes chats.update — merges partial updates', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1', name: 'Chat', archived: false }] })
    ev.emit({ 'chats.update': [{ id: 'c1', archived: true }] })
    expect(store.getChat('c1')?.archived).toBe(true)
    expect(store.getChat('c1')?.name).toBe('Chat')
  })

  it('processes chats.delete — removes chats by id', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }] })
    ev.emit({ 'chats.delete': ['c1'] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat('c2')?.name).toBe('Two')
  })

  it('processes contacts.upsert — adds new contacts', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'contacts.upsert': [{ id: 'c1', name: 'Contact' }] })
    expect(store.getContacts()).toHaveLength(1)
    expect(store.getContact('c1')?.name).toBe('Contact')
  })

  it('processes contacts.update — merges partial updates', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'contacts.upsert': [{ id: 'c1', name: 'Old', status: 'away' }] })
    ev.emit({ 'contacts.update': [{ id: 'c1', status: 'available' }] })
    expect(store.getContact('c1')?.status).toBe('available')
    expect(store.getContact('c1')?.name).toBe('Old')
  })

  it('processes messages.upsert — adds messages from .messages sub-property', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [{ key: { id: 'm1' }, message: { conversation: 'hello' } }],
        type: 'notify',
      },
    })
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage('m1')?.message?.conversation).toBe('hello')
  })

  it('processes messages.update — merges the update wrapper (existing behavior)', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [{ key: { id: 'm1' }, message: { conversation: 'hi' } }],
        type: 'notify',
      },
    })
    ev.emit({
      'messages.update': [{ key: { id: 'm1' }, update: { message: { conversation: 'updated' } } }],
    })
    const msg = store.getMessage('m1') as { message?: { conversation?: string }, update?: { message?: { conversation?: string } } }
    expect(msg.message?.conversation).toBe('hi')
    expect(msg.update?.message?.conversation).toBe('updated')
  })

  it('processes messages.delete with keys array', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [
          { key: { id: 'm1' }, message: { conversation: 'a' } },
          { key: { id: 'm2' }, message: { conversation: 'b' } },
        ],
        type: 'notify',
      },
    })
    ev.emit({ 'messages.delete': { keys: [{ id: 'm1' }] } })
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage('m2')).toBeDefined()
  })

  it('processes messages.delete with jid', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [
          { key: { id: 'm1', remoteJid: 'c1' } },
          { key: { id: 'm2', remoteJid: 'c2' } },
        ],
        type: 'notify',
      },
    })
    ev.emit({ 'messages.delete': { jid: 'c1', all: true } })
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage('m2')).toBeDefined()
  })

  it('skips chat without id in mergeChats', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ name: 'NoId' }] })
    expect(store.getChats()).toHaveLength(0)
  })

  it('skips message without key.id in mergeMessages', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [{ key: { id: null }, message: { conversation: 'no key id' } }],
        type: 'notify',
      },
    })
    expect(store.getMessages()).toHaveLength(0)
  })
})

describe('save callback', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('calls saveCb with serialized data after debounce', async () => {
    const saveCb = vi.fn().mockResolvedValue(undefined)
    const store = createStore(saveCb)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1', name: 'Chat' }] })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => { expect(saveCb).toHaveBeenCalledTimes(1) })
    const expected = expect.objectContaining({
      chats: expect.any(String) as string,
      contacts: expect.any(String) as string,
      messages: expect.any(String) as string,
      auth: expect.any(String) as string,
    }) as Record<string, unknown>
    expect(saveCb).toHaveBeenCalledWith(expected)
  })

  it('debounces multiple events into one save', async () => {
    const saveCb = vi.fn().mockResolvedValue(undefined)
    const store = createStore(saveCb)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1', name: 'A' }] })
    vi.advanceTimersByTime(500)
    ev.emit({ 'chats.upsert': [{ id: 'c2', name: 'B' }] })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => { expect(saveCb).toHaveBeenCalledTimes(1) })
  })

  it('error in saveCb is caught and does not throw', async () => {
    const saveCb = vi.fn().mockRejectedValue(new Error('save failed'))
    const store = createStore(saveCb)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1' }] })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => { expect(saveCb).toHaveBeenCalled() })
  })
})

describe('getters', () => {
  it('getChats returns all chats', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1' }, { id: 'c2' }] })
    expect(store.getChats()).toHaveLength(2)
  })

  it('getChat returns undefined for missing id', () => {
    expect(createStore().getChat('nonexistent')).toBeUndefined()
  })

  it('getContacts returns all contacts', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'contacts.upsert': [{ id: 'c1' }, { id: 'c2' }] })
    expect(store.getContacts()).toHaveLength(2)
  })

  it('getContact returns undefined for missing id', () => {
    expect(createStore().getContact('nonexistent')).toBeUndefined()
  })

  it('getMessages returns all messages', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [{ key: { id: 'm1' } }, { key: { id: 'm2' } }],
        type: 'notify',
      },
    })
    expect(store.getMessages()).toHaveLength(2)
  })

  it('getMessage returns undefined for missing id', () => {
    expect(createStore().getMessage('nonexistent')).toBeUndefined()
  })
})

describe('reset', () => {
  it('clears all chats, contacts, messages', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messaging-history.set': {
        chats: [{ id: 'c1' }],
        contacts: [{ id: 'c1' }],
        messages: [{ key: { id: 'm1' } }],
      },
    })
    store.reset()
    expect(store.getChats()).toHaveLength(0)
    expect(store.getContacts()).toHaveLength(0)
    expect(store.getMessages()).toHaveLength(0)
  })

  it('resets auth to fresh state', () => {
    const store = createStore()
    store.reset()
    expect(store.getAuth().creds).toBeDefined()
  })

  it('accepts new data after reset', () => {
    const store = createStore()
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: 'c1' }] })
    store.reset()
    ev.emit({ 'chats.upsert': [{ id: 'c2' }] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat('c2')).toBeDefined()
  })
})

describe('getAuth', () => {
  it('returns the internal auth state', () => {
    const store = createStore()
    const auth = store.getAuth() as ExportableAuthState
    expect(auth.creds).toBeDefined()
    expect(auth.keys).toBeDefined()
    expect(typeof auth.toAuthState).toBe('function')
  })
})
