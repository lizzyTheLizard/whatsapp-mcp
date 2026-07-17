import makeWASocket, { WABrowserDescription } from '@whiskeysockets/baileys'
import { consoleLog, ILogger } from './logger.js'
import { createStore } from './store.js'
import { Chat, Contact, Message } from './extTypes.js'
import { createUpdater } from './update.js'

export type HandlerStatus = { type: 'notstarted' } | { type: 'connecting' } | { type: 'needAuth', qr: string } | { type: 'ready' } | { type: 'closed', error?: Error }

export interface DataObject {
  id: string
  type: string
  data: string
}

export interface WhatsAppHandler {
  start: () => void
  stop: () => void
  fetchMessages: (jid: string) => Promise<Message[]>
  sendMessage: (jid: string, text: string) => Promise<void>
  setRead: (jid: string, read: boolean) => Promise<void>
  setArchived: (jid: string, archived: boolean) => Promise<void>
  getStatus: () => HandlerStatus
  getChat: (id: string) => Chat | undefined
  getChats: () => Chat[]
  getContact: (id: string) => Contact | undefined
  getContacts: () => Contact[]
}

export interface WhatsAppHandlerOptions {
  name?: string
  logger?: ILogger
  update?: (data: DataObject) => void
  onStatusChanged?: (status: HandlerStatus) => void
}

export function createHandler(initialData: DataObject[] | undefined, options?: WhatsAppHandlerOptions): WhatsAppHandler {
  const name = options?.name ?? 'Whatsapp MCP'
  const logger = options?.logger ?? consoleLog
  const update = options?.update ?? (() => { /* empty */ })
  const browser = [name, 'Desktop', '1.0.0'] as WABrowserDescription
  const store = createStore(initialData, { logger, update })
  const updater = createUpdater({ logger, store, getStatus: () => status, getSocket: () => sock })
  const onStatusChanged = options?.onStatusChanged
  let sock: ReturnType<typeof makeWASocket> | undefined
  let status: HandlerStatus = { type: 'notstarted' }

  function onError(error: unknown): void {
    const arg = error instanceof Error ? error : new Error(String(error))
    logger.error(`Closing WhatsApp sync due to error ${arg}`)
    logger.debug(`Closing WhatsApp sync from caller`)
    sock?.end(arg).catch(onClosed)
    sock = undefined
    updateStatus({ type: 'closed', error: arg })
  }

  function onClosed(error?: Error): void {
    if (!error) {
      logger.debug(`WhatsApp sync connection closed without error`)
      updateStatus({ type: 'closed' })
      return
    }
    if (isInvalidAuthError(error)) {
      logger.warn(`WhatsApp sync requires re-authentication due to invalid auth state`)
      updateStatus({ type: 'needAuth', qr: '' })
      store.reset(true)
      start()
      return
    }
    if (isRequiredReconnectError(error)) {
      logger.debug(`WhatsApp sync connection closed due to required reconnect after successful login, restarting connection`)
      updateStatus({ type: 'connecting' })
      store.reset(false)
      startAgainAfterLogin()
      return
    }
    logger.error(`WhatsApp sync connection closed due to error`, error)
    updateStatus({ type: 'closed', error })
  }

  function startAgainAfterLogin() {
    updateStatus({ type: 'connecting' })
    sock = makeWASocket({ auth: store.getAuth(), browser, logger: baileysLogger })
    sock.ev.on('connection.update', (update) => {
      if (update.qr) onError(new Error('Received QR code update during WhatsApp sync after login'))
      else if (update.connection === 'open') { /* do nothing, wait for next update */ }
      else if (update.connection !== 'close') { /* do nothing, wait for next update */ }
      else onClosed(update.lastDisconnect?.error)
    })
    // wait untill no new messages are received for 2 seconds, then set state to ready
    let timeout = setTimeout(() => { updateStatus({ type: 'ready' }) }, 2000)
    sock.ev.process(() => {
      clearTimeout(timeout)
      timeout = setTimeout(() => { updateStatus({ type: 'ready' }) }, 2000)
    })
    store.bind(sock)
    logger.debug(`Restarted WhatsApp after login`)
  }

  function start(): void {
    updateStatus({ type: 'connecting' })
    sock = makeWASocket({ auth: store.getAuth(), browser, logger: baileysLogger })
    sock.ev.on('connection.update', (update) => {
      if (update.qr) updateStatus({ type: 'needAuth', qr: update.qr })
      else if (update.connection === 'open') updateStatus({ type: 'ready' })
      else if (update.connection !== 'close') { /* do nothing, wait for next update */ }
      else onClosed(update.lastDisconnect?.error)
    })
    store.bind(sock)
    logger.debug(`Started WhatsApp sync`)
  }

  function stop(): void {
    logger.debug(`Closing WhatsApp sync from caller`)
    sock?.end(undefined).catch(onClosed)
    sock = undefined
    updateStatus({ type: 'closed' })
  }

  function getStatus(): HandlerStatus {
    return status
  }

  function updateStatus(newStatus: HandlerStatus): void {
    status = newStatus
    onStatusChanged?.(status)
  }

  return { stop, start, getStatus, ...updater, ...store }
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
