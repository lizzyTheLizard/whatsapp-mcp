#!/usr/bin/env node

import { createStore } from './store.js'
import { createHandler, WhatsAppHandler } from './sync.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readDataFromFile, writeDataToFile } from './dataDir.js'
import Readline from 'node:readline/promises'

const rl = Readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Fill with some read Ids
const chatsToArchive: string[] = []
const chatsSendMessage: string[] = []

async function waitForAuthentication(handler: WhatsAppHandler, timeoutMs = 15000): Promise<void> {
  let qrCode: string | undefined
  return new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      const status = handler.getStatus()
      if (status.type === 'needAuth' && status.qr !== qrCode) {
        qrCode = status.qr
        console.log(`Scan the following QR code with your WhatsApp mobile app to authenticate`)
        console.log(`https://public-api.qr-code-generator.com/v1/create/extended?image_format=PNG&image_width=300&qr_code_text=${encodeURIComponent(qrCode)}&foreground_color=%23000000&background_color=%23FFFFFF&frame_name=no-frame`)
      }
      else if (status.type === 'ready') resolve()
      else if (status.type === 'closed') reject(new Error(`WhatsApp sync closed, status: ${status.type}`))
      else if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ready, got ${status.type}`))
      setTimeout(poll, 100)
    }
    poll()
  })
}

async function cli() {
  console.log('Starting WhatsApp testing CLI. This is an interactive test checking if everything works correctly.')
  const inputData = await readDataFromFile()
  // TODO: delete store
  const store = createStore(inputData, { writeData: async (data) => { await writeDataToFile(data) } })
  const sync = createHandler(store)
  await sync.start()
  await waitForAuthentication(sync)

  // Convert everything to see if there is an error
  const messages = store.getMessages()
  const chats = store.getChats()
  const contacts = store.getContacts()
  console.log('------Initial State-------')
  console.log(`WhatsApp sync started with ${messages.length.toString()} messages, ${chats.length.toString()} chats, and ${contacts.length.toString()} contacts`)
  console.log()
  console.log()

  // Prints all unarchived chats and let the user check if they are correct
  console.log('------Unarchived Chats-------')
  console.table(store.getChats().filter(c => !c.archived).sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp).map(c => ({ ...c, lastMessageTimestamp: new Date(c.lastMessageTimestamp * 1000).toLocaleString() })))
  await check()
  console.log()
  console.log()

  // Let user do changes and check if they are reflected in the store
  await check('Now do some changes, write messages, unarchive and archive chats and press Enter to continue', true)
  await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
  console.log()
  console.log('------Unarchived Chats (Updated)-------')
  console.table(store.getChats().filter(c => !c.archived).sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp).map(c => ({ ...c, lastMessageTimestamp: new Date(c.lastMessageTimestamp * 1000).toLocaleString() })))
  await check()
  console.log()
  console.log()

  for (const jid of chatsToArchive) {
    const name = store.getChat(jid)?.name ?? jid
    const initiallyArchived = store.getChat(jid)?.archived
    await check(`Currently chat ${name} is ${initiallyArchived ? 'archived' : 'unarchived'}. Is this correct?`)
    await sync.setArchived(jid, true)
    await check(`Now chat ${name} is archived. Is this correct?`)
    await sync.setArchived(jid, false)
    await check(`Now chat ${name} is unarchived. Is this correct?`)
    await check('Manually archive the chat in WhatsApp and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    if (!store.getChat(jid)?.archived) throw new Error(`Chat ${name} should be archived but is not`)
    console.log(`Chat ${name} is archived as expected`)
    console.log()
    console.log()
  }

  for (const jid of chatsToArchive) {
    const name = store.getChat(jid)?.name ?? jid
    const initiallyUnread = (store.getChat(jid)?.unreadCount ?? 0) > 0
    await check(`Currently chat ${name} is ${initiallyUnread ? 'unread' : 'read'}. Is this correct?`)
    await sync.setRead(jid, true)
    await check(`Now chat ${name} is read. Is this correct?`)
    await sync.setRead(jid, false)
    await check(`Now chat ${name} is unread. Is this correct?`)
    await check('Manually mark the chat as read in WhatsApp and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    if ((store.getChat(jid)?.unreadCount ?? 0) > 0) throw new Error(`Chat ${name} should be read but is not`)
    console.log(`Chat ${name} is read as expected`)
    await check('Manually mark the chat as unread in WhatsApp and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    if ((store.getChat(jid)?.unreadCount ?? 0) === 0) throw new Error(`Chat ${name} should be unread but is not`)
    console.log(`Chat ${name} is unread as expected`)
    console.log()
    console.log()
  }

  for (const jid of chatsSendMessage) {
    const name = store.getChat(jid)?.name ?? jid
    await sync.setArchived(jid, true)
    await check(`Now chat ${name} is archived. Is this correct?`)
    const message = 'Hello from WhatsApp MCP CLI! ' + Math.random().toString(36).substring(2, 8)
    await sync.sendMessage(jid, message)
    await check(`Now chat ${name} is unarchived and a message '${message}' has been written. Is this correct?`)
    const lastMessage = store.getMessagesForChat(jid).slice(-1).pop()
    if (lastMessage?.message !== message) throw new Error(`Last message in chat ${name} should be '${message}' but is '${lastMessage?.message ?? 'undefined'}'`)
    await check('Manually write a message in this chat and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    const lastMessage2 = store.getMessagesForChat(jid).slice(-1).pop()
    if (lastMessage2?.message === message) throw new Error(`Last message in chat ${name} is still '${message}', but it should be the message you wrote manually`)
  }

  // keep open until user presses Ctrl+C
  console.log('Press Ctrl+C to exit')
}

async function check(message?: string, onlyEnter?: boolean): Promise<void> {
  if (onlyEnter) {
    await rl.question(message ?? 'Press Enter to continue ')
    return
  }
  const answer = await rl.question(message ?? 'Is this correct?' + '[Y/n]')
  if (answer.toLowerCase() === 'y' || answer === '') return
  if (answer.toLowerCase() === 'n') throw new Error('User indicated that the data is not correct')
  console.log(`Invalid answer '${answer}', please answer with Y or n`)
  return check()
}

const isMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
if (isMain) {
  cli().catch((error: unknown) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}
