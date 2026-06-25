import { describe, it, expect } from 'vitest'
import { createExportableAuth } from './auth.js'

describe('createExportableAuth', () => {
  it('returns fresh auth with initAuthCreds when called without argument', () => {
    const auth = createExportableAuth()
    expect(auth.creds).toBeDefined()
    expect(auth.keys).toBeDefined()
    expect(typeof auth.toAuthState).toBe('function')
  })

  it('restores creds and keys from a JSON string', () => {
    const original = createExportableAuth()
    const json = original.toAuthState()
    const restored = createExportableAuth(json)
    expect(restored.creds.registrationId).toBe(original.creds.registrationId)
    expect(restored.creds.noiseKey.public).toEqual(original.creds.noiseKey.public)
  })

  it('roundtrips through toAuthState and back', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ 'sender-key': { 'test@test:1': new Uint8Array([1, 2, 3]) } })
    const json = auth.toAuthState()
    const imported = createExportableAuth(json)
    const retrieved = await imported.keys.get('sender-key', ['test@test:1'])
    expect(retrieved['test@test:1']).toBeDefined()
    expect(new Uint8Array(retrieved['test@test:1'])).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('preserves Uint8Array values through export and import', async () => {
    const auth = createExportableAuth()
    const original = new Uint8Array([255, 254, 253])
    await auth.keys.set({ 'sender-key': { 'test-id': original } })
    const json = auth.toAuthState()
    const imported = createExportableAuth(json)
    const retrieved = await imported.keys.get('sender-key', ['test-id'])
    expect(new Uint8Array(retrieved['test-id'])).toEqual(original)
  })

  it('handles undefined input and returns fresh auth', () => {
    const auth = createExportableAuth(undefined)
    expect(auth.creds).toBeDefined()
    expect(auth.creds.registrationId).toBeGreaterThan(0)
  })

  it('throws on invalid JSON string', () => {
    expect(() => createExportableAuth('not valid json')).toThrow()
  })

  it('handles empty JSON object (no creds)', () => {
    const auth = createExportableAuth('{}')
    expect(typeof auth.toAuthState).toBe('function')
    expect(auth.toAuthState()).toBe('{}')
  })
})

describe('keys store (set/get)', () => {
  it('stores and retrieves session values', async () => {
    const auth = createExportableAuth()
    const value = new Uint8Array([10, 20, 30])
    await auth.keys.set({ session: { 'session-id': value } })
    const result = await auth.keys.get('session', ['session-id'])
    expect(result['session-id']).toBeDefined()
    expect(new Uint8Array(result['session-id'])).toEqual(value)
  })

  it('stores and retrieves string values (lid-mapping)', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ 'lid-mapping': { test: 'mapped-value' } })
    const result = await auth.keys.get('lid-mapping', ['test'])
    expect(result.test).toBe('mapped-value')
  })

  it('stores and retrieves string array values (device-list)', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ 'device-list': { test: ['dev1', 'dev2'] } })
    const result = await auth.keys.get('device-list', ['test'])
    expect(result.test).toEqual(['dev1', 'dev2'])
  })

  it('returns empty object for missing keys', async () => {
    const auth = createExportableAuth()
    const result = await auth.keys.get('session', ['nonexistent'])
    expect(result).toEqual({})
  })

  it('overwrites existing values on successive sets', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ session: { s1: new Uint8Array([1]) } })
    await auth.keys.set({ session: { s1: new Uint8Array([2]) } })
    const result = await auth.keys.get('session', ['s1'])
    expect(new Uint8Array(result.s1)).toEqual(new Uint8Array([2]))
  })

  it('deletes key when value is set to null', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ session: { s1: new Uint8Array([1]) } })
    await auth.keys.set({ session: { s1: null } })
    const result = await auth.keys.get('session', ['s1'])
    expect(result).toEqual({})
  })

  it('retrieves multiple ids in a single get call', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ 'lid-mapping': { id1: 'val1', id2: 'val2' } })
    const result = await auth.keys.get('lid-mapping', ['id1', 'id2'])
    expect(result.id1).toBe('val1')
    expect(result.id2).toBe('val2')
  })

  it('handles app-state-sync-key with correct protobuf conversion', async () => {
    const auth = createExportableAuth()
    const keyData = {
      keyData: new Uint8Array([1, 2, 3]),
      timestamp: 1234567890,
    }
    await auth.keys.set({ 'app-state-sync-key': { key1: keyData } })
    const result = await auth.keys.get('app-state-sync-key', ['key1'])
    expect(result.key1).toBeDefined()
    expect(result.key1.keyData).toBeDefined()
    expect(Number(result.key1.timestamp)).toBe(1234567890)
  })

  it('stores and retrieves sender-key-memory (boolean map)', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ 'sender-key-memory': { jid1: { user1: true } } })
    const result = await auth.keys.get('sender-key-memory', ['jid1'])
    expect(result.jid1.user1).toBe(true)
  })

  it('stores and retrieves tctoken', async () => {
    const auth = createExportableAuth()
    await auth.keys.set({ tctoken: { default: { token: Buffer.from('token-data'), timestamp: '123' } } })
    const result = await auth.keys.get('tctoken', ['default'])
    expect(result.default.token).toBeDefined()
    expect(result.default.timestamp).toBe('123')
  })
})
