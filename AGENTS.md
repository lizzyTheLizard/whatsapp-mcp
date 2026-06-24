# AGENTS.md

This file helps AI agents understand how to work with this project.

## Project Overview

A WhatsApp MCP (Model Context Protocol) server that exposes WhatsApp functionality as tools for AI assistants.

## Key Conventions

- TypeScript with ESM (`"type": "module"`)
- Source code lives in `src/`, tests in `tests/`
- Use `zod` for input validation
- Follow existing tool patterns when adding new tools

## Common Commands

- `npm run dev` — start dev server with auto-reload
- `npm test` — run test suite
- `npm run build` — compile to JavaScript
- `npm run lint` — check code quality
- `npm run typecheck` — run TypeScript type checking

## Architecture

The MCP server uses `@modelcontextprotocol/sdk` with stdio transport. Tools are registered in `src/index.ts` via `server.setRequestHandler`. Each tool has:

1. A `zod` schema for input validation
2. A definition in `ListToolsRequestSchema`
3. A handler in `CallToolRequestSchema`

## Adding a New Tool

1. Define a Zod schema for the tool's input
2. Add the tool definition to `ListToolsRequestSchema`
3. Add a case to the switch in `CallToolRequestSchema`

## Testing

- Write tests in `tests/` matching the source structure
- Use `vitest` with `describe`/`it`/`expect`
- Test input schemas and handler logic separately
