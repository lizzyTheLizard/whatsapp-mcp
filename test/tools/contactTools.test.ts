import { describe, it, expect, vi } from 'vitest'
import { registerContactResources } from '../../src/tools/contactTools.js'
import { registerTools } from './mockServer.js'

const validContact = { jid: 'c1', name: 'Contact1', phone: '+41 79 123 45 67' }

describe('get_all_contacts tool', () => {
  it('returns store.getContacts() as structured output', async () => {
    const serverMock = registerTools(registerContactResources)
    vi.mocked(serverMock.store.getContacts).mockReturnValue([validContact])
    const handler = serverMock.getRegisteredToolHandler('get_all_contacts')

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual([validContact])
  })

  it('returns empty array when no contacts exist', async () => {
    const serverMock = registerTools(registerContactResources)
    const handler = serverMock.getRegisteredToolHandler('get_all_contacts')

    const result = await handler()
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toEqual([])
  })

  it.each([
    ['connecting', { type: 'connecting' } as const, 'Server still connecting, please wait'],
    ['closed', { type: 'closed' } as const, 'Connection closed, please restart server'],
    ['needAuth', { type: 'needAuth', qr: 'test-qr-data' } as const, 'Authentication required, please call the "get_auth_qr" tool to get a QR code for authentication'],
  ])('returns error when status is %s', async (_, status, expectedMsg) => {
    const serverMock = registerTools(registerContactResources, status)
    const handler = serverMock.getRegisteredToolHandler('get_all_contacts')

    const result = await handler()
    expect(result.isError).toBe(true)
    expect(result.content[0]).toEqual({ text: `Error: ${expectedMsg}`, type: 'text' })
  })
})
