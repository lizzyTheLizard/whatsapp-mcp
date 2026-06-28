#!/usr/bin/env node

import { createStore } from './store.js'
import { createHandler, SyncStatus, WhatsAppHandler } from './sync.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readDataFromFile, writeDataToFile } from './dataDir.js'

async function waitForStartup(handler: WhatsAppHandler, timeoutMs = 15000): Promise<SyncStatus> {
  return new Promise<SyncStatus>((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      const status = handler.getStatus()
      if (status.type !== 'connecting') resolve(status)
      else if (Date.now() - start < timeoutMs) setTimeout(poll, 100)
      else reject(new Error(`Timed out waiting for ready, got ${status.type}`))
    }
    poll()
  })
}

async function waitForAuthentication(handler: WhatsAppHandler, timeoutMs = 120000): Promise<SyncStatus> {
  const intialStatus = handler.getStatus()
  if (intialStatus.type !== 'needAuth') return intialStatus
  let qrCode = intialStatus.qr
  console.log(`Scan the following QR code with your WhatsApp mobile app to authenticate: https://public-api.qr-code-generator.com/v1/create/extended?image_format=PNG&image_width=300&qr_code_text=${encodeURIComponent(qrCode)}&foreground_color=%23000000&background_color=%23FFFFFF&frame_name=no-frame`)
  return new Promise<SyncStatus>((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      const status = handler.getStatus()
      if (status.type === 'ready') resolve(status)
      else if (status.type === 'closed') resolve(status)
      else if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ready, got ${status.type}`))
      else {
        if (status.type === 'needAuth' && status.qr !== qrCode) {
          qrCode = status.qr
          console.log(`Scan the following QR code with your WhatsApp mobile app to authenticate: https://public-api.qr-code-generator.com/v1/create/extended?image_format=PNG&image_width=300&qr_code_text=${encodeURIComponent(qrCode)}&foreground_color=%23000000&background_color=%23FFFFFF&frame_name=no-frame`)
        }
        setTimeout(poll, 100)
      }
    }
    poll()
  })
}

async function cli() {
  console.log('Starting WhatsApp sync CLI...')
  const inputData = await readDataFromFile()
  const store = createStore(writeDataToFile, inputData)
  const sync = createHandler(store)
  let status = await waitForStartup(sync)
  if (status.type === 'needAuth') status = await waitForAuthentication(sync)
  if (status.type !== 'ready') {
    console.error(`WhatsApp sync failed to start, status: ${status.type}`)
    process.exit(1)
  }
  console.log(`WhatsApp sync is ready`)
  console.log('Show all contacts')
  for (const c of store.getContacts()) {
    console.log(`Contact: ${JSON.stringify(c)}`)
  }
  // keep open until user presses Ctrl+C
  console.log('Press Ctrl+C to exit')
  await new Promise<void>(() => { /** empty */ })
}

const isMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (isMain) {
  cli().catch((error: unknown) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}
