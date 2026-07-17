import makeWASocket, { BaileysEventMap } from '@whiskeysockets/baileys'
import { WhatsAppStore } from './store.js'
import { ILogger } from './logger.js'
import { HandlerStatus } from './handler.js'
import { Message, toMessageExt } from './extTypes.js'

export interface UpdateOptions {
  logger: ILogger
  store: WhatsAppStore
  getStatus: () => HandlerStatus
  getSocket: () => ReturnType<typeof makeWASocket> | undefined
}

export interface WhatsAppUpdater {
  sendMessage: (jid: string, message: string) => Promise<void>
  setArchived: (jid: string, archived: boolean) => Promise<void>
  setRead: (jid: string, read: boolean) => Promise<void>
  fetchMessages: (jid: string) => Promise<Message[]>
}

export function createUpdater({ logger, store, getStatus, getSocket }: UpdateOptions): WhatsAppUpdater {
  async function sendMessage(jid: string, message: string): Promise<void> {
    const sock = ensureSocketIsReady()
    const id = getEditChatId(jid)
    logger.debug(`Sending message to ${id}: ${message}`)
    const result = await sock.sendMessage(id, { text: message })
    if (!result) throw new Error(`Failed to send message to ${id}`)
    logger.info(`Sent message to ${id}: ${message}`)
  }

  async function setArchived(jid: string, archived: boolean): Promise<void> {
    const sock = ensureSocketIsReady()
    const id = getEditChatId(jid)
    const lastMsgInChat = store.getLastMessageInChat(id)
    logger.debug(`Setting archived for ${id} to ${archived.toString()}`)
    await sock.chatModify({ archive: archived, lastMessages: lastMsgInChat ? [lastMsgInChat] : [] }, id)
    logger.info(`Set archived for ${id} to ${archived.toString()}`)
  }

  async function setRead(jid: string, read: boolean): Promise<void> {
    const sock = ensureSocketIsReady()
    const id = getEditChatId(jid)
    const lastMsgInChat = store.getLastMessageInChat(id)
    logger.debug(`Setting read for ${id} to ${read.toString()}`)
    await sock.chatModify({ markRead: read, lastMessages: lastMsgInChat ? [lastMsgInChat] : [] }, id)
    logger.info(`Set read for ${id} to ${read.toString()}`)
  }

  async function fetchMessages(jid: string): Promise<Message[]> {
    return new Promise<Message[]>((resolve, reject) => {
      const sock = ensureSocketIsReady()
      const id = getEditChatId(jid)
      const lastMessage = store.getLastMessageInChat(id)
      if (!lastMessage) {
        reject(new Error(`No last message found for chat ${jid}. Please make sure the chat exists and has messages before fetching messages.`))
        return
      }
      const lastMessageTimestamp = lastMessage.messageTimestamp
      if (!lastMessageTimestamp) {
        reject(new Error(`Last message for chat ${jid} does not have a timestamp. Please make sure the chat exists and has messages before fetching messages.`))
        return
      }
      logger.debug(`Fetching messages for chat ${id}`)

      let timeout: NodeJS.Timeout | undefined = setTimeout(() => {
        cleanup(new Error(`Timeout waiting for messages for chat ${jid}`))
      }, 10000)

      function cleanup(error?: Error, result?: Message[]) {
        sock.ev.off('messaging-history.set', historySet)
        if (timeout) clearTimeout(timeout)
        timeout = undefined
        if (error) {
          logger.error(`Error fetching messages for chat ${jid}`, error)
          reject(error)
        }
        else {
          logger.debug(`Fetched ${(result?.length ?? 0).toString()} messages for chat ${jid}`)
          resolve(result ?? [])
        }
      }

      function historySet(e: BaileysEventMap['messaging-history.set']) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const messages: Message[] = [lastMessage!, ...e.messages].map(m => toMessageExt(m, new Map(), logger)).filter(m => !!m)
        cleanup(undefined, messages)
      }

      sock.ev.on('messaging-history.set', historySet)
      sock.fetchMessageHistory(20, lastMessage.key, lastMessageTimestamp)
        .then(() => { logger.debug(`Message sync started for chat ${jid}`) })
        .catch((err: unknown) => {
          cleanup(err instanceof Error ? err : new Error(String(err)))
        })
    })
  }

  function getEditChatId(jid: string): string {
    if (jid.endsWith('@lid')) return jid
    const chat = store.getChat(jid)
    if (!chat || chat.jid === jid) return jid
    return chat.jid
  }

  function ensureSocketIsReady(): ReturnType<typeof makeWASocket> {
    const status = getStatus()
    if (status.type === 'notstarted') throw new Error('Server not started, please start it first')
    if (status.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (status.type === 'closed') throw new Error('Connection closed, please restart server')
    if (status.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    const sock = getSocket()
    if (sock === undefined) throw new Error(`No Socket defined but state is ready. This is invalid, please restart server`)
    return sock
  }

  return { sendMessage, setArchived, setRead, fetchMessages }
}
