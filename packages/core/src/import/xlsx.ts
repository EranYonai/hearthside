import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import type { Sheet } from './table'

/** Uncompressed size we are willing to read from one workbook. */
const MAX_UNZIPPED = 60 * 1024 * 1024

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: false,
  isArray: (name, _path, _leaf, isAttribute) =>
    !isAttribute && ['sheet', 'Relationship', 'si', 'r', 'row', 'c'].includes(name),
})

type Node = Record<string, unknown>

function text(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  const n = node as Node
  if ('#text' in n) return String(n['#text'])
  return ''
}

/** Text of a shared string or inline string: plain <t>, or rich-text runs <r><t>. */
function richText(si: Node | undefined): string {
  if (!si) return ''
  if (si.t !== undefined) return text(si.t)
  if (Array.isArray(si.r)) return (si.r as Node[]).map((r) => text(r.t)).join('')
  return ''
}

export function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export class WorkbookError extends Error {}

export function readXlsx(bytes: Uint8Array): Sheet[] {
  let total = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (
          !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(
            f.name,
          )
        )
          return false
        total += f.originalSize
        if (total > MAX_UNZIPPED) throw new WorkbookError('This workbook is too large to read')
        return true
      },
    })
  } catch (err) {
    if (err instanceof WorkbookError) throw err
    throw new WorkbookError('This file looks like a workbook but could not be opened')
  }
  const read = (path: string) => {
    const f = files[path]
    return f ? (parser.parse(new TextDecoder().decode(f)) as Node) : undefined
  }

  const shared =
    ((read('xl/sharedStrings.xml')?.sst as Node | undefined)?.si as Node[] | undefined) ?? []
  const strings = shared.map(richText)

  const rels = (((read('xl/_rels/workbook.xml.rels')?.Relationships as Node | undefined)
    ?.Relationship as Node[]) ?? []) as Node[]
  const targets = new Map(rels.map((r) => [String(r.Id), String(r.Target)]))
  const book = read('xl/workbook.xml')?.workbook as Node | undefined
  const sheets = (((book?.sheets as Node | undefined)?.sheet as Node[]) ?? []) as Node[]

  const out: Sheet[] = []
  sheets.forEach((s, i) => {
    const target = targets.get(String(s['r:id'])) ?? `worksheets/sheet${i + 1}.xml`
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const ws = read(path)?.worksheet as Node | undefined
    const rowNodes = ((ws?.sheetData as Node | undefined)?.row as Node[] | undefined) ?? []
    const rows: string[][] = []
    for (const row of rowNodes) {
      const index = Number(row.r ?? rows.length + 1) - 1
      const cells: string[] = []
      ;((row.c as Node[] | undefined) ?? []).forEach((c, j) => {
        const col = typeof c.r === 'string' ? columnIndex(c.r) : j
        const raw = text(c.v)
        let value: string
        switch (c.t) {
          case 's':
            value = strings[Number(raw)] ?? ''
            break
          case 'inlineStr':
            value = richText(c.is as Node | undefined)
            break
          case 'b':
            value = raw === '1' ? 'TRUE' : 'FALSE'
            break
          default:
            value = raw
        }
        cells[col] = value
      })
      rows[index] = Array.from(cells, (v) => v ?? '')
    }
    out.push({ name: String(s.name ?? `Sheet ${i + 1}`), rows: Array.from(rows, (r) => r ?? []) })
  })
  return out
}
