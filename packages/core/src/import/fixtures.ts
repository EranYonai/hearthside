import { strToU8, zipSync } from 'fflate'

/** Test helper: build a minimal .xlsx from rows (strings shared, numbers inline). */
export function makeXlsx(sheets: Record<string, (string | number)[][]>): Uint8Array {
  const strings: string[] = []
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const col = (i: number) => {
    let s = ''
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    return s
  }
  const files: Record<string, Uint8Array> = {}
  const names = Object.keys(sheets)
  names.forEach((name, si) => {
    const rows = sheets[name]!.map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === '') return ''
          const ref = `${col(c)}${r + 1}`
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
          strings.push(v)
          return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    }).join('')
    files[`xl/worksheets/sheet${si + 1}.xml`] = strToU8(
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    )
  })
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  )
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0"?><Relationships>${names
      .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
  )
  files['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0"?><sst>${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`,
  )
  files['[Content_Types].xml'] = strToU8('<Types/>')
  return zipSync(files)
}

export interface PdfText {
  x: number
  y: number
  text: string
}

/** Test helper: a minimal text PDF (Helvetica, A4) with words at given positions. */
export function makePdf(pages: PdfText[][]): Uint8Array {
  const objects: string[] = []
  const add = (body: string) => objects.push(body) // object number = index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages, filled below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const kids: number[] = []
  for (const words of pages) {
    const stream = words
      .map((w) => `BT /F1 9 Tf ${w.x} ${w.y} Td (${w.text.replace(/([()\\])/g, '\\$1')}) Tj ET`)
      .join('\n')
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    const content = objects.length
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`,
    )
    kids.push(objects.length)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
