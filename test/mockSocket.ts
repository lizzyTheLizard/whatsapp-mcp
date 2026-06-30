const mockMakeWASocket = vi.hoisted(() => vi.fn())

vi.mock('@whiskeysockets/baileys', async (importOriginal) => {
  const actual: object = await importOriginal()
  return { ...actual, default: mockMakeWASocket, makeWASocket: mockMakeWASocket }
})

import { vi } from 'vitest'
import { createHandler, createStore, WhatsAppStore } from '../src/index.js'

export function resetMockSocket() {
  mockMakeWASocket.mockReset()
  mockMakeWASocket.mockReturnValue(newMockSocket())
}

export function newMockSocket() {
  return {
    ev: { on: vi.fn(), process: vi.fn() },
    end: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'mock', remoteJid: 'test' }, message: { conversation: 'ok' } }),
    chatModify: vi.fn().mockResolvedValue(undefined),
  }
}

export function getMockSocket(): ReturnType<typeof newMockSocket> {
  const results = mockMakeWASocket.mock.results as { value: ReturnType<typeof newMockSocket>, type: string }[]
  return results[results.length - 1].value
}

export function emitOnMockSocket(update: Record<string, unknown>) {
  const socket = getMockSocket()
  const call = (socket.ev.on.mock.calls as [string, (update: Record<string, unknown>) => void][])
    .find(([name]) => name === 'connection.update')
  const handler = call?.[1]
  if (handler) handler(update)
}

export function hasMockSocketBeenRestarted(): boolean {
  const results = mockMakeWASocket.mock.results as { value: ReturnType<typeof newMockSocket>, type: string }[]
  return results.length > 1
}

export async function createStartedHandlerWithMockSocket(update?: Record<string, unknown>, store?: WhatsAppStore) {
  const s = store ?? createStore(undefined)
  const handler = createHandler(s)
  const startPromise = handler.start()
  if (update) {
    emitOnMockSocket(update)
    await startPromise
    return handler
  }
  /// Otherwise do not wait and return immediately, caller can then emit updates
  return handler
}
