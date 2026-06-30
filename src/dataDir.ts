import { promises as fsp } from 'fs'
import { DataStore } from './index.js'

const dataDir = process.env.DATA_DIR ?? './data'

export async function readDataFromFile(): Promise<DataStore | undefined> {
  const canAccess = await fsp.access(dataDir).then(() => true).catch(() => false)
  if (!canAccess) return undefined
  const chats = await fsp.readFile(`${dataDir}/chats.json`, 'utf-8')
  const messages = await fsp.readFile(`${dataDir}/messages.json`, 'utf-8')
  const contacts = await fsp.readFile(`${dataDir}/contacts.json`, 'utf-8')
  const auth = await fsp.readFile(`${dataDir}/auth.json`, 'utf-8')
  return { chats, messages, contacts, auth }
}

export async function writeDataToFile(data: DataStore): Promise<void> {
  await fsp.mkdir(dataDir, { recursive: true })
  await fsp.writeFile(`${dataDir}/chats.json`, data.chats, 'utf-8')
  await fsp.writeFile(`${dataDir}/messages.json`, data.messages, 'utf-8')
  await fsp.writeFile(`${dataDir}/contacts.json`, data.contacts, 'utf-8')
  await fsp.writeFile(`${dataDir}/auth.json`, data.auth, 'utf-8')
}
