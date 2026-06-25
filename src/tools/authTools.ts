import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { toCallError, withErrorHandling } from './common.js'
import { WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import QRCode from 'qrcode'
import { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'

export function registerAuthTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  server.registerTool<ZodRawShapeCompat>(
    'get_auth_qr',
    { description: 'Get a QR code for WhatsApp authentication.' },
    async () => withErrorHandling(
      () => sync.getStatus(),
      () => getQrCode(sync),
      e => toCallError(e),
    ),
  )
}

async function getQrCode(sync: WhatsAppHandler): Promise<CallToolResult> {
  const status = sync.getStatus()
  if (status.type !== 'needAuth') throw new Error('Authentication is not required at this time.')
  const pngBuffer = await QRCode.toBuffer(status.qr, { type: 'png', width: 400, margin: 2 })
  return {
    content: [
      { type: 'text', text: qrExplanation },
      { type: 'image', data: pngBuffer.toString('base64'), mimeType: 'image/png' },
      { type: 'text', text: status.qr },
    ],
    isError: false,
  }
}

const qrExplanation = `⚠️ Authentication Required

To use this WhatsApp MCP server, you need to link it to your WhatsApp account.

1. Open WhatsApp on your phone
2. Tap the three dots menu (⋮) or Settings
3. Select "Linked Devices"
4. Tap "Link a Device"
5. Scan the QR code below with your phone

The raw QR code string is also provided below for clients that render QR codes themselves.`
