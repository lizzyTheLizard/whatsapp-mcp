#!/usr/bin/env node

import { createHandler, HandlerStatus, WhatsAppHandler } from './core/handler.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readDataFromFile, writeDataToFile } from './dataDir.js'
import Readline from 'node:readline/promises'
import { consoleLog } from './core/logger.js'

const rl = Readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Fill with some read Ids
const chatsToArchive: string[] = []
const chatsToRead: string[] = []
const chatsSendMessage: string[] = []

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
const reset: boolean = false

async function waitForAuthentication(): Promise<WhatsAppHandler> {
  let qrCode: string | undefined
  const inputData = reset ? undefined : await readDataFromFile()
  return new Promise((resolve, reject) => {
    function onStatusChanged(status: HandlerStatus) {
      if (status.type === 'needAuth' && status.qr !== qrCode) {
        qrCode = status.qr
        console.log(`Scan the following QR code with your WhatsApp mobile app to authenticate`)
        console.log(`https://public-api.qr-code-generator.com/v1/create/extended?image_format=PNG&image_width=300&qr_code_text=${encodeURIComponent(qrCode)}&foreground_color=%23000000&background_color=%23FFFFFF&frame_name=no-frame`)
      }
      if (status.type === 'ready') resolve(sync)
      else if (status.type === 'closed') reject(new Error('WhatsApp sync closed'))
    }
    const sync = createHandler(inputData, { logger: consoleLog, update: writeDataToFile, onStatusChanged })
    sync.start()
  })
}

async function cli() {
  console.log('Starting WhatsApp testing CLI. This is an interactive test checking if everything works correctly.')
  const sync = await waitForAuthentication()

  // Convert everything to see if there is an error
  const chats = sync.getChats()
  const contacts = sync.getContacts()
  console.log('--------------------------Initial State-------------------------')
  console.log(`WhatsApp sync started with ${chats.length.toString()} chats and ${contacts.length.toString()} contacts`)
  console.log()
  console.log()

  // Prints all unarchived chats and let the user check if they are correct
  console.log('------------------------Unarchived Chats------------------------')
  console.table(sync.getChats().filter(c => !c.archived).sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp)))
  await check()
  console.log()
  console.log()

  // Get all messages for a chat
  for (const jid of chatsToRead) {
    const chat = sync.getChat(jid)
    if (!chat) throw new Error(`Chat with jid ${jid} not found`)
    const messages = await sync.fetchMessages(jid)
    console.log(`-------------------Messages for ${chat.name}------------------`)
    console.table(messages.sort((a, b) => b.messageTimestamp.localeCompare(a.messageTimestamp)))
    await check()
    console.log()
    console.log()
  }

  // Let user do changes and check if they are reflected in the store
  await check('Now do some changes, write messages, unarchive and archive chats and press Enter to continue', true)
  await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
  console.log()
  console.log('-------------------Unarchived Chats (Updated)-------------------')
  console.table(sync.getChats().filter(c => !c.archived).sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp)))
  await check()
  console.log()
  console.log()

  for (const jid of chatsToArchive) {
    const name = sync.getChat(jid)?.name ?? jid
    const initiallyArchived = sync.getChat(jid)?.archived
    await check(`Currently chat ${name} is ${initiallyArchived ? 'archived' : 'unarchived'}. Is this correct?`)
    await sync.setArchived(jid, true)
    await check(`Now chat ${name} is archived. Is this correct?`)
    await sync.setArchived(jid, false)
    await check(`Now chat ${name} is unarchived. Is this correct?`)
    await check('Manually archive the chat in WhatsApp and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    if (!sync.getChat(jid)?.archived) throw new Error(`Chat ${name} should be archived but is not`)
    console.log(`Chat ${name} is archived as expected`)
    console.log()
    console.log()
  }

  for (const jid of chatsToArchive) {
    const name = sync.getChat(jid)?.name ?? jid
    const initiallyUnread = (sync.getChat(jid)?.unreadCount ?? 0) > 0
    await check(`Currently chat ${name} is ${initiallyUnread ? 'unread' : 'read'}. Is this correct?`)
    await sync.setRead(jid, true)
    await check(`Now chat ${name} is read. Is this correct?`)
    await sync.setRead(jid, false)
    await check(`Now chat ${name} is unread. Is this correct?`)
    await check('Manually mark the chat as read in WhatsApp and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    if ((sync.getChat(jid)?.unreadCount ?? 0) > 0) throw new Error(`Chat ${name} should be read but is not`)
    console.log(`Chat ${name} is read as expected`)
    await check('Manually mark the chat as unread in WhatsApp and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    if ((sync.getChat(jid)?.unreadCount ?? 0) === 0) throw new Error(`Chat ${name} should be unread but is not`)
    console.log(`Chat ${name} is unread as expected`)
    console.log()
    console.log()
  }

  for (const jid of chatsSendMessage) {
    const name = sync.getChat(jid)?.name ?? jid
    await sync.setArchived(jid, true)
    await check(`Now chat ${name} is archived. Is this correct?`)
    const message = 'Hello from WhatsApp MCP CLI! ' + Math.random().toString(36).substring(2, 8)
    await sync.sendMessage(jid, message)
    await check(`Now chat ${name} is unarchived and a message '${message}' has been written. Is this correct?`)
    const lastMessage = (await sync.fetchMessages(jid)).slice(0).pop()
    if (lastMessage?.message !== message) throw new Error(`Last message in chat ${name} should be '${message}' but is '${lastMessage?.message ?? 'undefined'}'`)
    await check('Manually write a message in this chat and press Enter to continue', true)
    await new Promise(resolve => setTimeout(resolve, 1000)) // wait a bit for the change to be reflected
    const lastMessage2 = (await sync.fetchMessages(jid)).slice(0).pop()
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
