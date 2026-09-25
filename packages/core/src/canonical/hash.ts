import { createHash } from 'node:crypto'
import { canonicalStringify } from './stringify.ts'

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

export const hashJson = (value: unknown): string => sha256(canonicalStringify(value))
