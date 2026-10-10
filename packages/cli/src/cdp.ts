import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'

type Listener = (method: string, params: any, sessionId: string | undefined) => void

export interface Cdp {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>
  on(listener: Listener): void
  close(): Promise<void>
}

const CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  win32: [
    join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    join(
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
      'Google\\Chrome\\Application\\chrome.exe',
    ),
    join(
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft\\Edge\\Application\\msedge.exe',
    ),
    join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
}

const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']

export function findBrowser(): string | null {
  for (const name of ['HOZU_CHROME', 'CHROME_PATH', 'CHROMIUM_PATH']) {
    const path = process.env[name]
    if (path && existsSync(path)) return path
  }
  for (const path of CANDIDATES[process.platform] ?? []) if (existsSync(path)) return path
  if (process.platform === 'win32') return null
  for (const name of ON_PATH)
    try {
      const path = execFileSync('which', [name], { encoding: 'utf8' }).trim()
      if (path) return path
    } catch {}
  return null
}

export function launch(browser: string, profile: string): Cdp {
  const child: ChildProcess = spawn(
    browser,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--mute-audio',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader',
      '--disable-features=Prerender2FallbackPrefetchSpecRules,LocalNetworkAccessChecks',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  )
  const input = child.stdio[3] as Writable
  const output = child.stdio[4] as Readable
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>()
  const listeners: Listener[] = []
  let id = 0
  let buffer = ''
  let exited: Error | null = null
  const stop = (error: Error) => {
    exited = error
    for (const p of pending.values()) p.reject(error)
    pending.clear()
  }
  child.on('error', (e) => stop(e))
  child.on('exit', () => stop(new Error('The browser exited')))
  output.setEncoding('utf8')
  output.on('data', (chunk: string) => {
    buffer += chunk
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      if (message.id !== undefined) {
        const p = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) p?.reject(new Error(`${message.error.message}`))
        else p?.resolve(message.result)
      } else for (const l of listeners) l(message.method, message.params, message.sessionId)
    }
  })
  return {
    send: (method, params = {}, sessionId) =>
      exited
        ? Promise.reject(exited)
        : new Promise((resolve, reject) => {
            const message = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
            pending.set(message.id, { resolve, reject })
            input.write(`${JSON.stringify(message)}\0`)
          }),
    on: (listener) => listeners.push(listener),
    close: async () => {
      if (exited) return
      const gone = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      input.write(`${JSON.stringify({ id: ++id, method: 'Browser.close', params: {} })}\0`)
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
      await gone
      clearTimeout(timer)
    },
  }
}
