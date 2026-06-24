import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp'
import { ChatWithId, ContactWithId, MessageWithId, WhatsAppStore } from './store.js'
import { SyncHandler } from './sync.js'
import { ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types'

export function registerWhatsAppTools(server: McpServer, store: WhatsAppStore, sync: SyncHandler) {
  registerChatsResources(server, store)
  registerContactsResources(server, store)
  registerMessagesResources(server, store)
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

/*
const SendMessageSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
  message: z.string().min(1, "Message body is required"),
});

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
