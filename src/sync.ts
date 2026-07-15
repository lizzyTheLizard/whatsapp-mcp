import makeWASocket, { WABrowserDescription, ConnectionState } from '@whiskeysockets/baileys'
import { WhatsAppStore, WhatsAppStoreExtension } from './store.js'
import { consoleLog, ILogger } from './logger.js'

export type SyncStatus = { type: 'notstarted' } | { type: 'connecting' } | { type: 'needAuth', qr: string } | { type: 'ready' } | { type: 'closed', error?: Error }

export interface WhatsAppHandler {
  close: () => void
  start: () => Promise<void>
  getStatus: () => SyncStatus
  sendMessage: (jid: string, text: string) => Promise<void>
  setRead: (jid: string, read: boolean) => Promise<void>
  setArchived: (jid: string, archived: boolean) => Promise<void>
}

export interface WhatsAppHandlerOptions {
  name?: string
  logger?: ILogger
}

export function createHandler(store: WhatsAppStore & WhatsAppStoreExtension, options?: WhatsAppHandlerOptions): WhatsAppHandler {
  const name = options?.name ?? 'Whatsapp MCP'
  const logger = options?.logger ?? consoleLog
  let state: SyncStatus = { type: 'notstarted' }
  let sock: ReturnType<typeof makeWASocket> | undefined
  const browser = [name, 'Desktop', '1.0.0'] as WABrowserDescription

  function onError(error: unknown): void {
    const arg = error instanceof Error ? error : new Error(String(error))
    logger.error(`Closing WhatsApp sync due to error ${arg}`)
    close(arg)
  }

  function close(error?: Error): void {
    if (!error) logger.debug(`Closing WhatsApp sync from caller`)
    if (sock) {
      const sockCpy = sock
      sock = undefined
      sockCpy.end(error).catch(onClosed)
    }
    state = { type: 'closed', error }
  }

  function onClosed(error?: Error): void {
    if (!error) {
      logger.debug(`WhatsApp sync connection closed without error`)
      state = { type: 'closed' }
      return
    }
    if (isInvalidAuthError(error)) {
      logger.warn(`WhatsApp sync requires re-authentication due to invalid auth state`)
      store.reset(true)
      start().catch((err: unknown) => { close(err instanceof Error ? err : new Error(String(err))) })
      return
    }
    if (isRequiredReconnectError(error)) {
      logger.debug(`WhatsApp sync connection closed due to required reconnect after successful login, restarting connection`)
      store.reset(false)
      startAgainAfterLogin()
      return
    }
    logger.error(`WhatsApp sync connection closed due to error ${error}`)
    state = { type: 'closed', error }
  }

  function start(): Promise<void> {
    state = { type: 'connecting' }
    sock = makeWASocket({ auth: store.getAuth(), browser, logger: baileysLogger, markOnlineOnConnect: false, syncFullHistory: true, emitOwnEvents: true })
    sock.ev.on('connection.update', (update) => {
      connectionUpdate(update, onClosed,
        qr => state = { type: 'needAuth', qr },
        () => state = { type: 'ready' })
    })
    store.bind(sock.ev)
    logger.debug(`Started WhatsApp sync`)

    // wait for timeout or non 'connecting' state
    return new Promise<void>((resolve, reject) => {
      // Ceheck evey 1s if status is still connecting, if not resolve, if timeout reject
      const start = Date.now()
      const timeoutMs = 120000
      const poll = () => {
        const status = state
        if (status.type !== 'connecting') resolve()
        else if (Date.now() - start < timeoutMs) setTimeout(poll, 100)
        else reject(new Error(`Timed out waiting for ready, got ${status.type}`))
        setTimeout(poll, 1000)
      }
      poll()
    })
  }

  function startAgainAfterLogin() {
    state = { type: 'connecting' }
    sock = makeWASocket({ auth: store.getAuth(), browser, logger: baileysLogger, markOnlineOnConnect: false, syncFullHistory: true, emitOwnEvents: true })
    sock.ev.on('connection.update', (update) => { connectionUpdateAfterLogin(update, onClosed, onError) })
    // wait untill no new messages are received for 2 seconds, then set state to ready
    let timeout = setTimeout(() => state = { type: 'ready' }, 2000)
    sock.ev.process(() => {
      clearTimeout(timeout)
      timeout = setTimeout(() => state = { type: 'ready' }, 2000)
    })
    store.bind(sock.ev)
    logger.debug(`Restarted WhatsApp after login`)
  }

  async function sendMessage(jid: string, message: string): Promise<void> {
    if (state.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (state.type === 'closed') throw new Error('Connection closed, please restart server')
    if (state.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    if (sock === undefined) throw new Error(`No Socket defined but state is ${state.type}. This is invalid, please restart server`)
    const id = getEditChatId(jid)
    logger.debug(`Sending message to ${id}: ${message}`)
    const result = await sock.sendMessage(id, { text: message })
    if (!result) throw new Error(`Failed to send message to ${id}`)
    logger.info(`Sent message to ${id}: ${message}`)
  }

  async function setArchived(jid: string, archived: boolean): Promise<void> {
    if (state.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (state.type === 'closed') throw new Error('Connection closed, please restart server')
    if (state.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    if (sock === undefined) throw new Error(`No Socket defined but state is ${state.type}. This is invalid, please restart server`)
    const id = getEditChatId(jid)
    const lastMsgInChat = store.getLastMessageInChat(id)
    logger.debug(`Setting archived for ${id} to ${archived.toString()}`)
    await sock.chatModify({ archive: archived, lastMessages: lastMsgInChat }, id)
    logger.info(`Set archived for ${id} to ${archived.toString()}`)
  }

  async function setRead(jid: string, read: boolean): Promise<void> {
    if (state.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (state.type === 'closed') throw new Error('Connection closed, please restart server')
    if (state.type === 'needAuth') throw new Error('Authentication needed, please authenticate yourself first')
    if (sock === undefined) throw new Error(`No Socket defined but state is ${state.type}. This is invalid, please restart server`)
    const id = getEditChatId(jid)
    const lastMsgInChat = store.getLastMessageInChat(id)
    logger.debug(`Setting read for ${id} to ${read.toString()}`)
    await sock.chatModify({ markRead: read, lastMessages: lastMsgInChat }, id)
    logger.info(`Set read for ${id} to ${read.toString()}`)
  }

  function getEditChatId(jid: string): string {
    if (jid.endsWith('@lid')) return jid
    const chat = store.getChat(jid)
    if (!chat || chat.jid === jid) return jid
    return chat.jid
  }

  return {
    getStatus: () => state,
    sendMessage,
    setArchived,
    setRead,
    close,
    start,
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
