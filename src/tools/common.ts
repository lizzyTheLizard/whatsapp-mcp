import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { type SyncStatus } from '../sync.js'
import z from 'zod'

export const JidSchema = z.union([
  z.string().min(1, 'JID is required').endsWith('@s.whatsapp.net', 'JID not a valid WhatsApp JID)'),
  z.string().min(1, 'JID is required').endsWith('@g.us', 'JID not a valid WhatsApp JID)'),
]).describe('The JID of the recipient or chat. For example 41791234567@s.whatsapp.net for an individual or 1234567890-1234567890@g.us for a group')

export async function withErrorHandling<R>(
  getStatus: () => SyncStatus,
  action: () => R | Promise<R>,
  onError: (error: Error) => R | Promise<R>,
): Promise<R> {
  try {
    const status = getStatus()
    if (status.type === 'needAuth') throw new Error('Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication')
    if (status.type === 'connecting') throw new Error('Server still connecting, please wait')
    if (status.type === 'closed') throw new Error('Connection closed, please restart server')
    return await action()
  }
  catch (error) {
    return await onError(error as Error)
  }
}

export const toCallError = (error: Error): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true })
export const toTextResult = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: false })
export const toStructuredOutput = (structuredContent: Record<string, unknown>): CallToolResult => ({ content: [], structuredContent, isError: false })
