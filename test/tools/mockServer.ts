import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Mock, vi } from 'vitest'
import type { WhatsAppStore } from '../../src/store.js'
import type { WhatsAppHandler, SyncStatus } from '../../src/sync.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

function createMockStore(): WhatsAppStore {
  return {
    bind: vi.fn(),
    getChats: vi.fn().mockReturnValue([]),
    getChat: vi.fn().mockReturnValue(undefined),
    getRawChat: vi.fn().mockReturnValue(undefined),
    getContacts: vi.fn().mockReturnValue([]),
    getContact: vi.fn().mockReturnValue(undefined),
    getMessages: vi.fn().mockReturnValue([]),
    getMessage: vi.fn().mockReturnValue(undefined),
    getMessagesForChat: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
    getAuth: vi.fn(),
  }
}

function createMockSync(status: SyncStatus): WhatsAppHandler {
  return {
    close: vi.fn(),
    getStatus: vi.fn().mockReturnValue(status),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    setRead: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
  }
}

export function registerTools(registrationFkt: (server: McpServer, store: WhatsAppStore, sync: WhatsAppHandler) => void, status?: SyncStatus) {
  const server = { registerTool: vi.fn() } as McpServer & { registerTool: Mock }
  const store = createMockStore()
  const sync = createMockSync(status ?? { type: 'ready' })
  registrationFkt(server, store, sync)
  return {
    getRegisteredTool: (toolName: string) => server.registerTool.mock.calls.find((c: string[]) => c[0] === toolName),
    getRegisteredToolHandler: (toolName: string): ((...args: unknown[]) => Promise<CallToolResult>) => {
      const tool = server.registerTool.mock.calls.find((c: string[]) => c[0] === toolName)
      if (!tool) throw new Error(`Tool ${toolName} is not registered`)
      return tool[2] as (...args: unknown[]) => Promise<CallToolResult>
    },
    store,
    sync,
  }
}
