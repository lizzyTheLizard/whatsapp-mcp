import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStore, type Emitter } from '../src/store.js'
import { createExportableAuth, type ExportableAuthState } from '../src/auth.js'
import type { BaileysEventMap } from '@whiskeysockets/baileys'
import { createMessage, initialDataStore, otherContact, otherGroup, initialContact, initialGroup, initialMessage } from './mockDataStore.js'

describe('createStore', () => {
  it('starts with empty chats, contacts, messages', () => {
    const store = createStore(undefined)
    expect(store.getChats()).toEqual([])
    expect(store.getContacts()).toEqual([])
    expect(store.getMessages()).toEqual([])
  })

  it('loads initial data from DataStore', () => {
    const store = createStore(initialDataStore)
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat(initialGroup.id)?.name).toBe('Chat')
    expect(store.getContacts()).toHaveLength(1)
    expect(store.getContact(initialContact.id)?.name).toBe('Contact')
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage(initialMessage.key.id)?.message).toBe('hello')
  })

  it('loads auth from initial data', () => {
    const auth = createExportableAuth()
    const store = createStore({
      chats: '', contacts: '', messages: '', auth: auth.toAuthState(),
    })
    expect(store.getAuth().creds.registrationId).toBe(auth.creds.registrationId)
  })
})

describe('event processing', () => {
  it('bind registers the process handler with ev.process', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    expect(ev.process).toHaveBeenCalledTimes(1)
    expect(ev.process).toHaveBeenCalledWith(expect.any(Function))
  })

  it('processes messaging-history.set', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messaging-history.set': {
        chats: [initialGroup],
        contacts: [initialContact],
        messages: [initialMessage],
      },
    })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getContacts()).toHaveLength(1)
    expect(store.getMessages()).toHaveLength(1)
  })

  it('processes chats.upsert — adds new chats', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [initialGroup] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat(initialGroup.id)?.name).toBe('Chat')
  })

  it('processes chats.upsert — merges into existing chats', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ ...initialGroup, name: 'First' }] })
    ev.emit({ 'chats.upsert': [{ id: initialGroup.id, archived: true }] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat(initialGroup.id)?.name).toBe('First')
    expect(store.getChat(initialGroup.id)?.archived).toBe(true)
  })

  it('processes chats.update — merges partial updates', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: initialGroup.id, name: 'Chat', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 }] })
    ev.emit({ 'chats.update': [{ id: initialGroup.id, archived: true }] })
    expect(store.getChat(initialGroup.id)?.archived).toBe(true)
    expect(store.getChat(initialGroup.id)?.name).toBe('Chat')
  })

  it('processes chats.delete — removes chats by id', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [
      { id: initialGroup.id, name: 'One', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 },
      { id: otherGroup.id, name: 'Two', messages: [{}], archived: false, lastMessageRecvTimestamp: 2000 },
    ] })
    ev.emit({ 'chats.delete': [initialGroup.id] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat(otherGroup.id)?.name).toBe('Two')
  })

  it('processes contacts.upsert — adds new contacts', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'contacts.upsert': [initialContact] })
    expect(store.getContacts()).toHaveLength(1)
    expect(store.getContact(initialContact.id)?.name).toBe('Contact')
  })

  it('processes contacts.update — merges partial updates', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'contacts.upsert': [{ ...initialContact, name: 'Old', status: 'away' }] })
    ev.emit({ 'contacts.update': [{ id: initialContact.id, status: 'available' }] })
    expect(store.getContact(initialContact.id)?.name).toBe('Old')
  })

  it('processes messages.upsert — adds messages from .messages sub-property', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [initialMessage],
        type: 'notify',
      },
    })
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage(initialMessage.key.id)?.message).toBe('hello')
  })

  it('processes messages.update — merges the update wrapper', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [initialMessage],
        type: 'notify',
      },
    })
    ev.emit({
      'messages.update': [{ key: { id: initialMessage.key.id }, update: { message: { conversation: 'updated' } } }],
    })
    expect(store.getMessage(initialMessage.key.id)?.message).toBe('hello')
  })

  it('processes messages.delete with keys array', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [initialMessage, createMessage('m2')],
        type: 'notify',
      },
    })
    ev.emit({ 'messages.delete': { keys: [{ id: initialMessage.key.id }] } })
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage('m2')).toBeDefined()
  })

  it('processes messages.delete with jid', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [initialMessage, createMessage('m2', otherGroup.id)],
        type: 'notify',
      },
    })
    ev.emit({ 'messages.delete': { jid: initialContact.id, all: true } })
    expect(store.getMessages()).toHaveLength(1)
    expect(store.getMessage('m2')).toBeDefined()
  })

  it('skips chat without id in mergeChats', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ name: 'NoId' }] })
    expect(store.getChats()).toHaveLength(0)
  })

  it('skips message without key.id in mergeMessages', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [{ key: { id: null }, message: { conversation: 'no key id' }, messageTimestamp: 1000 }],
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
    const store = createStore(undefined, { writeData: saveCb })
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: initialGroup.id, name: 'Chat', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 }] })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => { expect(saveCb).toHaveBeenCalledTimes(1) })

    const arg = saveCb.mock.calls[0][0] as { chats: Record<string, string>, contacts: Record<string, string>, messages: Record<string, string>, auth: string }

    expect(arg.chats).toEqual({ [initialGroup.id]: expect.any(String) as string })
    expect(arg.contacts).toEqual({})
    expect(arg.messages).toEqual({})
    expect(typeof arg.auth).toEqual('string')
  })

  it('debounces multiple events into one save', async () => {
    const saveCb = vi.fn().mockResolvedValue(undefined)
    const store = createStore(undefined, { writeData: saveCb })
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: initialGroup.id, name: 'A', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 }] })
    vi.advanceTimersByTime(500)
    ev.emit({ 'chats.upsert': [{ id: otherGroup.id, name: 'B', messages: [{}], archived: false, lastMessageRecvTimestamp: 2000 }] })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => { expect(saveCb).toHaveBeenCalledTimes(1) })
  })

  it('error in saveCb is caught and does not throw', async () => {
    const saveCb = vi.fn().mockRejectedValue(new Error('save failed'))
    const store = createStore(undefined, { writeData: saveCb })
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: initialGroup.id, name: 'Chat', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 }] })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => { expect(saveCb).toHaveBeenCalled() })
  })
})

describe('getters', () => {
  it('getChats returns all chats', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [
      { id: initialGroup.id, name: 'C1', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 },
      { id: otherGroup.id, name: 'C2', messages: [{}], archived: false, lastMessageRecvTimestamp: 2000 },
    ] })
    expect(store.getChats()).toHaveLength(2)
  })

  it('getChat returns undefined for missing id', () => {
    expect(createStore(undefined).getChat('nonexistent')).toBeUndefined()
  })

  it('getContacts returns all contacts', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'contacts.upsert': [initialContact, otherContact] })
    expect(store.getContacts()).toHaveLength(2)
  })

  it('getContact returns undefined for missing id', () => {
    expect(createStore(undefined).getContact('nonexistent')).toBeUndefined()
  })

  it('getMessages returns all messages', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messages.upsert': {
        messages: [initialMessage, createMessage('m2')],
        type: 'notify',
      },
    })
    expect(store.getMessages()).toHaveLength(2)
  })

  it('getMessage returns undefined for missing id', () => {
    expect(createStore(undefined).getMessage('nonexistent')).toBeUndefined()
  })
})

describe('reset', () => {
  it('clears all chats, contacts, messages', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({
      'messaging-history.set': {
        chats: [initialGroup],
        contacts: [initialContact],
        messages: [initialMessage],
      },
    })
    store.reset(true)
    expect(store.getChats()).toHaveLength(0)
    expect(store.getContacts()).toHaveLength(0)
    expect(store.getMessages()).toHaveLength(0)
  })

  it('resets auth to fresh state', () => {
    const store = createStore(undefined)
    store.reset(true)
    expect(store.getAuth().creds).toBeDefined()
  })

  it('accepts new data after reset', () => {
    const store = createStore(undefined)
    const ev = createMockEmitter()
    store.bind(ev)
    ev.emit({ 'chats.upsert': [{ id: initialGroup.id, name: 'C1', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 }] })
    store.reset(true)
    ev.emit({ 'chats.upsert': [otherGroup] })
    expect(store.getChats()).toHaveLength(1)
    expect(store.getChat(otherGroup.id)).toBeDefined()
  })
})

describe('getAuth', () => {
  it('returns the internal auth state', () => {
    const store = createStore(undefined)
    const auth = store.getAuth() as ExportableAuthState
    expect(auth.creds).toBeDefined()
    expect(auth.keys).toBeDefined()
    expect(typeof auth.toAuthState).toBe('function')
  })
})

type EventHandler = (events: Partial<BaileysEventMap>) => void | Promise<void>

function createMockEmitter(): Emitter & { emit: (events: Partial<BaileysEventMap>) => void } {
  let handler: EventHandler | undefined
  return {
    process: vi.fn((h: EventHandler) => { handler = h }),
    emit: (events: Partial<BaileysEventMap>) => { void handler?.(events) },
  }
}
