import { AuthenticationState, BaileysEventMap, BufferJSON, Chat as WAChat, Contact as WAContact, WAMessage, WAMessageKey } from '@whiskeysockets/baileys'
import { createExportableAuth } from './auth.js'
import { Chat, WAChatWithId, Contact, WAContactWithId, WAMessageWithId, toChatExt, toContactExt, Message, toMessageExt } from './extTypes.js'
import { consoleLog, ILogger } from './logger.js'

export interface Emitter {
  process: (processor: (e: Partial<BaileysEventMap>) => void) => void
}

export interface WhatsAppStore {
  bind: (ev: Emitter) => void
  getChats: () => Chat[]
  getChat: (jid: string) => Chat | undefined
  getRawChat: (jid: string) => WAChatWithId | undefined
  getContacts: () => Contact[]
  getContact: (jid: string) => Contact | undefined
  getMessages: () => Message[]
  getMessage: (id: string) => Message | undefined
  getMessagesForChat: (jid: string) => Message[]
  reset: (resetAuth: boolean) => void
  getAuth: () => AuthenticationState
}

export interface DataStore {
  chats: Record<string, string>
  contacts: Record<string, string>
  messages: Record<string, string>
  auth: string
}

export interface CreateStoreOptions {
  writeData?: (data: DataStore) => Promise<void>
  logger?: ILogger
}

export function createStore(initialData: DataStore | undefined, options?: CreateStoreOptions): WhatsAppStore {
  const chats = fromRecord<WAChatWithId>(initialData?.chats)
  const contacts = fromRecord<WAContactWithId>(initialData?.contacts)
  const messages = fromRecord<WAMessageWithId>(initialData?.messages)
  let auth = createExportableAuth(initialData?.auth)
  let saveTimeout: NodeJS.Timeout | undefined = undefined
  const logger = options?.logger ?? consoleLog

  function mergeChats(newChats: Partial<WAChat>[]) {
    for (const c of newChats) {
      if (!c.id) continue
      const existing = chats.get(c.id) ?? {}
      const merged = { ...existing, ...c } as WAChatWithId
      chats.set(c.id, merged)
    }
  }

  function deleteChats(ids: string[]) {
    for (const id of ids) {
      chats.delete(id)
    }
  }

  function mergeContacts(newContacts: Partial<WAContact>[]) {
    for (const c of newContacts) {
      if (!c.id) continue
      const existing = contacts.get(c.id) ?? {}
      const merged = { ...existing, ...c } as WAContactWithId
      contacts.set(c.id, merged)
    }
  }

  function mergeMessages(newMessages: Partial<WAMessage>[]) {
    for (const m of newMessages) {
      if (!m.key?.id) continue
      const existing = messages.get(m.key.id) ?? {}
      const merged = { ...existing, ...m } as WAMessageWithId
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
    const writeData = options?.writeData
    if (!writeData) {
      logger.debug('No writeData callback provided, skipping save.')
      return
    }
    logger.debug('Saving WhatsApp store data...')
    const data: DataStore = {
      chats: toRecord(chats),
      contacts: toRecord(contacts),
      messages: toRecord(messages),
      auth: auth.toAuthState(),
    }
    void writeData(data).catch((error: unknown) => {
      logger.error('Error saving WhatsApp store data:', error instanceof Error ? error : new Error(String(error)))
    })
  }

  function reset(resetAuth: boolean) {
    logger.debug(`Resetting WhatsApp store data ${resetAuth ? 'including auth' : ''}`)
    chats.clear()
    contacts.clear()
    messages.clear()
    if (resetAuth) auth = createExportableAuth(undefined)
  }

  function process(e: Partial<BaileysEventMap>) {
    // Store data if no new events come in for 1 second
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(save, 1000)
    logger.trace(`Processing WhatsApp store event: ${JSON.stringify(e)}`)
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
        logger.error(`Error processing WhatsApp store event for key ${key}:`, error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  return {
    bind: (ev) => { ev.process(process) },
    getChats: () => Array.from(chats.values()).map(chat => toChatExt(chat, contacts, logger)).filter(c => !!c),
    getChat: id => toChatExt(chats.get(id), contacts, logger),
    getRawChat: id => chats.get(id),
    getContacts: () => Array.from(contacts.values()).map(contact => toContactExt(contact, logger)).filter(c => !!c),
    getContact: id => toContactExt(contacts.get(id), logger),
    getMessages: () => Array.from(messages.values()).map(m => toMessageExt(m, contacts, logger)).filter(m => !!m),
    getMessagesForChat: id => Array.from(messages.values()).filter(m => m.key.remoteJid === id).map(m => toMessageExt(m, contacts, logger)).filter(m => !!m),
    getMessage: id => toMessageExt(messages.get(id), contacts, logger),
    reset: (resetAuth: boolean) => { reset(resetAuth) },
    getAuth: () => auth,
  }
}

function fromRecord<T>(data: Record<string, string> | undefined): Map<string, T> {
  if (!data) return new Map<string, T>()
  return new Map<string, T>(Object.entries(data).map(([key, value]) => [key, JSON.parse(value, BufferJSON.reviver) as T]))
}

function toRecord<T>(map: Map<string, T>): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [key, value] of map) {
    record[key] = JSON.stringify(value, BufferJSON.replacer)
  }
  return record
}
