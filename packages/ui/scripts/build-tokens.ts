// Generates src/theme.css from src/tokens.json (the design system export).
// Run `pnpm tokens` after updating tokens.json; a unit test fails when they drift.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderTheme, type Tokens } from '../src/tokens.ts'

const root = new URL('../src/', import.meta.url)
const tokens = JSON.parse(readFileSync(new URL('tokens.json', root), 'utf8')) as Tokens
writeFileSync(fileURLToPath(new URL('theme.css', root)), renderTheme(tokens))
console.log('Wrote src/theme.css')
