# WhatsApp MCP Server

MCP (Model Context Protocol) server for WhatsApp integration, enabling AI assistants to interact with WhatsApp.

## Prerequisites

- Node.js >= 20
- npm

## Setup

```bash
npm install
```

## Usage

### Start (production)

```bash
npm run build
npm start
```

### Development (auto-reload)

```bash
npm run dev
```

The server runs on **stdio** transport and communicates via the MCP protocol.

## Scripts

| Command              | Description                                |
| -------------------- | ------------------------------------------ |
| `npm run build`      | Compile TypeScript to `dist/`              |
| `npm start`          | Run compiled server                        |
| `npm run dev`        | Run with auto-reload on file changes       |
| `npm test`           | Run tests                                  |
| `npm run test:watch` | Run tests in watch mode                    |
| `npm run lint`       | Lint source code                           |
| `npm run typecheck`  | Type-check without emitting files          |

## Docker

```bash
docker build -t whatsapp-mcp .
docker run --rm -i whatsapp-mcp
```

## Tools

| Tool              | Description                          |
| ----------------- | ------------------------------------ |
| `send_message`    | Send a WhatsApp message              |
| `list_chats`      | List recent WhatsApp chats           |
| `read_messages`   | Read messages from a WhatsApp chat   |

## License

MIT
