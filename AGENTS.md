# AGENTS.md

This file helps AI agents understand how to work with this project.

## Project Overview

A WhatsApp MCP (Model Context Protocol) server that bridges WhatsApp and AI assistants. It maps internal Baileys event types to clean exported types (`Chat`, `Contact`, `Message`) and exposes functionality exclusively through tools (no resources).

## Key Conventions

- TypeScript with ESM (`"type": "module"`)
- Source code lives in `src/`, tests in `test/`
- Use `zod` for input validation
- Follow existing tool patterns when adding new tools
- All tool definitions use `server.registerTool()` on an `McpServer` instance

## Common Commands

- `npm run dev` — start dev server with auto-reload
- `npm test` — run test suite
- `npm run build` — compile to JavaScript
- `npm run lint` — check code quality
- `npm run mcpb` — build `.mcpb` plugin package

## Architecture

Entry point is `src/mcp.ts`. It creates a store (`src/store.ts`) and a WhatsApp sync handler (`src/sync.ts`), registers tools from `src/tools/`, and connects to a transport (stdio or HTTP).

Key layers:

| File | Role |
| ---- | ---- |
| `src/mcp.ts` | Entry point — creates store, sync, registers tools, connects transport |
| `src/cli.ts` | Standalone CLI for testing WhatsApp sync without an MCP client |
| `src/store.ts` | In-memory data store that receives Baileys events and persists via `writeData` callback |
| `src/sync.ts` | WhatsApp sync layer using `@whiskeysockets/baileys` |
| `src/auth.ts` | Serializable authentication state for Baileys |
| `src/extTypes.ts` | Public types (`Chat`, `Contact`, `Message`) and mapping from Baileys types |
| `src/dataDir.ts` | File-based persistence helpers |
| `src/tools/` | Tool registration by domain (`chatTools`, `messageTools`, `contactTools`, `authTools`) |
| `src/index.ts` | Package entry — re-exports `createStore`, `createHandler`, and public types |

## Adding a New Tool

1. Create or edit a file in `src/tools/`
2. Define a Zod schema for the tool's input/output
3. Register the tool with `server.registerTool()` providing name, description, schemas, and handler function
4. Import and call the registration function from `src/mcp.ts`

## Testing

- Write tests in `test/` matching the source structure
- Use `vitest` with `describe`/`it`/`expect`
- Test input schemas and handler logic separately
