type Themed = { light: string; dark: string }

export interface Tokens {
  color: { tokens: { name: string; value: Themed }[] }
  type: {
    families: Record<'display' | 'body', string>
    groups: {
      styles: {
        name: string
        fontSize: string
        lineHeight: string
        fontWeight: number
        letterSpacing?: string
      }[]
    }[]
  }
  radius: { tokens: { name: string; value: string }[] }
  shadow: { tokens: { name: string; value: Themed }[] }
}

// Self-hosted variable fonts register under these names (see apps/web globals.css).
const FONT_ALIASES: Record<string, string> = {
  '"Rubik"': '"Rubik Variable", "Rubik"',
  '"Heebo"': '"Heebo Variable", "Heebo"',
}

function resolve(value: string, theme: keyof Themed, colors: Map<string, Themed>): string {
  const ref = /^\{(.+)\}$/.exec(value)
  if (!ref) return value
  const target = colors.get(ref[1]!)
  if (!target) throw new Error(`Unknown token reference ${value}`)
  return resolve(target[theme], theme, colors)
}

function vars(tokens: Tokens, theme: keyof Themed, indent: string): string {
  const colors = new Map(tokens.color.tokens.map((t) => [t.name, t.value]))
  const lines = [
    ...tokens.color.tokens.map((t) => `--hs-${t.name}: ${resolve(t.value[theme], theme, colors)};`),
    ...tokens.shadow.tokens.map((t) => `--hs-${t.name}: ${t.value[theme]};`),
    `color-scheme: ${theme};`,
  ]
  return lines.map((l) => indent + l).join('\n')
}

function family(stack: string): string {
  return Object.entries(FONT_ALIASES).reduce((s, [from, to]) => s.replace(from, to), stack)
}

/** Render the Tailwind v4 theme: raw themed variables plus `@theme` utilities. */
export function renderTheme(tokens: Tokens): string {
  const theme = [
    ...tokens.color.tokens.map((t) => `--color-${t.name}: var(--hs-${t.name});`),
    `--font-display: ${family(tokens.type.families.display)};`,
    `--font-body: ${family(tokens.type.families.body)};`,
    ...tokens.type.groups.flatMap((g) =>
      g.styles.map((s) =>
        [
          `--text-${s.name}: ${s.fontSize};`,
          `--text-${s.name}--line-height: ${s.lineHeight};`,
          `--text-${s.name}--font-weight: ${s.fontWeight};`,
          ...(s.letterSpacing ? [`--text-${s.name}--letter-spacing: ${s.letterSpacing};`] : []),
        ].join('\n  '),
      ),
    ),
    ...tokens.radius.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...tokens.shadow.tokens.map((t) => `--${t.name}: var(--hs-${t.name});`),
  ]
  return `/* Generated from tokens.json by scripts/build-tokens.ts. Do not edit by hand. */

:root {
${vars(tokens, 'light', '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${vars(tokens, 'dark', '    ')}
  }
}

:root[data-theme='dark'] {
${vars(tokens, 'dark', '  ')}
}

@theme inline {
  ${theme.join('\n  ')}
}
`
}
