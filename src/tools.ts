import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp'
import { ChatWithId, ContactWithId, MessageWithId, WhatsAppStore } from './store.js'
import { WhatsAppHandler } from './sync.js'
import { CallToolResult, ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types'
import z from 'zod'
import { WAMessage } from '@whiskeysockets/baileys'

export function registerWhatsAppTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  registerChatsResources(server, store)
  registerContactsResources(server, store)
  registerMessagesResources(server, store)
  registerMessageTools(server, sync)
  registerChatTools(server, sync)
}

function registerChatsResources(server: McpServer, store: WhatsAppStore) {
  server.registerResource(
    'chats',
    'chats://app',
    { title: 'All WhatsApp Chats', description: 'List WhatsApp chats', mimeType: 'application/json' },
    () => toReadResource(store.getChats().flatMap(chatToReadResource)))
  server.registerResource(
    'chat',
    new ResourceTemplate('chats://app/{chatId}', { list: () => toListResource(store.getChats().flatMap(chatToListResource)) }),
    { title: 'A single WhatsApp Chat', description: 'Details of a single WhatsApp chat', mimeType: 'application/json' },
    (_, { chatId }) => toReadResource(chatToReadResource(store.getChat(chatId as string))))
}

const chatToReadResource = (chat: ChatWithId | undefined) => chat
  ? [{ uri: `chats://app/${chat.id}`, mimeType: 'application/json', text: JSON.stringify(chat) }]
  : []

const chatToListResource = (chat: ChatWithId | undefined) => chat
  ? [{ uri: `chats://app/${chat.id}`, name: chat.name ?? chat.id }]
  : []

function registerContactsResources(server: McpServer, store: WhatsAppStore) {
  server.registerResource(
    'contacts',
    'contacts://app',
    { title: 'All WhatsApp Contacts', description: 'List WhatsApp contacts', mimeType: 'application/json' },
    () => toReadResource(store.getContacts().flatMap(contactToReadResource)))
  server.registerResource(
    'contact',
    new ResourceTemplate('contacts://app/{contactId}', { list: () => toListResource(store.getContacts().flatMap(contactToListResource)) }),
    { title: 'A single WhatsApp Contact', description: 'Details of a single WhatsApp contact', mimeType: 'application/json' },
    (_, { contactId }) => toReadResource(contactToReadResource(store.getContact(contactId as string))))
}

const contactToReadResource = (contact: ContactWithId | undefined) => contact
  ? [{ uri: `contacts://app/${contact.id}`, mimeType: 'application/json', text: JSON.stringify(contact) }]
  : []

const contactToListResource = (contact: ContactWithId | undefined) => contact
  ? [{ uri: `contacts://app/${contact.id}`, name: contact.name ?? contact.id }]
  : []

function registerMessagesResources(server: McpServer, store: WhatsAppStore) {
  server.registerResource(
    'messages',
    'messages://app',
    { title: 'All WhatsApp Messages', description: 'List WhatsApp messages', mimeType: 'application/json' },
    () => toReadResource(store.getMessages().flatMap(messageToReadResource)))
  server.registerResource(
    'message',
    new ResourceTemplate('messages://app/{messageId}', { list: () => toListResource(store.getMessages().flatMap(messageToListResource)) }),
    { title: 'A single WhatsApp Message', description: 'Details of a single WhatsApp message', mimeType: 'application/json' },
    (_, { messageId }) => toReadResource(messageToReadResource(store.getMessage(messageId as string))))
}

const messageToReadResource = (message: MessageWithId | undefined) => message
  ? [{ uri: `messages://app/${message.key.id}`, mimeType: 'application/json', text: JSON.stringify(message) }]
  : []

const messageToListResource = (message: MessageWithId | undefined) => message
  ? [{ uri: `messages://app/${message.key.id}`, name: message.key.id }]
  : []

const toReadResource = (t: ReadResourceResult['contents']) => ({ contents: t })
const toListResource = (t: ListResourcesResult['resources']) => ({ resources: t })

function registerMessageTools(server: McpServer, sync: WhatsAppHandler) {
  server.registerTool(
    'send_message',
    { description: 'Send a WhatsApp-Message to a given JID.', inputSchema: SendMessageSchema },
    args => sync.sendMessage(args.jid, args.message).then(messageToText).then(toCallResult).catch(toCallError),
  )
}

const messageToText = (message: WAMessage): string => {
  return `Message sent to ${message.key.remoteJid ?? 'unknown'}: "${message.message?.conversation ?? 'unknown'}"`
}

function registerChatTools(server: McpServer, sync: WhatsAppHandler) {
  server.registerTool(
    'set_chat_archived',
    { description: 'Set a WhatsApp chat as archived or unarchived.', inputSchema: ArchiveChatSchema },
    args => sync.setArchived(args.jid, args.archived).then(() => `Chat ${args.jid} archived status set to ${args.archived.toString()}`).then(toCallResult).catch(toCallError),
  )
  server.registerTool(
    'set_chat_read',
    { description: 'Set a WhatsApp chat as read or unread.', inputSchema: ReadChatSchema },
    args => sync.setRead(args.jid, args.read).then(() => `Chat ${args.jid} read status set to ${args.read.toString()}`).then(toCallResult).catch(toCallError),
  )
}

const JidSchema = z.union([
  z.string().min(1, 'JID is required').endsWith('@s.whatsapp.net', 'JID not a valid WhatsApp JID)'),
  z.string().min(1, 'JID is required').endsWith('@g.us', 'JID not a valid WhatsApp JID)'),
]).describe('The JID of the recipient or chat. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group')

const SendMessageSchema = z.object({
  jid: JidSchema,
  message: z.string()
    .min(1, 'Message body is required')
    .describe('The body of the message to be sent. Can contain unicode characters like emojis.'),
})

const ArchiveChatSchema = z.object({
  jid: JidSchema,
  archived: z.boolean()
    .describe('Whether the chat should be archived (true) or unarchived (false).'),
})

const ReadChatSchema = z.object({
  jid: JidSchema,
  read: z.boolean()
    .describe('Whether the chat should be marked as read (true) or unread (false).'),
})

const toCallResult = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }], isError: false })
const toCallError = (error: Error): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true })

/*

const ListChatsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
});

const ReadMessagesSchema = z.object({
  chatId: z.string().min(1, "Chat ID is required"),
  limit: z.number().int().positive().optional().default(50),
});

server.registerTool(
  "send_message",
  {
    description: "Send a WhatsApp message to a recipient",
    inputSchema: SendMessageSchema,
  },
  async ({ to, message }) => ({
    content: [
      {
        type: "text" as const,
        text: `Message would be sent to ${to}: "${message}" (not yet implemented)`,
      },
    ],
  }),
);

server.registerTool(
  "list_chats",
  {
    description: "List recent WhatsApp chats",
    inputSchema: ListChatsSchema,
  },
  async ({ limit }) => ({
    content: [
      {
        type: "text" as const,
        text: `Listing up to ${limit} chats (not yet implemented)`,
      },
    ],
  }),
);

server.registerTool(
  "read_messages",
  {
    description: "Read messages from a WhatsApp chat",
    inputSchema: ReadMessagesSchema,
  },
  async ({ chatId, limit }) => ({
    content: [
      {
        type: "text" as const,
        text: `Reading up to ${limit} messages from ${chatId} (not yet implemented)`,
      },
    ],
  }),
);
*/
