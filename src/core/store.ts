import makeWASocket, { AuthenticationState, BufferJSON, proto, Chat as WAChat, Contact as WAContact, WAMessage } from '@whiskeysockets/baileys'
import { createExportableAuth, ExportableAuthState } from './auth.js'
import { Chat, WAChatWithId, Contact, WAContactWithId, toChatExt, toContactExt, tsToNumber } from './extTypes.js'
import { ILogger } from './logger.js'
import { DataObject } from './handler.js'

export interface WhatsAppStore {
  getAuth: () => AuthenticationState
  bind: (sock: ReturnType<typeof makeWASocket>) => void
  reset: (resetAuth: boolean) => void
  getChat: (id: string) => Chat | undefined
  getChats: () => Chat[]
  getContact: (id: string) => Contact | undefined
  getContacts: () => Contact[]
  getLastMessageInChat(jid: string): Pick<WAMessage, 'participant' | 'message' | 'messageTimestamp' | 'key'> | undefined
}

export interface WhatsAppStoreOptions {
  logger: ILogger
  update: (data: DataObject) => void
}

export function createStore(initialData: DataObject[] | undefined, { logger, update }: WhatsAppStoreOptions): WhatsAppStore {
  const chats = readChats(initialData)
  const contacts = readContacts(initialData)
  let auth = readAuth(initialData)

  function readChats(initialData: DataObject[] | undefined): Map<string, WAChatWithId> {
    const result = new Map<string, WAChatWithId>()
    if (!initialData) return result
    initialData.filter(d => d.type === 'chat').forEach((d) => {
      result.set(d.id, JSON.parse(d.data, BufferJSON.reviver) as WAChatWithId)
    })
    logger.debug(`Read ${result.size.toString()} chats from initial data`)
    return result
  }

  function readContacts(initialData: DataObject[] | undefined): Map<string, WAContactWithId> {
    const result = new Map<string, WAContactWithId>()
    if (!initialData) return result
    initialData.filter(d => d.type === 'contact').forEach((d) => {
      result.set(d.id, JSON.parse(d.data, BufferJSON.reviver) as WAContactWithId)
    })
    logger.debug(`Read ${result.size.toString()} contacts from initial data`)
    return result
  }

  function readAuth(initialData: DataObject[] | undefined): ExportableAuthState {
    if (!initialData) return createExportableAuth(undefined)
    const authData = initialData.filter(d => d.type === 'auth')
    if (authData.length !== 1) throw new Error(`Expected exactly one auth data object, but found ${authData.length.toString()}`)
    return createExportableAuth(authData[0].data)
  }

  function bind(sock: ReturnType<typeof makeWASocket>) {
    sock.ev.on('messaging-history.set', (e) => {
      mergeChats(e.chats, chats, update)
      mergeContacts(e.contacts, contacts, update)
      logger.debug(`Processed ${e.chats.length.toString()} chats and ${e.contacts.length.toString()} contacts from history sync with type ${e.syncType?.toString() ?? 'unknown'}`)
    })
    sock.ev.on('chats.update', (e) => {
      mergeChats(e, chats, update)
      logger.debug(`Processed ${e.length.toString()} chats to update`)
    })
    sock.ev.on('chats.upsert', (e) => {
      mergeChats(e, chats, update)
      logger.debug(`Processed ${e.length.toString()} chats to upsert`)
    })
    sock.ev.on('contacts.update', (e) => {
      mergeContacts(e, contacts, update)
      logger.debug(`Processed ${e.length.toString()} contacts to update`)
    })
    sock.ev.on('contacts.upsert', (e) => {
      mergeContacts(e, contacts, update)
      logger.debug(`Processed ${e.length.toString()} contacts to upsert`)
    })
    sock.ev.on('creds.update', () => {
      update({ id: 'auth', type: 'auth', data: auth.toAuthState() })
    })
    sock.ev.process((e) => { logger.debug(`Received event ${Object.keys(e).join(', ')}`) })
  }

  function getChat(id: string): Chat | undefined {
    const mergedChat = getMergedChat(id, chats)
    return toChatExt(mergedChat, contacts, logger)
  }

  function getChats(): Chat[] {
    const mergedChats = getMergedChats(chats)
    return mergedChats
      .map(c => toChatExt(c, contacts, logger))
      .filter(c => !!c)
  }

  function getContact(id: string): Contact | undefined {
    const mergedContact = getMergedContact(id, contacts)
    if (!mergedContact) return undefined
    return toContactExt(mergedContact, logger)
  }

  function getContacts(): Contact[] {
    return Array.from(contacts.values())
      .map(c => toContactExt(c, logger))
      .filter(c => !!c)
  }

  function reset(resetAuth: boolean) {
    logger.debug(`Resetting WhatsApp store data ${resetAuth ? 'including auth' : ''}`)
    chats.clear()
    contacts.clear()
    if (resetAuth) auth = createExportableAuth(undefined)
  }

  function getAuth(): AuthenticationState {
    return auth
  }

  function getLastMessageInChat(id: string): Pick<WAMessage, 'participant' | 'message' | 'messageTimestamp' | 'key'> | undefined {
    const lastMessage = getLastMessage(id, chats)
    const key = lastMessage?.key
    if (!lastMessage || !key) throw new Error(`Last message for chat ${id} does not have a key. Please make sure the chat exists and has messages before fetching messages.`)
    return { ...lastMessage, key }
  }

  return { getAuth, bind, reset, getChat, getChats, getContact, getContacts, getLastMessageInChat }
}

function mergeChats(newChats: Partial<WAChat>[], existingChats: Map<string, WAChatWithId>, update: (data: DataObject) => void) {
  for (const c of newChats) {
    if (!c.id) throw new Error('Received chat with no id: ' + JSON.stringify(c))
    const existing = existingChats.get(c.id) ?? { messages: undefined }
    const merged = { ...existing, ...c } as WAChatWithId
    merged.messages = [...(existing.messages ?? []), ...(c.messages ?? [])]
      .sort((a, b) => (tsToNumber(b.message?.messageTimestamp) ?? 0) - (tsToNumber(a.message?.messageTimestamp) ?? 0))
      .slice(0, 1)
    update({ id: c.id, type: 'chat', data: JSON.stringify(merged, BufferJSON.replacer) })
    existingChats.set(c.id, merged)
  }
}

function mergeContacts(newContacts: Partial<WAContact>[], existingContacts: Map<string, WAContactWithId>, update: (data: DataObject) => void) {
  for (const c of newContacts) {
    if (!c.id) throw new Error('Received contact with no id: ' + JSON.stringify(c))
    const existing = existingContacts.get(c.id) ?? {}
    const merged = { ...existing, ...c } as WAContactWithId
    update({ id: c.id, type: 'contact', data: JSON.stringify(merged, BufferJSON.replacer) })
    existingContacts.set(c.id, merged)
  }
}

function getMergedContact(id: string, contacts: Map<string, WAContactWithId>): WAContactWithId | undefined {
  const contact = contacts.get(id)
  if (contact) return contact
  // We could get here a lid or a jid and the contact might be stored under either of them. We need to check both
  if (id.endsWith('@lid')) {
    const lidContact = Array.from(contacts.values()).find(c => c.lid === id)
    return lidContact
  }
  else {
    const jidContact = Array.from(contacts.values()).find(c => c.phoneNumber === id)
    return jidContact
  }
}

function getMergedChat(id: string, chats: Map<string, WAChatWithId>): WAChatWithId | undefined {
  // The informations for chats can be stored at different places
  // Either under the lid (has precedence) or under the jid, or both.
  // We need to manually merge the two
  const chat = chats.get(id)
  if (!chat) return undefined
  if (id.endsWith('@lid')) {
    const jidChat = Array.from(chats.values()).find(c => c.accountLid === id)
    if (!jidChat) return chat
    return { ...jidChat, ...chat }
  }
  else {
    if (!chat.accountLid) return chat
    const lidChat = chats.get(chat.accountLid)
    if (!lidChat) return chat
    return { ...chat, ...lidChat }
  }
}

function getMergedChats(chats: Map<string, WAChatWithId>): WAChatWithId[] {
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
}

function getLastMessage(id: string, chats: Map<string, WAChatWithId>): proto.IWebMessageInfo | undefined {
  // The informations for chats can be stored at different places
  // Either under the lid (has precedence) or under the jid, or both.
  // We need to manually merge the two
  const chat = chats.get(id)
  if (!chat) return undefined
  const messages: proto.IHistorySyncMsg[] = chat.messages ?? []
  if (id.endsWith('@lid')) {
    const jidChat = Array.from(chats.values()).find(c => c.accountLid === id)
    if (jidChat?.messages) messages.push(...jidChat.messages)
  }
  else if (chat.accountLid) {
    const lidChat = chats.get(chat.accountLid)
    if (lidChat?.messages) messages.push(...lidChat.messages)
  }
  const collectedMessages = messages
    .flatMap(m => m.message ? [m.message] : [])
    .sort((a, b) => (tsToNumber(b.messageTimestamp) ?? 0) - (tsToNumber(a.messageTimestamp) ?? 0))
    .splice(0, 1)
  if (collectedMessages.length === 0)
    return undefined
  return collectedMessages[0]
}
