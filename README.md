# WhatsApp MCP Server

An MCP (Model Context Protocol) server that bridges WhatsApp and AI assistants. It maps internal WhatsApp (Baileys) event types to clean, exported types (`Chat`, `Contact`, `Message`) and exposes functionality through **MCP-Tools**

## Tools

The server exposes the following MCP tools

| Tool | Description |
| ---- | ----------- |
| `get_status` | Get the current server status |
| `get_auth_qr` | Get a QR code to authenticate with WhatsApp |
| `get_all_chats` | Retrieve all WhatsApp chats with their metadata |
| `set_chat_archived` | Set a WhatsApp chat as archived or unarchived |
| `set_chat_read` | Set a WhatsApp chat as read or unread |
| `get_all_contacts` | Retrieve all WhatsApp contacts |
| `send_message` | Send a WhatsApp message to a given JID |
| `get_all_messages` | Retrieve all WhatsApp messages across all chats |
| `get_all_messages_for_chat` | Retrieve all WhatsApp messages for a specific chat |

## Quickstart

You can start the WhatsApp MCP server standalone via npm, use the pre-built Docker image, or import it into Claude Desktop using the MCPB plugin format.

### npm

```bash
npx @lizzythelizard/whatsapp-mcp

#Or install globally
npm install -g @lizzythelizard/whatsapp-mcp
whatsapp-mcp
```

### Docker

```bash
docker run --rm -v ./data:/app/data lizzythelizard/whatsapp-mcp
```

### Claude MCPB Plugin

Download `whatsapp-mcp.mcpb` from the [latest GitHub release](https://github.com/lizzyTheLizard/whatsapp-mcp/releases/latest) and install it:

```bash
npx @anthropic-ai/mcpb add whatsapp-mcp.mcpb
```

## Library

You can use WhatsApp MCP directly in your own Node.js applications. The package exports `createStore`, `createHandler`, and the types `Chat`, `Contact`, `Message`.

Data persistence is handled via the `DataStore` interface. Load existing data on startup and provide a `writeData` callback that gets called when data changes:

```ts
import { createStore, createHandler } from '@lizzythelizard/whatsapp-mcp'

// Load previously saved data (e.g. from files)
const initialData = {
  chats: await fs.readFile('data/chats.json', 'utf-8'),
  contacts: await fs.readFile('data/contacts.json', 'utf-8'),
  messages: await fs.readFile('data/messages.json', 'utf-8'),
  auth: await fs.readFile('data/auth.json', 'utf-8'),
}

const store = createStore(initialData, {
  writeData: async (data) => {
    await fs.writeFile('data/chats.json', data.chats)
    await fs.writeFile('data/contacts.json', data.contacts)
    await fs.writeFile('data/messages.json', data.messages)
    await fs.writeFile('data/auth.json', data.auth)
  },
})

const handler = createHandler(store)
await handler.start()

// Send a message
const msg = await handler.sendMessage('41791234567@s.whatsapp.net', 'Hello!')
```

## Development

### Prerequisites

- Node.js >= 20
- npm

### Getting Started

```bash
git clone https://github.com/lizzyTheLizard/whatsapp-mcp.git
cd whatsapp-mcp
npm install
npm run dev
```

The server runs on **stdio** transport by default and communicates via the MCP protocol.

### Architecture

| File | Purpose |
| ---- | ------- |
| `src/mcp.ts` | Entry point for the MCP server. Creates store & handler, registers tools, connects transport (stdio or HTTP). |
| `src/cli.ts` | Standalone CLI for testing WhatsApp sync without an MCP client. |
| `src/store.ts` | In-memory data store that receives Baileys events and persists them. |
| `src/sync.ts` | WhatsApp sync layer using `@whiskeysockets/baileys`. Manages connection state, QR auth, and message sending. |
| `src/auth.ts` | Serializable authentication state for Baileys. |
| `src/tools/` | Tool registration files grouped by domain (`chatTools`, `messageTools`, `contactTools`, `authTools`). |
| `src/extTypes.ts` | Public type definitions (`Chat`, `Contact`, `Message`) and mapping functions from Baileys types. |
| `src/dataDir.ts` | File-based persistence helpers for reading/writing store data to disk. |

### Adding a New Tool

1. Create a file in `src/tools/` (or add to an existing one)
2. Define a Zod schema for the tool's input/output
3. Register the tool on the `McpServer` instance using `server.registerTool()`
4. Import and call the registration function from `src/mcp.ts`

### Scripts

| Command | Description |
| ------- | ----------- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run dev` | Run with auto-reload on file changes |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source code |
| `npm run cli` | Run the standalone CLI tool |
| `npm run inspect` | Open the MCP Inspector |
| `npm run mcpb` | Build the `.mcpb` plugin package |

## Repository Structure

A quick overview of the important files and directories in this repository.

```
whatsapp-mcp/
├── .github/              # CI workflows and dependabot config
├── scripts/              # Build scripts (create-mcpb)
├── test/                 # Test files
├── dist/                 # Compiled output (generated)
├── data/                 # Runtime data directory (development only)
├── package.json          # Package manifest and scripts
├── tsconfig.json         # TypeScript configuration
├── Dockerfile            # Docker image definition
├── AGENTS.md             # Guidance for AI coding agents
└── LICENSE               # MIT license
```

## Releases

Every merge to `main` triggers an automatic release via the CI pipeline. The version number must be incremented in `package.json` **before** merging to `main`.

The CI workflow:

1. Runs checks (build, lint, test)
2. Publishes to npm (`@lizzythelizard/whatsapp-mcp`)
3. Builds and pushes Docker image to Docker Hub (`lizzythelizard/whatsapp-mcp`)
4. Creates a GitHub Release with auto-generated notes and attaches `whatsapp-mcp.mcpb`

Release notes are auto-generated and should be edited on GitHub after the release is created to provide a clear changelog.

## Credits

- Built on [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) — the WhatsApp Web protocol implementation
- Uses the [Model Context Protocol](https://modelcontextprotocol.io) SDK by Anthropic

## Contribute

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/lizzyTheLizard/whatsapp-mcp).

Before submitting, make sure to run:

```bash
npm run lint
npm run build
npm test
```

Follow the existing code patterns and keep tool definitions in `src/tools/`.

## License

MIT — see [LICENSE](LICENSE).
