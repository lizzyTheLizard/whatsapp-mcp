import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { toCallError } from './common.js'
import { WhatsAppStore } from '../store.js'
import { WhatsAppHandler } from '../sync.js'
import z from 'zod'

export function registerAuthTools(server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) {
  server.registerTool('get_auth_qr', { description: 'Get a QR code to authenticate with WhatsApp. Call this tool when authentication is required.', outputSchema: QrCodeResultSchema },
    async () => {
      try {
        let status = sync.getStatus()
        if (status.type === 'closed') await sync.start()
        status = sync.getStatus()
        if (status.type === 'closed') throw new Error('WhatsApp sync is closed. Please restart the server.')
        if (status.type !== 'needAuth') throw new Error('Authentication is not required at this time.')
        return {
          structuredContent: {
            url: `https://public-api.qr-code-generator.com/v1/create/extended?image_format=PNG&image_width=300&qr_code_text=${encodeURIComponent(status.qr)}&foreground_color=%23000000&background_color=%23FFFFFF&frame_name=no-frame`,
            code: status.qr,
          },
          content: [],
          isError: false,
        }
      }
      catch (e) {
        return toCallError(e instanceof Error ? e.message : String(e))
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
        return toCallError(e instanceof Error ? e.message : String(e))
      }
    },
  )
}

const QrCodeResultSchema = z.object({
  url: z.string().describe('URL to a PNG image of the QR code. Download and show this image to the user to scan with their WhatsApp mobile app.'),
  code: z.string().describe('Text representation of the QR code. If you cannot show the user the QR code image or url, you can generate a QR code from this text using any QR code generator.'),
})
