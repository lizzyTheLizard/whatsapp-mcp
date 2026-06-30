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
  // Chats without messages are not relevant
  if (!chat.messages) return undefined
  if (chat.messages.length === 0) return undefined
  // Do not return those weirs contact, we do not want them
  if (chat.id.endsWith('@bot')) return undefined
  if (chat.id == '0@s.whatsapp.net') return undefined
  // WhatsApp AI
  if (chat.id === '13135550002@s.whatsapp.net') return undefined
  // Skip ones where archived is undefined. Not sure what those are, but they are not relevant
  if (chat.archived === undefined) return undefined
  const isGroup = chat.id.endsWith('@g.us')
  const name = isGroup ? chat.name : getChatName(chat, contacts, logger)
  const lastMessageTimestamp = getLastMessageTimestamp(chat, chat.messages[0], logger)
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

function getLastMessageTimestamp(chat: WAChatWithId, message: proto.IHistorySyncMsg, logger: ILogger): number | undefined {
  // There are different ways to get the last message timestamp...
  let lastMessageTimestamp = chat.lastMessageRecvTimestamp
    ?? chat.lastMsgTimestamp
    ?? message.message?.messageTimestamp
  // This should not happen, but if it does, we want to know about it
  if (lastMessageTimestamp === undefined || lastMessageTimestamp === null) {
    logger.warn(`chat ${chat.id}) has no last message timestamp`)
    return undefined
  }
  // This is not in the data model but apparently happes...
  if (typeof lastMessageTimestamp === 'string') lastMessageTimestamp = parseInt(lastMessageTimestamp)
  if (typeof lastMessageTimestamp !== 'number') lastMessageTimestamp = lastMessageTimestamp.toNumber()
  return lastMessageTimestamp
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
  const messageTimestamp = getMessageTimestamp(message)
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

function getMessageTimestamp(message: WAMessageWithId): number | undefined {
  if (!message.messageTimestamp) return undefined
  let messageTimestamp = message.messageTimestamp
  // This should not happen, but apparently it does
  if (typeof messageTimestamp === 'string') messageTimestamp = parseInt(messageTimestamp)
  // This should not happen, but apparently it does
  if (typeof messageTimestamp === 'object') {
    if ('high' in (messageTimestamp as object) && 'low' in (messageTimestamp as object)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/restrict-plus-operands
      messageTimestamp = (messageTimestamp as any).high * 0x100000000 + (messageTimestamp as any).low
    }
  }
  if (typeof messageTimestamp !== 'number') messageTimestamp = messageTimestamp.toNumber()
  return messageTimestamp
}

function getFrom(message: WAMessageWithId, contacts: Map<string, WAContactWithId>, logger: ILogger): { jid: string, name: string, phone?: string } | undefined {
  if (message.key.fromMe) return undefined
  const from = message.participant ?? message.key.participant ?? message.key.remoteJid
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
  logger.warn(`Unknown message type: ${Object.keys(message).join(', ')}`)
  return '[Unknown message type]'
}
