import { proto, Chat as WAChat, Contact as WAContact, WAMessage, WAMessageKey } from '@whiskeysockets/baileys'
import { ILogger } from './logger.js'

export function tsToNumber(ts: number | Long | null | undefined): number | undefined {
  if (ts === undefined || ts === null) return undefined
  if (typeof ts === 'number') return ts
  if (typeof ts === 'object' && 'toNumber' in ts) return ts.toNumber()
  // In theory, this should not happen, but apparently it does
  if (typeof ts === 'string') return parseInt(ts)
  if (typeof ts === 'object' && 'high' in ts && 'low' in ts) {
    const cast = ts as { high: number, low: number }
    return cast.high * 0x100000000 + cast.low
  }
  throw new Error(`Unknown timestamp format (${typeof ts}): ${JSON.stringify(ts)}`)
}

export interface WAContactWithId extends WAContact { id: string }

export interface Contact {
  jid: string
  name: string
  phone: string
}

export function toContactExt(contact: WAContactWithId, logger: ILogger): Contact | undefined {
  // If they have no name, they are not actually stored contacts but rather just people you have chatted with, so we don't want to return them
  if (!contact.name) return undefined
  // Do not return groups
  if (contact.id.endsWith('@g.us')) return undefined
  // Do not return those weird contact, we do not want them
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
    phone: whatsAppNameToPhoneNumber(contact.phoneNumber, logger),
  }
}

function whatsAppNameToPhoneNumber(whatsappid: string, logger: ILogger): string {
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
  name: string
  archived: boolean
  lastMessageTimestamp: string
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
  const name = getChatName(chat, contacts, logger)
  const lastMessageTimestamp = getLastMessageTimestamp(chat, chat.messages?.[0], logger)
  // Now sure that those actually are, but thy are not relevant
  if (!name) return undefined
  if (!lastMessageTimestamp) return undefined
  return {
    jid: chat.id,
    unreadCount: chat.unreadCount ?? 0,
    name: name,
    archived: chat.archived ?? false,
    isGroup: isGroup,
    lastMessageTimestamp,
  }
}

function getChatName(chat: WAChatWithId, contacts: Map<string, WAContactWithId>, logger: ILogger): string {
  if (chat.id.endsWith('@g.us')) {
    if (chat.name) return chat.name
    throw new Error(`Group chat ${chat.id} has no name. Please make sure the chat exists and has a name before fetching chats.`)
  }
  const contact = Array.from(contacts.values()).find(c => ((!!c.lid && c.lid === chat.id) || c.id === chat.id || (!!chat.accountLid && c.id === chat.accountLid) || (!!c.lid && !!chat.accountLid && c.lid === chat.accountLid)))
  if (contact?.name) return contact.name
  if (contact?.phoneNumber) return whatsAppNameToPhoneNumber(contact.phoneNumber, logger)
  logger.warn(`Chat ${chat.id} has no contact with a name or phone number`)
  return 'Unknown Contact'
}

function getLastMessageTimestamp(chat: WAChatWithId, message: proto.IHistorySyncMsg | undefined, logger: ILogger): string | undefined {
  // There are different ways to get the last message timestamp...
  const ts = Math.max(
    tsToNumber(message?.message?.messageTimestamp) ?? 0,
    tsToNumber(chat.lastMsgTimestamp) ?? 0,
    tsToNumber(chat.lastMessageRecvTimestamp) ?? 0,
  )
  if (ts === 0) logger.warn(`Chat ${chat.id} has no last message timestamp. Please make sure the chat exists and has messages before fetching chats.`)
  return new Date(ts * 1000).toISOString()
}

export interface Message {
  id: string
  from?: {
    jid: string
    name: string
    phone?: string
  }
  message: string
  messageTimestamp: string
}

export function toMessageExt(message: Pick<WAMessage, 'participant' | 'message' | 'messageTimestamp' | 'key'>, contacts: Map<string, WAContactWithId>, logger: ILogger): Message | undefined {
  // Status updates are not relevant
  if (message.key.remoteJid === 'status@broadcast') { return undefined }
  // Message without IDs are not relevant
  if (!message.key.id) { return undefined }
  // This should not happen, but if it does, we want to know about it
  const messageTimestamp = tsToNumber(message.messageTimestamp)
  if (!messageTimestamp) {
    logger.warn(`Message ${message.key.id} has no message timestamp`)
    return undefined
  }
  const messageTimestampString = new Date(messageTimestamp * 1000).toISOString()
  const messageContent = getMessageContent(message.message, logger)
  if (!messageContent) {
    // message has no content, its not relevant
    return undefined
  }
  const from = getFrom(message, contacts, logger)
  return {
    id: message.key.id,
    from: from,
    message: messageContent,
    messageTimestamp: messageTimestampString,
  }
}

function getFrom(message: Pick<WAMessage, 'participant'> & { key: WAMessageKey }, contacts: Map<string, WAContactWithId>, logger: ILogger): { jid: string, name: string, phone?: string } | undefined {
  if (message.key.fromMe) return undefined
  // Different types of participants info is used... And it can even be an empty string if not filled!
  const from = notEmpty(message.participant) ?? notEmpty(message.key.participant) ?? notEmpty(message.key.remoteJid)
  if (!from) {
    logger.warn(`Message ${JSON.stringify(message.key)} has no from or participant`)
    return undefined
  }
  if (from.endsWith('@g.us')) {
    logger.warn(`Message ${JSON.stringify(message.key)} is from a group, not a personal number, from: ${from}`)
    return undefined
  }
  const contact = Array.from(contacts.values()).find(c => ((!!c.lid && c.lid === from) || c.id === from))
  if (!contact) {
    const phone = from.endsWith('@s.whatsapp.net') ? whatsAppNameToPhoneNumber(from, logger) : undefined
    return { jid: from, name: phone ?? from, phone }
  }
  const phone = contact.phoneNumber
    ? whatsAppNameToPhoneNumber(contact.phoneNumber, logger)
    : (from.endsWith('@s.whatsapp.net') ? whatsAppNameToPhoneNumber(from, logger) : undefined)
  const name = contact.name ?? contact.notify ?? contact.username ?? phone
  if (!name && from.endsWith('@lid')) return { jid: from, name: from }
  if (!name) return { jid: from, name: from, phone }
  return { jid: from, name, phone: phone }
}

function notEmpty(s: string | null | undefined): string | undefined {
  if (s === undefined || s === null) return undefined
  if (s.trim().length === 0) return undefined
  return s
}

function getMessageContent(message: WAMessage['message'], logger: ILogger): string | undefined {
  if (!message) return undefined
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
