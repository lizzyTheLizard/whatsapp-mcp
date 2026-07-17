import * as fs from 'fs'
import { DataObject } from './core/handler.js'
import { join } from 'path'

const dataDir = process.env.DATA_DIR ?? './data'

export async function readDataFromFile(): Promise<DataObject[] | undefined> {
  const canAccess = await fs.promises.access(dataDir).then(() => true).catch(() => false)
  if (!canAccess) return undefined
  const result: DataObject[] = []

  const chatFiles = await fs.promises.readdir(join(dataDir, 'chat')).catch(() => [])
  for (const file of chatFiles) {
    if (!file.endsWith('.json')) continue
    const filePath = join(dataDir, 'chat', file)
    const data = await fs.promises.readFile(filePath, 'utf-8')
    result.push({ id: file.replace('.json', ''), type: 'chat', data })
  }

  const contactFiles = await fs.promises.readdir(join(dataDir, 'contact')).catch(() => [])
  for (const file of contactFiles) {
    if (!file.endsWith('.json')) continue
    const filePath = join(dataDir, 'contact', file)
    const data = await fs.promises.readFile(filePath, 'utf-8')
    result.push({ id: file.replace('.json', ''), type: 'contact', data })
  }

  const authFiles = await fs.promises.readdir(join(dataDir, 'auth')).catch(() => [])
  for (const file of authFiles) {
    if (!file.endsWith('.json')) continue
    const filePath = join(dataDir, 'auth', file)
    const data = await fs.promises.readFile(filePath, 'utf-8')
    result.push({ id: file.replace('.json', ''), type: 'auth', data })
  }
  return result
}

export function writeDataToFile(data: DataObject): void {
  const folder = join(dataDir, data.type)
  fs.mkdirSync(folder, { recursive: true })
  const file = join(folder, `${data.id}.json`)
  fs.rmSync(file, { force: true })
  fs.writeFileSync(file, data.data, 'utf-8')
}
