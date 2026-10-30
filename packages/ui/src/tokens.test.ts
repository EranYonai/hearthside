import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderTheme, type Tokens } from './tokens'
import tokens from './tokens.json'

describe('theme.css', () => {
  it('is in sync with tokens.json (run `pnpm tokens`)', () => {
    const committed = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8')
    expect(committed).toBe(renderTheme(tokens as Tokens))
  })

  it('resolves references and themes', () => {
    const css = renderTheme(tokens as Tokens)
    expect(css).toContain('--hs-surface-0: #fbf7ee;')
    expect(css).toContain('--hs-surface-0: #141821;')
    expect(css).toContain('--hs-focus: #ff8a3d;')
    expect(css).toContain('--color-brand-ink: var(--hs-brand-ink);')
    expect(css).toContain('--text-amount-hero: 34px;')
    expect(css).toContain('"Rubik Variable", "Rubik"')
  })

  it('rejects unknown references', () => {
    const broken = structuredClone(tokens) as Tokens
    broken.color.tokens[0]!.value.light = '{nope}'
    expect(() => renderTheme(broken)).toThrow('Unknown token reference {nope}')
  })
})
