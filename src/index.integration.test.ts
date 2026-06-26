import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { startServer } from './index.js'
import { createStore, WhatsAppStore } from './store.js'
import { createHandler, WhatsAppHandler } from './sync.js'

function waitForStatus(sync: WhatsAppHandler, timeoutMs = 15000): Promise<void> {
  const targets = ['needAuth', 'closed', 'ready']
  return new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const poll = (): void => {
      const status = sync.getStatus()
      if (targets.includes(status.type)) {
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for status, current status: ${status.type}`))
        return
      }
      setTimeout(poll, 100)
    }
    poll()
  })
}

describe('MCP Server Integration', () => {
  let client: Client
  let store: WhatsAppStore
  let sync: WhatsAppHandler
  let server: McpServer

  beforeAll(async () => {
    store = createStore()
    sync = createHandler(store)
    await waitForStatus(sync)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const result = await startServer(serverTransport, store, sync)
    server = result.server

    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    )
    await client.connect(clientTransport)
  }, 20000)

  afterAll(async () => {
    await client.close()
    await server.close()
    sync.close()
  })

  describe('tools/list', () => {
    it('returns all 4 tools', async () => {
      const { tools } = await client.listTools()
      const names = tools.map(t => t.name).sort()
      expect(names).toEqual(['get_auth_qr', 'send_message', 'set_chat_archived', 'set_chat_read'])
    })

    it('returns tools with inputSchema', async () => {
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(tool.name).toBeDefined()
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
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
        arguments: { jid: 'user@s.whatsapp.net', message: '' },
      })
      expect(result.isError).toBe(true)
    })

    it('rejects set_chat_archived with non-boolean archived', async () => {
      const result = await client.callTool({
        name: 'set_chat_archived',
        arguments: { jid: 'user@s.whatsapp.net', archived: 'yes' },
      })
      expect(result.isError).toBe(true)
    })

    it('rejects set_chat_read with non-boolean read', async () => {
      const result = await client.callTool({
        name: 'set_chat_read',
        arguments: { jid: 'user@s.whatsapp.net', read: 'no' },
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
      const status = sync.getStatus()
      if (status.type === 'ready') return

      const result = await client.callTool({
        name: 'send_message',
        arguments: { jid: 'user@s.whatsapp.net', message: 'test' },
      })
      expect(result.isError).toBe(true)
    })

    it('blocks set_chat_archived when not authenticated', async () => {
      const status = sync.getStatus()
      if (status.type === 'ready') return

      const result = await client.callTool({
        name: 'set_chat_archived',
        arguments: { jid: 'user@s.whatsapp.net', archived: true },
      })
      expect(result.isError).toBe(true)
    })

    it('blocks set_chat_read when not authenticated', async () => {
      const status = sync.getStatus()
      if (status.type === 'ready') return

      const result = await client.callTool({
        name: 'set_chat_read',
        arguments: { jid: 'user@s.whatsapp.net', read: true },
      })
      expect(result.isError).toBe(true)
    })

    it('blocks resource listing when not authenticated', async () => {
      const status = sync.getStatus()
      if (status.type === 'ready') return

      // Resource handlers also gate on auth state via withErrorHandling
      await expect(client.listResources()).rejects.toThrow()
    })
  })

  describe('get_auth_qr', () => {
    it('returns QR content when status is needAuth', async () => {
      const status = sync.getStatus()
      if (status.type !== 'needAuth') return

      const result = await client.callTool({
        name: 'get_auth_qr',
        arguments: {},
      })
      expect(result.isError).toBe(false)
      const content = result.content as { type: string, text?: string, data?: string, mimeType?: string }[]
      expect(content.length).toBeGreaterThanOrEqual(2)
      const types = content.map(c => c.type)
      expect(types).toContain('text')
      expect(types).toContain('image')
    })

    it('returns error when not in needAuth state', async () => {
      const status = sync.getStatus()
      if (status.type === 'needAuth') return

      const result = await client.callTool({
        name: 'get_auth_qr',
        arguments: {},
      })
      expect(result.isError).toBe(true)
    })
  })
})
