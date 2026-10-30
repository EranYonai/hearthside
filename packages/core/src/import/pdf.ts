import type { Sheet } from './table'

interface Word {
  text: string
  x: number
  right: number
  y: number
}

/** Header words that start a statement table, in English or Hebrew exports. */
const HEADER_HINTS = [/^date$/i, /^debit$/i, /^credit$/i, /^תאריך$/, /^חובה$/, /^זכות$/]
/** Gap between words (in points) that separates two header cells. */
const CELL_GAP = 12
const LINE_TOLERANCE = 2.5

async function loadPdfJs() {
  // Register the worker in-process so no separate worker file has to be served.
  // @ts-expect-error -- pdf.js ships no typings for its worker module
  const worker: unknown = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

async function pageWords(bytes: Uint8Array): Promise<Word[][]> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  })
  const doc = await task.promise
  try {
    const pages: Word[][] = []
    for (let p = 1; p <= Math.min(doc.numPages, 200); p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const words: Word[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const [, , , , x, y] = item.transform as number[]
        words.push({ text: item.str.trim(), x: x!, right: x! + item.width, y: y! })
      }
      pages.push(words)
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}

/** Group words into lines (top to bottom), each sorted left to right. */
export function toLines(words: readonly Word[]): Word[][] {
  const sorted = [...words].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Word[][] = []
  for (const w of sorted) {
    const line = lines.at(-1)
    if (line && Math.abs(line[0]!.y - w.y) <= LINE_TOLERANCE) line.push(w)
    else lines.push([w])
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x)
  return lines
}

interface Column {
  label: string
  left: number
  right: number
}

/** Merge header words into cells: "Balance" "(NIS)" stays one column. */
function headerColumns(line: readonly Word[]): Column[] {
  const cols: Column[] = []
  for (const w of line) {
    const last = cols.at(-1)
    if (last && w.x - last.right < CELL_GAP) {
      last.label += ` ${w.text}`
      last.right = w.right
    } else cols.push({ label: w.text, left: w.x, right: w.right })
  }
  return cols
}

function isHeader(line: readonly Word[]): boolean {
  return HEADER_HINTS.filter((re) => line.some((w) => re.test(w.text))).length >= 2
}

/** Index of the column whose span is closest to the word's centre; -1 when far outside the table. */
function columnFor(cols: readonly Column[], w: Word): number {
  const centre = (w.x + w.right) / 2
  const last = cols.at(-1)!
  if (w.x > last.right + CELL_GAP * 2) return -1
  let best = 0
  let bestDistance = Infinity
  cols.forEach((c, i) => {
    const distance = centre < c.left ? c.left - centre : centre > c.right ? centre - c.right : 0
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  })
  return best
}

const DATE_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/

/**
 * Turn the words of a text PDF statement into table rows by where they sit on the page.
 * Columns come from the header line; lines without a date continue the row above.
 */
export function wordsToRows(pages: readonly (readonly Word[])[]): string[][] {
  const rows: string[][] = []
  let cols: Column[] | undefined
  let headerEmitted = false
  for (const words of pages) {
    for (const line of toLines(words)) {
      if (isHeader(line)) {
        cols = headerColumns(line)
        if (!headerEmitted) rows.push(cols.map((c) => c.label))
        headerEmitted = true
        continue
      }
      if (!cols) {
        // Keep the title block as plain text rows; it names the account.
        if (!headerEmitted) rows.push([line.map((w) => w.text).join(' ')])
        continue
      }
      const cells = cols.map(() => '')
      for (const w of line) {
        const i = columnFor(cols, w)
        if (i >= 0) cells[i] = cells[i] ? `${cells[i]} ${w.text}` : w.text
      }
      if (cells.every((c) => !c)) continue
      if (DATE_RE.test(cells[0]!)) rows.push(cells)
      else {
        // A wrapped description: add the text to the row above, ignore stray marks.
        const prev = rows.at(-1)
        const textCol = 1
        if (
          prev &&
          DATE_RE.test(prev[0] ?? '') &&
          cells[textCol] &&
          cells.filter(Boolean).length === 1
        )
          prev[textCol] = `${prev[textCol]} ${cells[textCol]}`.trim()
      }
    }
  }
  return rows
}

export async function readPdf(bytes: Uint8Array, name = 'PDF'): Promise<Sheet[]> {
  return [{ name, rows: wordsToRows(await pageWords(bytes)) }]
}
