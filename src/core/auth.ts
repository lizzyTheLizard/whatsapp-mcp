import { AuthenticationCreds, BufferJSON, initAuthCreds, SignalDataTypeMap, proto, SignalDataSet, AuthenticationState } from '@whiskeysockets/baileys'

export interface ExportableAuthState extends AuthenticationState {
  toAuthState: () => string
}

interface AuthStateInput { creds: AuthenticationCreds, keys: Record<string, string> }

export function createExportableAuth(input?: string): ExportableAuthState {
  const { creds, keys } = fromString<AuthStateInput>(input) ?? { creds: initAuthCreds(), keys: {} }
  return {
    creds,
    keys: { get: (t, ids) => getKey(t, ids, keys), set: (data) => { setKey(data, keys) } },
    toAuthState: () => toString({ creds, keys }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function fromString<T>(str: string | undefined): T | undefined {
  if (!str) return undefined
  return JSON.parse(str, BufferJSON.reviver) as T
}

function toString(data: unknown): string {
  return JSON.stringify(data, BufferJSON.replacer)
}

function getKey<T extends keyof SignalDataTypeMap>(type: T, ids: string[], keys: Record<string, string>): Record<string, SignalDataTypeMap[T]> {
  return ids.reduce<Record<string, SignalDataTypeMap[T]>>((acc, id) => {
    const value = fromString<SignalDataTypeMap[T]>(keys[`${type}-${id}`])
    if (!value) return acc
    if (type === 'app-state-sync-key') {
      const typedValue = value as SignalDataTypeMap['app-state-sync-key']
      const converted = proto.Message.AppStateSyncKeyData.fromObject(typedValue)
      const typeResult = converted as unknown as SignalDataTypeMap[T]
      acc[id] = typeResult
    }
    else {
      acc[id] = value
    }
    return acc
  }, {})
}

function setKey(data: SignalDataSet, keys: Record<string, string>): void {
  for (const category in data) {
    const dataCategory = data[category as keyof SignalDataTypeMap]
    for (const id in dataCategory) {
      const value = dataCategory[id]
      if (!value)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete keys[`${category}-${id}`]
      else {
        keys[`${category}-${id}`] = JSON.stringify(value, BufferJSON.replacer)
      }
    }
  }
}
