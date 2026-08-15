import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

type CsvRow = Record<string, string>

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]; const next = text[i + 1]
    if (char === '"' && quoted && next === '"') { value += '"'; i++; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (char === ',' && !quoted) { row.push(value); value = ''; continue }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ''; continue
    }
    value += char
  }
  row.push(value); if (row.some(Boolean)) rows.push(row)
  return rows
}

function termFor(date: string, fallback: string) {
  const [, month, , year] = date.match(/(\d{2})\/(\d{2})\/(\d{4})/) ?? []
  if (!year) return fallback
  const season = Number(month) <= 5 ? 'Spring' : 'Fall'
  return `${season} ${year}`
}

async function main() {
  const files = ['events.csv', 'events_2.csv', 'events_3.csv']
  const sections: Record<string, string>[] = []
  for (const file of files) {
    const records = parseCsv(await readFile(resolve(file), 'utf8').catch(() => ''))
    const [headers, ...rows] = records
    if (!headers) continue
    for (const cells of rows) {
      const row = Object.fromEntries(headers.map((header, i) => [header.trim(), (cells[i] ?? '').trim()])) as CsvRow
      const codes = [...row.Name.matchAll(/\bCS\s*(\d{5})\b/g)].map((match) => `CS ${match[1]}`)
      const courseCode = codes.find((code) => Number(code.slice(3)) >= 50000)
      if (!courseCode) continue
      const title = row.Title.replace(/\s+/g, ' ').trim() || courseCode
      const fallbackTerms: Record<string, string> = { 'events.csv': 'Fall 2026', 'events_2.csv': 'Spring 2026', 'events_3.csv': 'Fall 2025' }
      const term = termFor(row['First Date'], fallbackTerms[file])
      sections.push({ id: `${term}-${courseCode}-${row.Section}-${row['First Date']}-${row['Published Start']}`,
        term, courseCode, section: row.Section.replace(/\s+/g, ' '), title, type: row.Type,
        days: row['Day Of Week'], start: row['Published Start'], end: row['Published End'],
        location: row.Location, capacity: row.Capacity, instructor: row['Instructor / Organization'],
        note: row.Note.replace(/\s+/g, ' '), firstDate: row['First Date'], lastDate: row['Last Date'], source: basename(file) })
    }
  }
  await mkdir(resolve('src/data'), { recursive: true })
  await writeFile(resolve('src/data/sections.json'), JSON.stringify(sections, null, 2) + '\n')
  console.log(`Imported ${sections.length} MS-level CS meeting records across ${new Set(sections.map(s => s.term)).size} terms.`)
}
main()
