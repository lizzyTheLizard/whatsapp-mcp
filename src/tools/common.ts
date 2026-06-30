import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'

export const JidSchema = z.union([
  z.string().min(1, 'JID is required').endsWith('@s.whatsapp.net', 'JID not a valid WhatsApp JID)'),
  z.string().min(1, 'JID is required').endsWith('@g.us', 'JID not a valid WhatsApp JID)'),
])

export async function withErrorHandling<R = string | Record<string, unknown>>(sync: WhatsAppHandler, action: () => R | Promise<R>): Promise<CallToolResult> {
  try {
    let status = sync.getStatus()
    if (status.type === 'closed') await sync.start()
    status = sync.getStatus()
    if (status.type === 'closed') throw new Error('Connection closed, please restart server')
    if (status.type === 'needAuth') throw new Error('Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication')
    if (status.type === 'connecting') throw new Error('Server still connecting, please wait')
    const result = await action()
    if (typeof result === 'string') {
      return toTextResult(result)
    }
    return toStructuredOutput(result as Record<string, unknown>)
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return toCallError(message)
  }
}

export const toCallError = (errorMessage: string): CallToolResult => ({ content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true })
export const toTextResult = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: false })
export const toStructuredOutput = (structuredContent: Record<string, unknown>): CallToolResult => ({ content: [], structuredContent, isError: false })
