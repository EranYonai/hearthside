import { parseCsv } from './csv'
import { parseHtmlTables } from './html'
import { WorkbookError, readXlsx } from './xlsx'

export interface Sheet {
  name: string
  rows: string[][]
}

export class ImportFormatError extends Error {}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    // Older exports are often Windows Hebrew.
    return new TextDecoder('windows-1255').decode(bytes)
  }
}

/** Read an uploaded spreadsheet (.xlsx, .csv, or an HTML table saved as .xls) into sheets. */
export function readTable(bytes: Uint8Array, fileName = ''): Sheet[] {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      return readXlsx(bytes)
    } catch (err) {
      if (err instanceof WorkbookError) throw new ImportFormatError(err.message)
      throw err
    }
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ImportFormatError(
      'This is an old-style Excel file. Open it and save it as .xlsx or .csv, then upload that.',
    )
  }
  const text = decodeText(bytes)
  if (/^\s*</.test(text) && /<table/i.test(text)) {
    return [{ name: fileName || 'Table', rows: parseHtmlTables(text) }]
  }
  if (text.includes('\u0000')) throw new ImportFormatError('This file type is not supported')
  return [{ name: fileName || 'Sheet', rows: parseCsv(text) }]
}

/** Like readTable, and also reads text PDFs (statements without a spreadsheet export). */
export async function readStatementFile(bytes: Uint8Array, fileName = ''): Promise<Sheet[]> {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    const { readPdf } = await import('./pdf')
    try {
      const sheets = await readPdf(bytes, fileName || 'PDF')
      return sheets
    } catch {
      throw new ImportFormatError('This PDF could not be read. Is it password-protected?')
    }
  }
  return readTable(bytes, fileName)
}
