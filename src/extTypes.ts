import { proto, Chat as WAChat, Contact as WAContact, WAMessage, WAMessageKey } from '@whiskeysockets/baileys'
import { ILogger } from './logger.js'

export interface WAContactWithId extends WAContact { id: string }

export interface Contact {
  jid: string
  name: string
  phone: string
}

export function toContactExt(contact: WAContactWithId | undefined, logger: ILogger): Contact | undefined {
  if (!contact) return undefined
  // If they have no name, they are not actually stored contacts but rather just people you have chatted with, so we don't want to return them
  if (!contact.name) return undefined
  // Do not return groups
  if (contact.id.endsWith('@g.us')) return undefined
  // Do not return those weirs contact, we do not want them
  if (contact.name == 'Meta AI') return undefined
  if (contact.id == '0@s.whatsapp.net') return undefined
  // For all the others, this should not happen, but if it does, we want to know about it
  if (!contact.phoneNumber) {
    logger.warn(`Contact ${contact.id} has no phone number`)
    return undefined
  }
  return {
    jid: contact.id,
    name: contact.name,
    phone: whatsAppNameToPhomeNumber(contact.phoneNumber, logger),
  }
}

function whatsAppNameToPhomeNumber(whatsappid: string, logger: ILogger): string {
  // Format the number as +<country code> <area code> <local number>
  const match = /^(41)(\d{2})(\d{3})(\d{2})(\d{2})@s\.whatsapp\.net$/.exec(whatsappid)
  if (match) {
    return `+${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`
  }
  if (whatsappid.endsWith('@s.whatsapp.net')) {
    return `+${whatsappid.slice(0, -15)}`
  }
  logger.warn(`Unknown WhatsApp ID format: ${whatsappid}`)
  return whatsappid
}

export interface WAChatWithId extends WAChat { id: string }

export interface Chat {
  jid: string
  unreadCount: number
  readOnly: boolean
  name: string
  archived: boolean
  lastMessageTimestamp: number
  isGroup: boolean
}

export function toChatExt(chat: WAChatWithId | undefined, contacts: Map<string, WAContactWithId>, logger: ILogger): Chat | undefined {
  if (!chat) return undefined
  // Do not return those weird contact, we do not want them
  if (chat.id.endsWith('@bot')) return undefined
  if (chat.id.endsWith('@broadcast')) return undefined
  if (chat.id == '0@s.whatsapp.net') return undefined
  // WhatsApp AI, not sure if this jid is constant...
  if (chat.id === '13135550002@s.whatsapp.net') return undefined
  // Skip ones where archived is undefined. Not sure what those are, but they are not relevant
  if (chat.archived === undefined) return undefined
  const isGroup = chat.id.endsWith('@g.us')
  const name = isGroup ? chat.name : getChatName(chat, contacts, logger)
  const lastMessageTimestamp = getLastMessageTimestamp(chat, chat.messages?.[0], logger)
  // Now sure that those actually are, but thy are not relevant
  if (!name) return undefined
  if (!lastMessageTimestamp) return undefined
  return {
    jid: chat.id,
    unreadCount: chat.unreadCount ?? 0,
    readOnly: chat.readOnly ?? false,
    name: name,
    archived: chat.archived ?? false,
    isGroup: isGroup,
    lastMessageTimestamp,
  }
}

function getLastMessageTimestamp(chat: WAChatWithId, message: proto.IHistorySyncMsg | undefined, logger: ILogger): number | undefined {
  // There are different ways to get the last message timestamp...
  return Math.max(
    tsToNumber(message?.message?.messageTimestamp, logger) ?? 0,
    tsToNumber(chat.lastMsgTimestamp, logger) ?? 0,
    tsToNumber(chat.lastMessageRecvTimestamp, logger) ?? 0,
  )
}

export function tsToNumber(ts: number | Long | null | undefined, logger: ILogger): number | undefined {
  if (ts === undefined || ts === null) return undefined
  if (typeof ts === 'number') return ts
  if (typeof ts === 'object' && 'toNumber' in ts) return ts.toNumber()
  // In theory, this should not happen, but apparently it does
  if (typeof ts === 'string') return parseInt(ts)
  if (typeof ts === 'object' && 'high' in ts && 'low' in ts) {
    const cast = ts as { high: number, low: number }
    return cast.high * 0x100000000 + cast.low
  }
  logger.warn(`Unknown timestamp format (${typeof ts}): ${ts}`)
  return undefined
}

function getChatName(chat: WAChatWithId, contacts: Map<string, WAContactWithId>, logger: ILogger): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (chat.id.endsWith('@g.us')) return chat.name!
  const contact = Array.from(contacts.values()).find(c => ((!!c.lid && c.lid === chat.id) || c.id === chat.id || (!!chat.accountLid && c.id === chat.accountLid) || (!!c.lid && !!chat.accountLid && c.lid === chat.accountLid)))
  if (contact?.name) return contact.name
  if (contact?.phoneNumber) return whatsAppNameToPhomeNumber(contact.phoneNumber, logger)
  return 'Unknown Contact'
}

export interface Message {
  id: string
  from?: {
    jid: string
    name: string
    phone?: string
  }
  message: string
  messageTimestamp: number
}

export interface WAMessageWithId extends WAMessage { key: WAMessageKey & { id: string } }

export function toMessageExt(message: WAMessageWithId | undefined, contacts: Map<string, WAContactWithId>, logger: ILogger): Message | undefined {
  if (!message) return undefined
  // Only messages with content are relevant
  if (!message.message) { return undefined }
  // Status updates are not relevant
  if (message.key.remoteJid === 'status@broadcast') { return undefined }
  // This should not happen, but if it does, we want to know about it
  const messageTimestamp = tsToNumber(message.messageTimestamp, logger)
  if (!messageTimestamp) {
    logger.warn(`Message ${message.key.id} has no message timestamp`)
    return undefined
  }
  const messageContent = getMessageContent(message.message, logger)
  if (!messageContent) return undefined
  const from = getFrom(message, contacts, logger)
  return {
    id: message.key.id,
    from: from,
    message: messageContent,
    messageTimestamp: messageTimestamp,
  }
}

function getFrom(message: WAMessageWithId, contacts: Map<string, WAContactWithId>, logger: ILogger): { jid: string, name: string, phone?: string } | undefined {
  if (message.key.fromMe) return undefined
  // Different types of participants info is used... And it can even be an empty string if not filled!
  const from = notEmpty(message.participant) ?? notEmpty(message.key.participant) ?? notEmpty(message.key.remoteJid)
  if (!from) {
    logger.warn(`Message ${message.key.id} has no from or participant`)
    return undefined
  }
  if (from.endsWith('@g.us')) {
    logger.warn(`Message ${message.key.id} is from a group, not a personal number, from: ${from}`)
    return undefined
  }
  const contact = Array.from(contacts.values()).find(c => ((!!c.lid && c.lid === from) || c.id === from))
  if (!contact && from.endsWith('@lid')) {
    // TODO: It might be possible to get the phone number from the lid, using lid mappings, but for now we will just return the lid as the id
    return { jid: from, name: from }
  }
  if (!contact && from.endsWith('@s.whatsapp.net')) {
    const phone = whatsAppNameToPhomeNumber(from, logger)
    return { jid: from, name: phone, phone }
  }
  if (!contact) {
    logger.warn(`Message ${message.key.id} is from an unknown contact, from: ${from}`)
    return { jid: from, name: from }
  }
  const phone = contact.phoneNumber
    ? whatsAppNameToPhomeNumber(contact.phoneNumber, logger)
    : (from.endsWith('@s.whatsapp.net') ? whatsAppNameToPhomeNumber(from, logger) : undefined)
  const name = contact.name ?? contact.notify ?? contact.username ?? phone
  if (!name && from.endsWith('@lid')) {
    // TODO: It might be possible to get the phone number from the lid, using lid mappings, but for now we will just return the lid as the id
    return { jid: from, name: from }
  }
  else if (!name) {
    logger.warn(`Message ${message.key.id} is from a contact with no name, from: ${from}`)
    return { jid: from, name: from, phone }
  }
  return { jid: from, name, phone: phone }
}

function notEmpty(s: string | null | undefined): string | undefined {
  if (s === undefined || s === null) return undefined
  if (s.trim().length === 0) return undefined
  return s
}

function getMessageContent(message: proto.IMessage, logger: ILogger): string | undefined {
  if (message.protocolMessage) return undefined
  if (message.conversation) return message.conversation
  if (message.associatedChildMessage) return undefined
  if (message.reactionMessage) return undefined
  if (message.extendedTextMessage) return message.extendedTextMessage.text ?? '[Extended text message]'
  if (message.imageMessage) return '[Image: ' + (message.imageMessage.caption ?? 'no text') + ']'
  if (message.videoMessage) return '[Video: ' + (message.videoMessage.caption ?? 'no text') + ']'
  if (message.documentMessage) return '[Document: ' + (message.documentMessage.caption ?? 'no text') + ']'
  if (message.locationMessage) return '[Location: ' + (message.locationMessage.comment ?? 'no text') + ']'
  if (message.liveLocationMessage) return '[LiveLocation: ' + (message.liveLocationMessage.caption ?? 'no text') + ']'
  if (message.stickerMessage) return '[Sticker]'
  if (message.albumMessage) return '[Album]'
  if (message.audioMessage) return '[Audio]'
  if (message.pollCreationMessageV3) return '[Poll: ' + (message.pollCreationMessageV3.name ?? 'no text') + ']'
  if (message.templateMessage) return '[Template]'
  if (message.interactiveMessage) return '[Interactive]'
  logger.warn(`Unknown message type: ${Object.keys(message).join(', ')}`)
  return '[Unknown message type]'
}
