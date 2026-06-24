#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createStore, DataStore } from './store.js'
import { createSyncHandler } from './sync.js'
import { promises as fsp } from 'fs'
import { registerWhatsAppTools } from './tools.js'

const dataDir = process.env.DATA_DIR ?? './data'

async function readDataFromFile(): Promise<DataStore | undefined> {
  const canAccess = await fsp.access(dataDir).then(() => true).catch(() => false)
  if (!canAccess) return undefined
  const chats = await fsp.readFile(`${dataDir}/chats.json`, 'utf-8')
  const messages = await fsp.readFile(`${dataDir}/messages.json`, 'utf-8')
  const contacts = await fsp.readFile(`${dataDir}/contacts.json`, 'utf-8')
  const auth = await fsp.readFile(`${dataDir}/auth.json`, 'utf-8')
  return { chats, messages, contacts, auth }
}

async function writeDataToFile(data: DataStore): Promise<void> {
  await fsp.mkdir(dataDir, { recursive: true })
  await fsp.writeFile(`${dataDir}/chats.json`, data.chats, 'utf-8')
  await fsp.writeFile(`${dataDir}/messages.json`, data.messages, 'utf-8')
  await fsp.writeFile(`${dataDir}/contacts.json`, data.contacts, 'utf-8')
  await fsp.writeFile(`${dataDir}/auth.json`, data.auth, 'utf-8')
}

async function main() {
  const server = new McpServer({ name: 'whatsapp-mcp', version: '0.1.0' })
  const transport = new StdioServerTransport()
  const inputData = await readDataFromFile()
  const whatsappStore = createStore(writeDataToFile, inputData)
  const whatsappSync = createSyncHandler(whatsappStore)
  registerWhatsAppTools(server, whatsappStore, whatsappSync)
  await server.connect(transport)
  console.info('whatsapp-mcp server running on stdio')
}

main().catch((error: unknown) => {
  console.error('Server error:', error)
  process.exit(1)
})
