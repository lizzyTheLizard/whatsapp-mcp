import makeWASocket, { WABrowserDescription, ConnectionState, WAMessage, proto } from '@whiskeysockets/baileys'
import { createStore } from './store.js'

export type SyncStatus = { type: 'connecting' } | { type: 'needAuth', qr: string } | { type: 'ready' } | { type: 'closed', error?: Error }

export interface WhatsAppHandler {
  close: () => void
  getStatus: () => SyncStatus
  sendMessage: (jid: string, text: string) => Promise<WAMessage>
  setRead: (jid: string, read: boolean) => Promise<void>
  setArchived: (jid: string, archived: boolean) => Promise<void>
}

export function createHandler(store: ReturnType<typeof createStore>): WhatsAppHandler {
  let state: SyncStatus = { type: 'connecting' }
  let sock: ReturnType<typeof makeWASocket> | undefined
  const browser = ['Gutschi.site', 'Desktop', '1.0.0'] as WABrowserDescription

  function onError(error: unknown): void {
    const arg = error instanceof Error ? error : new Error(String(error))
    console.error(`Closing WhatsApp sync due to error ${arg}`)
    close(arg)
  }

  function close(error?: Error): void {
    if (sock) {
      const sockCpy = sock
      sock = undefined
      sockCpy.end(error).catch(onClosed)
    }
    state = { type: 'closed', error }
  }

  function onClosed(error?: Error): void {
    if (!error) {
      console.log(`WhatsApp sync connection closed without error`)
      state = { type: 'closed' }
      return
    }
    if (isInvalidAuthError(error)) {
      console.warn(`WhatsApp sync requires re-authentication due to invalid auth state`)
      store.reset()
      start()
      return
    }
    if (isRequiredReconnectError(error)) {
      console.log(`WhatsApp sync connection closed due to required reconnect`)
      store.reset()
      startAgainAfterLogin()
      return
    }
    state = { type: 'closed', error }
  }

  function start() {
    sock = makeWASocket({ auth: store.getAuth(), browser, logger: baileysLogger, markOnlineOnConnect: false, syncFullHistory: true, emitOwnEvents: true })
    sock.ev.on('connection.update', (update) => {
      connectionUpdate(update, onClosed,
        qr => state = { type: 'needAuth', qr },
        () => state = { type: 'ready' })
    },
    )
    store.bind(sock.ev)
  }

  function startAgainAfterLogin() {
    sock = makeWASocket({ auth: store.getAuth(), browser, logger: baileysLogger, markOnlineOnConnect: false, syncFullHistory: true, emitOwnEvents: true })
    sock.ev.on('connection.update', (update) => { connectionUpdateAfterLogin(update, onClosed, onError) })
    // wait untill no new messages are received for 2 seconds, then set state to ready
    let timeout = setTimeout(() => state = { type: 'ready' }, 2000)
    sock.ev.process(() => {
      clearTimeout(timeout)
      timeout = setTimeout(() => state = { type: 'ready' }, 2000)
    })
    store.bind(sock.ev)
  }

  async function sendMessage(jid: string, message: string): Promise<WAMessage> {
    if (state.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (state.type === 'closed') throw new Error('Connection closed, please restart server')
    if (state.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    if (sock === undefined) throw new Error(`No Socket defined but state is ${state.type}. This is invalid, please restart server`)
    const result = await sock.sendMessage(jid, { text: message })
    if (!result) throw new Error(`Failed to send message to ${jid}`)
    return result
  }

  async function setArchived(jid: string, archived: boolean): Promise<void> {
    if (state.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (state.type === 'closed') throw new Error('Connection closed, please restart server')
    if (state.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    if (sock === undefined) throw new Error(`No Socket defined but state is ${state.type}. This is invalid, please restart server`)
    const chat = store.getChat(jid)
    if (!chat) throw new Error(`No chat found for ${jid}`)
    const lastMessage = chat.messages?.[0].message
    if (!lastMessage) {
      await sock.chatModify({ archive: archived, lastMessages: [] }, jid)
      return
    }
    if (!lastMessage.key) throw new Error(`Last message for ${jid} has no key, cannot archive chat`)
    await sock.chatModify({ archive: archived, lastMessages: [lastMessage as proto.IWebMessageInfo & { key: typeof lastMessage.key }] }, jid)
  }

  async function setRead(jid: string, read: boolean): Promise<void> {
    if (state.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (state.type === 'closed') throw new Error('Connection closed, please restart server')
    if (state.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    if (sock === undefined) throw new Error(`No Socket defined but state is ${state.type}. This is invalid, please restart server`)
    const chat = store.getChat(jid)
    if (!chat) throw new Error(`No chat found for ${jid}`)
    const lastMessage = chat.messages?.[0].message
    if (!lastMessage) {
      await sock.chatModify({ markRead: read, lastMessages: [] }, jid)
      return
    }
    if (!lastMessage.key) throw new Error(`Last message for ${jid} has no key, cannot mark chat as unread`)
    await sock.chatModify({ markRead: read, lastMessages: [lastMessage as proto.IWebMessageInfo & { key: typeof lastMessage.key }] }, jid)
  }
  start()

  return {
    getStatus: () => state,
    sendMessage: sendMessage,
    setArchived: setArchived,
    setRead: setRead,
    close: close,
  }
}

const baileysLogger = {
  level: 'error',
  child: () => baileysLogger,
  trace: () => { /* empty */ },
  debug: () => { /* empty */ },
  info: () => { /* empty */ },
  warn: () => { /* empty */ },
  error: () => { /* empty */ },
}

function connectionUpdate(update: Partial<ConnectionState>, onClose: (error?: Error) => void, onQr?: (qr: string) => void, onReady?: () => void): void {
  if (update.qr) onQr?.(update.qr)
  else if (update.connection === 'open') onReady?.()
  else if (update.connection !== 'close') { /* do nothing, wait for next update */ }
  else onClose(update.lastDisconnect?.error)
}

function isInvalidAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (!('output' in error)) return false
  if (typeof error.output !== 'object' || error.output === null) return false
  if (!('statusCode' in error.output)) return false
  if (error.output.statusCode !== 401) return false
  return true
}

function isRequiredReconnectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (!('output' in error)) return false
  if (typeof error.output !== 'object' || error.output === null) return false
  if (!('statusCode' in error.output)) return false
  if (error.output.statusCode !== 515) return false
  return true
}

function connectionUpdateAfterLogin(update: Partial<ConnectionState>, onClose: (error?: Error) => void, onErr: (error: Error) => void): void {
  if (update.qr) onErr(new Error('Received QR code update during WhatsApp sync after login'))
  else if (update.connection === 'open') { /* do nothing, wait for next update */ }
  else if (update.connection !== 'close') { /* do nothing, wait for next update */ }
  else onClose(update.lastDisconnect?.error)
}
