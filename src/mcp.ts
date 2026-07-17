#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { HandlerStatus } from './core/handler.js'
import pkg from '../package.json' with { type: 'json' }
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createHandler, WhatsAppHandler } from './core/handler.js'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { parseArgs, ParseArgsOptionsConfig } from 'node:util'
import { registerContactResources } from './tools/contactTools.js'
import { registerChatTools } from './tools/chatTools.js'
import { registerMessageTools } from './tools/messageTools.js'
import { registerAuthTools } from './tools/authTools.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readDataFromFile, writeDataToFile } from './dataDir.js'
import { noLog } from './core/logger.js'
const cliOptions: ParseArgsOptionsConfig = {
  host: { type: 'string', short: 'h', multiple: false },
  port: { type: 'string', short: 'p', multiple: false },
}

async function waitToBeStarted(): Promise<WhatsAppHandler> {
  const inputData = await readDataFromFile()
  return new Promise((resolve, reject) => {
    function onStatusChanged(status: HandlerStatus) {
      if (status.type === 'ready') resolve(sync)
      else if (status.type === 'needAuth') resolve(sync)
      else if (status.type === 'closed') reject(new Error('WhatsApp sync closed'))
    }
    const sync = createHandler(inputData, { logger: noLog, update: writeDataToFile, onStatusChanged })
    sync.start()
  })
}

export async function startServer(transport: Transport): Promise<() => Promise<void>> {
  const sync = await waitToBeStarted()
  const server = new McpServer({ name: pkg.name, version: pkg.version })
  registerContactResources(server, sync)
  registerChatTools(server, sync)
  registerMessageTools(server, sync)
  registerAuthTools(server, sync)
  await server.connect(transport)
  return async () => {
    sync.stop()
    await server.close()
  }
}

async function mcp() {
  const { values } = parseArgs({
    options: cliOptions,
    args: process.argv.slice(2),
    allowPositionals: false,
  })
  if (values.host || values.port) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
    const httpServer = createServer((req, res) => { void transport.handleRequest(req, res) })
    const closeCB = await startServer(transport)
    httpServer.on('close', () => { void closeCB() })
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
    const closeCB = await startServer(transport)
    process.on('exit', () => {
      console.error('Close process exit event')
      void closeCB()
    })
  }
}

const isMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (isMain) {
  mcp().catch((error: unknown) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}
