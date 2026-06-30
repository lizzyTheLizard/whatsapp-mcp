import { execSync } from 'node:child_process'
import console from 'node:console'
import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const mcpbuildPath = resolve(appDir, 'mcpb-build')
const pkgPath = resolve(appDir, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

const manifest = {
  manifest_version: '0.3',
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  server: {
    type: 'node',
    entry_point: 'dist/mcp.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/dist/mcp.js'],
    },
  },
  license: pkg.license,
  repository: pkg.repository,
}

console.log(`Creating mcpb package for ${pkg.name} version ${pkg.version}`)
rmSync(mcpbuildPath, { recursive: true, force: true })
mkdirSync(mcpbuildPath, { recursive: true })
cpSync(pkgPath, resolve(mcpbuildPath, 'package.json'))
cpSync(resolve(appDir, 'package-lock.json'), resolve(mcpbuildPath, 'package-lock.json'))
cpSync(resolve(appDir, 'dist'), resolve(mcpbuildPath, 'dist'), { recursive: true, force: true })
execSync(`npm ci --omit=dev --omit=optional --omit=peer`, { cwd: mcpbuildPath })
const manifestPath = resolve(mcpbuildPath, 'manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Created mcpb-build folder at ${mcpbuildPath}`)
execSync(`npx @anthropic-ai/mcpb pack . whatsapp-mcp.mcpb`, { cwd: mcpbuildPath })
cpSync(resolve(mcpbuildPath, 'whatsapp-mcp.mcpb'), resolve(appDir, 'whatsapp-mcp.mcpb'))
rmSync(mcpbuildPath, { recursive: true, force: true })
console.log(`Created whatsapp-mcp.mcpb at ${resolve(appDir, 'whatsapp-mcp.mcpb')}`)
