import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startServer } from './main.js'

function waitForNeedAuth(client: Client, timeoutMs = 15000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      client.callTool({ name: 'get_status' })
        .then((result) => {
          const status = (result.content as { text: string }[])[0].text
          if (status === 'needAuth') resolve()
          else if (Date.now() - start < timeoutMs) setTimeout(poll, 100)
          else reject(new Error(`Timed out waiting for needAuth, got ${status}`))
        }).catch(reject)
    }
    poll()
  })
}

describe('MCP Server Integration', () => {
  let client: Client
  let close: () => Promise<void>

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    close = await startServer(serverTransport)
    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} })
    await client.connect(clientTransport)
    await waitForNeedAuth(client)
  }, 20000)

  afterAll(async () => {
    await client.close()
    await close()
  })

  describe('tools/list', () => {
    it('returns all 5 tools', async () => {
      const { tools } = await client.listTools()
      const names = tools.map((t: { name: string }) => t.name).sort()
      expect(names).toEqual(['get_auth_qr', 'get_status', 'send_message', 'set_chat_archived', 'set_chat_read'])
    })

    it('returns tools with inputSchema', async () => {
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined()
      }
    })
  })

  describe('resources/list', () => {
    it('returns static resources when not authenticated', async () => {
      const { resources } = await client.listResources()
      const uris = resources.map((r: { uri: string }) => r.uri).sort()
      expect(uris).toEqual(['chats://app', 'contacts://app', 'messages://app'])
    })
  })

  describe('tool call validation (protocol-level Zod)', () => {
    it('rejects send_message with invalid JID format', async () => {
      const result = await client.callTool({
        name: 'send_message',
        arguments: { jid: 'not-a-jid', message: 'hello' },
      })
      expect(result.isError).toBe(true)
    })

    it('rejects send_message with empty message body', async () => {
      const result = await client.callTool({
        name: 'send_message',
        arguments: { jid: '123@s.whatsapp.net', message: '' },
      })
      expect(result.isError).toBe(true)
    })

    it('rejects set_chat_archived with non-boolean archived', async () => {
      const result = await client.callTool({
        name: 'set_chat_archived',
        arguments: { jid: '123@s.whatsapp.net', archived: 'yes' },
      })
      expect(result.isError).toBe(true)
    })

    it('rejects set_chat_read with non-boolean read', async () => {
      const result = await client.callTool({
        name: 'set_chat_read',
        arguments: { jid: '123@s.whatsapp.net', read: 'yes' },
      })
      expect(result.isError).toBe(true)
    })

    it('rejects nonexistent tool name', async () => {
      const result = await client.callTool({
        name: 'nonexistent_tool',
        arguments: {},
      })
      expect(result.isError).toBe(true)
    })
  })

  describe('sync state gating', () => {
    it('blocks send_message when not authenticated', async () => {
      const result = await client.callTool({
        name: 'send_message',
        arguments: { jid: '123@s.whatsapp.net', message: 'hello' },
      })
      expect(result.isError).toBe(true)
    })

    it('blocks set_chat_archived when not authenticated', async () => {
      const result = await client.callTool({
        name: 'set_chat_archived',
        arguments: { jid: '123@s.whatsapp.net', archived: true },
      })
      expect(result.isError).toBe(true)
    })

    it('blocks set_chat_read when not authenticated', async () => {
      const result = await client.callTool({
        name: 'set_chat_read',
        arguments: { jid: '123@s.whatsapp.net', read: true },
      })
      expect(result.isError).toBe(true)
    })
  })

  describe('get_auth_qr', () => {
    it('returns QR code content', async () => {
      const result = await client.callTool({ name: 'get_auth_qr', arguments: {} })
      expect(result.isError).toBe(false)
      expect(result.content).toBeDefined()
      const content = result.content as { type: string, text?: string, data?: string, mimeType?: string }[]
      const types = content.map(c => c.type)
      expect(types).toContain('image')
      expect(types).toContain('text')
    })
  })
})
