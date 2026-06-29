import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { toCallError } from './common.js'
import { WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import QRCode from 'qrcode'

export function registerAuthTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  server.registerTool('get_auth_qr', { description: 'Get a QR code to authenticate with WhatsApp. Call this tool when authentication is required.' },
    async () => {
      try {
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
      catch (e) {
        return toCallError(e as Error)
      }
    },
  )

  server.registerTool('get_status', { description: 'Get the current server status.' },
    () => {
      try {
        const status = sync.getStatus()
        switch (status.type) {
          case 'needAuth':
            return { content: [{ type: 'text', text: 'Authentication is required. Please call get_auth_qr to retrieve a QR code for authentication.' }], isError: false }
          case 'connecting':
            return { content: [{ type: 'text', text: 'Server is still connecting to WhatsApp, please wait...' }], isError: false }
          case 'closed':
            return { content: [{ type: 'text', text: `Server connection closed. Error: ${status.error?.message ?? 'Unknown error'}` }], isError: false }
          case 'ready':
            return { content: [{ type: 'text', text: 'Server is ready and authenticated.' }], isError: false }
          default:
            return { content: [{ type: 'text', text: 'Unknown server status.' }], isError: false }
        }
      }
      catch (e) {
        return toCallError(e as Error)
      }
    },
  )
}

const qrExplanation = `⚠️ Authentication Required

To use this WhatsApp MCP server, you need to link it to your WhatsApp account.

1. Open WhatsApp on your phone
2. Tap the three dots menu (⋮) or Settings
3. Select "Linked Devices"
4. Tap "Link a Device"
5. Scan the QR code below with your phone

The raw QR code string is also provided below for clients that render QR codes themselves.`
