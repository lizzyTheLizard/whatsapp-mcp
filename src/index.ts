#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import pkg from '../package.json' with { type: 'json' }
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createStore, DataStore } from './store.js'
import { createHandler } from './sync.js'
import { promises as fsp } from 'fs'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { parseArgs, ParseArgsOptionsConfig } from 'node:util'
import { registerContactResources } from './tools/contactTools.js'
import { registerChatTools } from './tools/chatTools.js'
import { registerMessageTools } from './tools/messageTools.js'

const dataDir = process.env.DATA_DIR ?? './data'

const cliOptions: ParseArgsOptionsConfig = {
  host: { type: 'string', short: 'h', multiple: false },
  port: { type: 'string', short: 'p', multiple: false },
}

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
  const { values } = parseArgs({
    options: cliOptions,
    args: process.argv.slice(2),
    allowPositionals: false,
  })
  const server = new McpServer({ name: pkg.name, version: pkg.version })
  const inputData = await readDataFromFile()
  const whatsappStore = createStore(writeDataToFile, inputData)
  const whatsappSync = createHandler(whatsappStore)
  registerContactResources(server, whatsappStore, whatsappSync)
  registerChatTools(server, whatsappStore, whatsappSync)
  registerMessageTools(server, whatsappStore, whatsappSync)

  if (values.host || values.port) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
    const httpServer = createServer((req, res) => { void transport.handleRequest(req, res) })
    await server.connect(transport)
    const port: number = values.port ? parseInt(values.port as string, 10) : 3100
    if (Number.isNaN(port)) {
      console.error('Invalid port number')
      process.exit(1)
    }
    const host: string = (values.host ?? 'localhost') as string
    httpServer.listen(port, host)
    console.info(`whatsapp-mcp server running on http://${host}:${String(port)}`)
  }
  else {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.info('whatsapp-mcp server running on stdio')
  }
}

main().catch((error: unknown) => {
  console.error('Server error:', error)
  process.exit(1)
})
