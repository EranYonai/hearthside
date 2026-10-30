/** Parse delimited text (RFC 4180 quoting). The delimiter is guessed from the first lines. */
export function parseCsv(text: string, delimiter = guessDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const CANDIDATES = [',', ';', '\t', '|']

export function guessDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 10)
  let best = ','
  let bestScore = 0
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => l.split(d).length - 1)
    const score = counts.reduce((a, b) => a + b, 0)
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}
