export interface ILogger {
  error: (message: string, error?: Error) => void
  warn: (message: string) => void
  info: (message: string) => void
  debug: (message: string) => void
  trace: (message: string) => void
}

export const noLog: ILogger = {
  error: () => { /* empty */ },
  warn: () => { /* empty */ },
  info: () => { /* empty */ },
  debug: () => { /* empty */ },
  trace: () => { /* empty */ },
}

export const consoleLog: ILogger = {
  error: (message: string, error?: Error) => { console.error(message, error) },
  warn: (message: string) => { console.warn(message) },
  info: (message: string) => { console.info(message) },
  debug: (message: string) => { console.debug(message) },
  trace: () => { /* empty */ },
}
