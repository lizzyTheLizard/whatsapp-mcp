import { promises as fsp } from 'fs'
import { DataStore } from './index.js'

const dataDir = process.env.DATA_DIR ?? './data'

export async function readDataFromFile(): Promise<DataStore | undefined> {
  const canAccess = await fsp.access(dataDir).then(() => true).catch(() => false)
  if (!canAccess) return undefined
  const chats = JSON.parse(await fsp.readFile(`${dataDir}/chats.json`, 'utf-8')) as Record<string, string>
  const messages = JSON.parse(await fsp.readFile(`${dataDir}/messages.json`, 'utf-8')) as Record<string, string>
  const contacts = JSON.parse(await fsp.readFile(`${dataDir}/contacts.json`, 'utf-8')) as Record<string, string>
  const auth = await fsp.readFile(`${dataDir}/auth.json`, 'utf-8')
  return { chats, messages, contacts, auth }
}

export async function writeDataToFile(data: DataStore): Promise<void> {
  await fsp.mkdir(dataDir, { recursive: true })
  await fsp.writeFile(`${dataDir}/chats.json`, JSON.stringify(data.chats, null, 2), 'utf-8')
  await fsp.writeFile(`${dataDir}/messages.json`, JSON.stringify(data.messages, null, 2), 'utf-8')
  await fsp.writeFile(`${dataDir}/contacts.json`, JSON.stringify(data.contacts, null, 2), 'utf-8')
  await fsp.writeFile(`${dataDir}/auth.json`, data.auth, 'utf-8')
}
