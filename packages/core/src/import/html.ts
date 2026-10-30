const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * Rows of every table in an HTML document. Some services export "Excel" files that are
 * really an HTML table, so this covers those without a full HTML parser.
 */
export function parseHtmlTables(html: string): string[][] {
  const rows: string[][] = []
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)(?=<tr[\s>]|<\/table|$)/gi)) {
    const cells = [...tr[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)(?=<t[dh][\s>]|<\/tr|$)/gi)].map((m) =>
      decodeEntities(m[1]!.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim(),
    )
    if (cells.length) rows.push(cells)
  }
  return rows
}
