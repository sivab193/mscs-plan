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
  // The exports contain a row for every meeting date. Remove date occurrences first.
  const scheduledSections: CsvRow[] = [...new Map<string, CsvRow>(sections.map(section => [
    [section.term, section.courseCode, section.section, section.title, section.type, section.days, section.start, section.end, section.location, section.instructor].join('\u001f'),
    section,
  ])).values()]
  // A lecture, PSO, or lab is a component of one course—not a separate catalog card.
  // Keep distinct special topics when they have different titles under the same code.
  const courseGroups = new Map<string, CsvRow[]>()
  for (const section of scheduledSections) {
    const key = [section.term, section.courseCode, section.title].join('\u001f')
    courseGroups.set(key, [...(courseGroups.get(key) ?? []), section])
  }
  const uniqueSections: CsvRow[] = [...courseGroups.values()].map((components): CsvRow => {
    const primary = [...components].sort((a, b) => Number(!/lecture/i.test(a.type)) - Number(!/lecture/i.test(b.type)))[0]
    const componentTypes = [...new Set(components.map(component => component.type).filter(Boolean))]
    return { ...primary, id: `${primary.term}-${primary.courseCode}-${primary.title}`, note: components.length > 1 ? `${primary.note}${primary.note ? ' · ' : ''}Includes ${components.length} course components (${componentTypes.join(', ')})` : primary.note }
  }).sort((a, b) => a.term.localeCompare(b.term) || a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true }) || a.title.localeCompare(b.title))
  await mkdir(resolve('src/data'), { recursive: true })
  await writeFile(resolve('src/data/sections.json'), JSON.stringify(uniqueSections, null, 2) + '\n')
  console.log(`Imported ${uniqueSections.length} distinct MS-level CS sections across ${new Set(uniqueSections.map(s => s.term)).size} terms.`)
}
main()
