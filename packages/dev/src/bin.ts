#!/usr/bin/env node
import { dev } from './index.ts'

const entry = process.argv[2]
const port = Number(process.env.PORT ?? 3000)
const { url } = await dev({ ...(entry ? { entry } : {}), port })
console.log(`Hozu dev on ${url} (hot CSS, reload on code changes)`)
