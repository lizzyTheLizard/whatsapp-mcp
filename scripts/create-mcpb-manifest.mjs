import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '..', 'package.json')
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

const manifestPath = resolve(__dirname, '..', 'manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
