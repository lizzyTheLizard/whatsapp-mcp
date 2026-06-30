import { describe, it, expect } from 'vitest'
import { registerAuthTools } from '../../src/tools/authTools.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerTools } from './mockServer.js'

describe('get_auth_qr handler', () => {
  it('registers the get_auth_qr tool', () => {
    const serverMock = registerTools(registerAuthTools)
    const tool = serverMock.getRegisteredTool('get_auth_qr')
    expect(tool).toBeDefined()
    expect((tool as unknown[])[1]).toMatchObject({ description: 'Get a QR code to authenticate with WhatsApp. Call this tool when authentication is required.' })
  })

  it('returns QR code result when status is needAuth', async () => {
    const serverMock = registerTools(registerAuthTools, { type: 'needAuth', qr: 'test-qr-data' })
    const handler = serverMock.getRegisteredToolHandler('get_auth_qr')
    const result: CallToolResult = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual({
      url: 'https://public-api.qr-code-generator.com/v1/create/extended?image_format=PNG&image_width=300&qr_code_text=test-qr-data&foreground_color=%23000000&background_color=%23FFFFFF&frame_name=no-frame',
      code: 'test-qr-data',
    })
  })

  it.each([
    ['ready', { type: 'ready' } as const],
    ['connecting', { type: 'connecting' } as const],
  ])('returns error when status is %s', async (_, status) => {
    const serverMock = registerTools(registerAuthTools, status)
    const handler = serverMock.getRegisteredToolHandler('get_auth_qr')
    const result: CallToolResult = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: Authentication is not required at this time.', type: 'text' })
  })

  it('returns error when status is closed', async () => {
    const serverMock = registerTools(registerAuthTools, { type: 'closed' })
    const handler = serverMock.getRegisteredToolHandler('get_auth_qr')
    const result: CallToolResult = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: 'Error: WhatsApp sync is closed. Please restart the server.', type: 'text' })
  })
})

describe('get_status handler', () => {
  it('registers the get_status tool', () => {
    const serverMock = registerTools(registerAuthTools)
    const tool = serverMock.getRegisteredTool('get_status')
    expect(tool).toBeDefined()
    expect((tool as unknown[])[1]).toMatchObject({ description: 'Get the current server status.' })
  })

  it.each([
    ['ready', { type: 'ready' } as const, 'Server is ready and authenticated.'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication is required. Please call get_auth_qr to retrieve a QR code for authentication.'],
    ['connecting', { type: 'connecting' } as const, 'Server is still connecting to WhatsApp, please wait...'],
    ['closed', { type: 'closed' } as const, 'Server connection closed. Error: Unknown error'],
  ])('returns correct text for status %s', async (_, status, expectedText) => {
    const serverMock = registerTools(registerAuthTools, status)
    const handler = serverMock.getRegisteredToolHandler('get_status')
    const result: CallToolResult = await handler()
    expect(result.isError).toBe(false)
    expect(result.content[0]).toEqual({ text: expectedText, type: 'text' })
  })
})
