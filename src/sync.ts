import makeWASocket, { WABrowserDescription, ConnectionState } from '@whiskeysockets/baileys'
import { createStore } from './store.js'

export type SyncStatus = { type: 'connecting' } | { type: 'needAuth', qr: string } | { type: 'ready' } | { type: 'closed', error?: Error }

export interface SyncHandler {
  close: () => void
  getStatus: () => SyncStatus
}

export function createSyncHandler(store: ReturnType<typeof createStore>): SyncHandler {
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

  start()

  return {
    getStatus: () => state,
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
