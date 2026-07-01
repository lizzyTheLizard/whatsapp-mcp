import { WAMessageWithId } from '../src/extTypes.js'
import { DataStore } from '../src/store.js'

export function createMessage(id: string, chatId: string = initialContact.id): WAMessageWithId {
  return { key: { id, remoteJid: chatId }, message: { conversation: 'hello' }, messageTimestamp: 1000 }
}

export const initialContact = { id: 'c1@s.whatsapp.net', name: 'Contact', phoneNumber: '41791234567@s.whatsapp.net' }
export const otherContact = { id: 'c2@s.whatsapp.net', name: 'Contact 2', phoneNumber: '41791234568@s.whatsapp.net' }
export const initialGroup = { id: 'c1@g.us', name: 'Chat', messages: [{}], archived: false, lastMessageRecvTimestamp: 1000 }
export const otherGroup = { id: 'c2@g.us', name: 'C2', messages: [{}], archived: false, lastMessageRecvTimestamp: 2000 }
export const initialMessage = createMessage('m1')

export const initialDataStore: DataStore = {
  chats: { 'c1@g.us': JSON.stringify(initialGroup) },
  contacts: { 'c1@s.whatsapp.net': JSON.stringify(initialContact) },
  messages: { m1: JSON.stringify(initialMessage) },
  auth: '',
}
