import type { CliError } from './contract.ts'

export class TenonCliError extends Error {
  readonly code: CliError['error']['code']
  readonly suggestions: string[]

  constructor(code: CliError['error']['code'], message: string, suggestions: string[] = []) {
    super(message)
    this.code = code
    this.suggestions = suggestions
  }

  toJSON(): CliError {
    return { error: { code: this.code, message: this.message, suggestions: this.suggestions } }
  }
}
