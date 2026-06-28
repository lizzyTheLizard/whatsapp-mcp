import { AuthenticationState, BaileysEventMap, BufferJSON, Chat, Contact, WAMessage, WAMessageKey } from '@whiskeysockets/baileys'
import { createExportableAuth } from './auth.js'

export interface ChatWithId extends Chat {
  id: string
}

export interface ContactWithId extends Contact {
  id: string
}

export interface MessageWithId extends WAMessage {
  key: WAMessageKey & { id: string }
}

export interface Emitter {
  process: (processor: (e: Partial<BaileysEventMap>) => void) => void
}

export interface WhatsAppStore {
  bind: (ev: Emitter) => void
  getChats: () => ChatWithId[]
  getChat: (id: string) => ChatWithId | undefined
  getContacts: () => ContactWithId[]
  getContact: (id: string) => ContactWithId | undefined
  getMessages: () => MessageWithId[]
  getMessage: (id: string) => MessageWithId | undefined
  getMessagesForChat: (id: string) => MessageWithId[]
  reset: (resetAuth: boolean) => void
  getAuth: () => AuthenticationState
}

export interface DataStore {
  chats: string
  contacts: string
  messages: string
  auth: string
}

function fromString<T>(data: string | undefined): Map<string, T> {
  if (!data) return new Map<string, T>()
  const parsed = JSON.parse(data) as Record<string, T>
  return new Map<string, T>(Object.entries(parsed))
}

function toString<T>(map: Map<string, T>): string {
  const record: Record<string, T> = {}
  for (const [key, value] of map) {
    record[key] = value
  }
  return JSON.stringify(record, BufferJSON.replacer)
}

export function createStore(saveCb?: (data: DataStore) => Promise<void>, initialData?: DataStore): WhatsAppStore {
  const chats = fromString<ChatWithId>(initialData?.chats)
  const contacts = fromString<ContactWithId>(initialData?.contacts)
  const messages = fromString<MessageWithId>(initialData?.messages)
  let auth = createExportableAuth(initialData?.auth)
  let saveTimeout: NodeJS.Timeout | undefined = undefined

  function mergeChats(newChats: Partial<Chat>[]) {
    for (const c of newChats) {
      if (!c.id) continue
      const existing = chats.get(c.id) ?? {}
      const merged = { ...existing, ...c } as ChatWithId
      chats.set(c.id, merged)
    }
  }

  function deleteChats(ids: string[]) {
    for (const id of ids) {
      chats.delete(id)
    }
  }

  function mergeContacts(newContacts: Partial<Contact>[]) {
    for (const c of newContacts) {
      if (!c.id) continue
      const existing = contacts.get(c.id) ?? {}
      const merged = { ...existing, ...c } as ContactWithId
      contacts.set(c.id, merged)
    }
  }

  function mergeMessages(newMessages: Partial<WAMessage>[]) {
    for (const m of newMessages) {
      if (!m.key?.id) continue
      const existing = messages.get(m.key.id) ?? {}
      const merged = { ...existing, ...m } as MessageWithId
      messages.set(m.key.id, merged)
    }
  }

  function deleteMessages(keys: WAMessageKey[]) {
    for (const key of keys) {
      if (!key.id) continue
      messages.delete(key.id)
    }
  }

  function deleteMessage(jid: string) {
    for (const [id, m] of messages.entries()) {
      if (m.key.remoteJid === jid) {
        messages.delete(id)
      }
    }
  }

  function save() {
    if (!saveCb) {
      console.log('No save callback provided, skipping save of WhatsApp store data')
      return
    }
    console.log('Saving WhatsApp store data...')
    const data: DataStore = {
      chats: toString(chats),
      contacts: toString(contacts),
      messages: toString(messages),
      auth: auth.toAuthState(),
    }
    void saveCb(data).catch((error: unknown) => {
      console.error('Error saving WhatsApp store data:', error)
    })
  }

  function process(e: Partial<BaileysEventMap>) {
    // Store data if no new events come in for 1 second
    if (saveTimeout) clearTimeout(saveTimeout)
    if (saveCb) saveTimeout = setTimeout(save, 1000)
    for (const key of Object.keys(e) as (keyof BaileysEventMap)[]) {
      try {
        switch (key) {
          case 'messaging-history.set':
            mergeChats(e[key]?.chats ?? [])
            mergeContacts(e[key]?.contacts ?? [])
            mergeMessages(e[key]?.messages ?? [])
            break
          case 'chats.delete':
            deleteChats(e[key] ?? [])
            break
          case 'chats.update':
          case 'chats.upsert':
            mergeChats(e[key] ?? [])
            break
          case 'contacts.update':
          case 'contacts.upsert':
            mergeContacts(e[key] ?? [])
            break
          case 'messages.delete':
            if (!e[key]) break
            if ('keys' in e[key])
              deleteMessages(e[key].keys)
            else
              deleteMessage(e[key].jid)
            break
          case 'messages.update':
            mergeMessages(e[key] ?? [])
            break
          case 'messages.upsert':
            mergeMessages(e[key]?.messages ?? [])
            break
        }
      }
      catch (error) {
        handleError(error)
      }
    }
  }

  function handleError(error: unknown) {
    console.error(`Error processing WhatsApp store event: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    bind: (ev) => { ev.process(process) },
    getChats: () => Array.from(chats.values()),
    getChat: id => chats.get(id),
    getContacts: () => Array.from(contacts.values()),
    getContact: id => contacts.get(id),
    getMessages: () => Array.from(messages.values()),
    getMessagesForChat: id => Array.from(messages.values()).filter(m => m.key.remoteJid === id),
    getMessage: id => messages.get(id),
    reset: (resetAuth: boolean) => {
      chats.clear()
      contacts.clear()
      messages.clear()
      if (resetAuth) { auth = createExportableAuth(undefined) }
    },
    getAuth: () => auth,
  }
}
