import { AuthenticationState, BaileysEventMap, BufferJSON, MinimalMessage, Chat as WAChat, Contact as WAContact, WAMessage, WAMessageKey } from '@whiskeysockets/baileys'
import { createExportableAuth } from './auth.js'
import { Chat, WAChatWithId, Contact, WAContactWithId, WAMessageWithId, toChatExt, toContactExt, Message, toMessageExt, tsToNumber } from './extTypes.js'
import { consoleLog, ILogger } from './logger.js'

export interface Emitter {
  process: (processor: (e: Partial<BaileysEventMap>) => void) => void
}

export interface WhatsAppStore {
  bind: (ev: Emitter) => void
  getChat: (id: string) => Chat | undefined
  getChats: () => Chat[]
  getContact: (id: string) => Contact | undefined
  getContacts: () => Contact[]
  getMessage: (id: string) => Message | undefined
  getMessages: () => Message[]
  getMessagesForChat: (chatId: string) => Message[]
  reset: (resetAuth: boolean) => void
  getAuth: () => AuthenticationState
}

export interface WhatsAppStoreExtension {
  getLastMessageInChat(jid: string): MinimalMessage[]

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

export function createStore(initialData: DataStore | undefined, options?: CreateStoreOptions): WhatsAppStore & WhatsAppStoreExtension {
  const chats = fromRecord<WAChatWithId>(initialData?.chats)
  const contacts = fromRecord<WAContactWithId>(initialData?.contacts)
  const messages = fromRecord<WAMessageWithId>(initialData?.messages)
  let auth = createExportableAuth(initialData?.auth)
  let saveTimeout: NodeJS.Timeout | undefined = undefined
  const logger = options?.logger ?? consoleLog

  function bind(ev: Emitter) {
    ev.process(process)
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

  function mergeChats(newChats: Partial<WAChat>[]) {
    for (const c of newChats) {
      if (!c.id) {
        logger.warn('Received chat with no id, ignoring:' + JSON.stringify(c))
        continue
      }
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
      if (!c.id) {
        logger.warn('Received contact with no id, ignoring:' + JSON.stringify(c))
        continue
      }
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

  function getChat(id: string): Chat | undefined {
    // The informations for chats can be stored at different places
    // Either under the lid (has precedence) or under the jid, or both.
    // We need to manually merge the two
    const chat = chats.get(id)
    if (!chat) return undefined
    if (id.endsWith('@lid')) {
      const jidChat = Array.from(chats.values()).find(c => c.accountLid === id)
      if (!jidChat) return toChatExt(chat, contacts, logger)
      return toChatExt({ ...jidChat, ...chat }, contacts, logger)
    }
    else {
      if (!chat.accountLid) return toChatExt(chat, contacts, logger)
      const lidChat = chats.get(chat.accountLid)
      if (!lidChat) return toChatExt(chat, contacts, logger)
      return toChatExt({ ...chat, ...lidChat }, contacts, logger)
    }
  }

  function getChats(): Chat[] {
    // The informations for chats can be stored at different places
    // Either under the lid (has precedence) or under the jid, or both.
    // We need to manually merge the two
    // First, collect all JID chats, the overwrite it with the info from lid chats
    const cleanedList = new Map<string, WAChatWithId>()
    chats.forEach((value, id) => {
      if (id.endsWith('@lid')) return
      cleanedList.set(id, value)
    })
    chats.forEach((value, id) => {
      if (!id.endsWith('@lid')) return
      const jid = Array.from(chats.values()).find(c => c.accountLid === id)?.id
      if (!jid) return
      cleanedList.set(jid, { ...cleanedList.get(jid), ...value })
    })
    return Array.from(cleanedList.values())
      .map(c => toChatExt(c, contacts, logger))
      .filter(c => !!c)
  }

  function getContact(id: string): Contact | undefined {
    const contact = contacts.get(id)
    if (contact) return toContactExt(contact, logger)
    // We could get here a lid or a jid and the contact might be stored under either of them. We need to check both
    if (id.endsWith('@lid')) {
      const lidContact = Array.from(contacts.values()).find(c => c.lid === id)
      return toContactExt(lidContact, logger)
    }
    else {
      const jidContact = Array.from(contacts.values()).find(c => c.phoneNumber === id)
      return toContactExt(jidContact, logger)
    }
  }

  function getContacts(): Contact[] {
    return Array.from(contacts.values())
      .map(c => toContactExt(c, logger))
      .filter(c => !!c)
  }

  function getMessage(id: string): Message | undefined {
    const m = messages.get(id)
    if (!m) return undefined
    return toMessageExt(m, contacts, logger)
  }

  function getMessages(): Message[] {
    return Array.from(messages.values())
      .map(m => toMessageExt(m, contacts, logger))
      .filter(m => !!m)
  }

  function getMessagesForChat(chatId: string): Message[] {
    // The messages can be stored under the jid or the lid of the chat.
    // So first get all possible IDs
    const chatIds = [chatId]
    if (chatId.endsWith('@lid')) {
      const jidChat = Array.from(chats.values()).find(c => c.accountLid === chatId)
      if (jidChat) chatIds.push(jidChat.id)
    }
    else {
      const chat = chats.get(chatId)
      if (chat?.accountLid) chatIds.push(chat.accountLid)
    }
    // The get all messages from both IDs ordered by time
    return Array.from(messages.values())
      .filter(m => m.key.remoteJid && chatIds.includes(m.key.remoteJid))
      .sort((a, b) => (tsToNumber(a.messageTimestamp, logger) ?? 0) - (tsToNumber(b.messageTimestamp, logger) ?? 0))
      .map(m => toMessageExt(m, contacts, logger))
      .filter(m => !!m)
  }

  function reset(resetAuth: boolean) {
    logger.debug(`Resetting WhatsApp store data ${resetAuth ? 'including auth' : ''}`)
    chats.clear()
    contacts.clear()
    messages.clear()
    if (resetAuth) auth = createExportableAuth(undefined)
  }

  function getAuth(): AuthenticationState {
    return auth
  }

  function getLastMessageInChat(jid: string): MinimalMessage[] {
    return Array.from(messages.values())
      .filter(m => m.key.remoteJid && jid === m.key.remoteJid)
      .sort((a, b) => (tsToNumber(b.messageTimestamp, logger) ?? 0) - (tsToNumber(a.messageTimestamp, logger) ?? 0))
      .splice(0, 1)
      .map(m => ({ key: { participant: m.participant, ...m.key }, messageTimestamp: m.messageTimestamp }))
  }

  return {
    bind, getChat, getChats, getContact, getContacts, getMessage, getMessages, getMessagesForChat, reset, getAuth, getLastMessageInChat,
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
