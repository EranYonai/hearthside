import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND_IDS, CARD_NETWORKS, LOGO_FILES, brandOf, logoPath } from '@hearthside/core'
import { describe, expect, it } from 'vitest'

const dir = join(import.meta.dirname, '../../public/logos')

describe('built-in logos', () => {
  it('lists exactly the files that ship, each with a source', () => {
    const files = readdirSync(dir).filter((f) => f !== 'SOURCES.md')
    expect(Object.values(LOGO_FILES).sort()).toEqual(files.sort())
    const sources = readFileSync(join(dir, 'SOURCES.md'), 'utf8')
    for (const id of Object.keys(LOGO_FILES)) expect(sources).toContain(`| ${id} |`)
  })

  it('has a logo for every brand except the few marked approximate', () => {
    for (const id of BRAND_IDS)
      expect(logoPath(id) !== null || brandOf(id).approx === true).toBe(true)
    for (const n of CARD_NETWORKS.filter((n) => n !== 'isracard'))
      expect(logoPath(n)).not.toBeNull()
  })

  it('ships SVGs without scripts or external references', () => {
    for (const f of Object.values(LOGO_FILES).filter((f) => f.endsWith('.svg'))) {
      const svg = readFileSync(join(dir, f), 'utf8')
      expect(svg, f).not.toMatch(/<script|javascript:|\son[a-z]+\s*=|<foreignObject/i)
      expect(svg, f).not.toMatch(/(?:href|src)\s*=\s*["'](?:https?:)?\/\//i)
    }
  })
})
