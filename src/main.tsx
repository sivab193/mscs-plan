import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, FileUp, GraduationCap, Info, LayoutDashboard, LoaderCircle, Plus, Search, Trash2, X, Sun, Moon } from 'lucide-react'
import sectionsData from './data/sections.json'
import { coreCourses, courseAreas, gradePoints } from './data/requirements'
import './styles.css'

type Section = { id: string; term: string; courseCode: string; section: string; title: string; type: string; days: string; start: string; end: string; location: string; capacity: string; instructor: string; note: string }
type Planned = Section & { status: 'planned' | 'completed'; grade?: string; credits: number }
type TranscriptCourse = { key: string; courseCode: string; title: string; term: string; credits: number; grade: string; selected: boolean }
type PositionedText = { str: string; transform: number[] }
type PlanBackup = { version: 1; exportedAt: string; plan: Planned[]; track: 'non-thesis' | 'thesis'; term: string }
const sections = sectionsData as Section[]
const storageKey = 'mscs-planner:plan'
const terms = ['Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027']

function timeNumber(value: string) { const match = value.match(/(\d+):(\d+)([ap])/i); if (!match) return 0; let hour = +match[1]; if (match[3].toLowerCase() === 'p' && hour !== 12) hour += 12; if (match[3].toLowerCase() === 'a' && hour === 12) hour = 0; return hour * 60 + +match[2] }
function collide(a: Planned, b: Planned) { return a.term === b.term && a.days.split('').some(day => b.days.includes(day)) && timeNumber(a.start) < timeNumber(b.end) && timeNumber(b.start) < timeNumber(a.end) }
function initialPlan(): Planned[] { try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch { return [] } }
function compareCourseCode(a: { courseCode: string }, b: { courseCode: string }) { return a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true }) }
function semesterRank(term: string) { const match = term.match(/(Spring|Summer|Fall)\s+(\d{4})/i); if (!match) return 0; return Number(match[2]) * 10 + ({ spring: 1, summer: 2, fall: 3 }[match[1].toLowerCase()] ?? 0) }
function comparePlan(a: Planned, b: Planned) { return semesterRank(b.term) - semesterRank(a.term) || compareCourseCode(a, b) }

function transcriptCourses(text: string): TranscriptCourse[] {
  let activeTerm = 'Imported transcript'
  const found: TranscriptCourse[] = []
  for (const rawLine of text.replace(/\u00a0/g, ' ').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    const term = line.match(/\b(Fall|Spring|Summer)\s*(20\d{2})\b/i)
    if (term) activeTerm = `${term[1][0].toUpperCase()}${term[1].slice(1).toLowerCase()} ${term[2]}`
    const course = line.match(/\b([A-Z]{2,6})\s*-?\s*(\d{3,5}[A-Z]?)\b/)
    if (!course) continue
    const grade = line.match(/(?:^|\s)(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)(?:\s|$)/)?.[1] ?? ''
    const afterCode = line.slice((course.index ?? 0) + course[0].length).trim()
    const credits = Number(afterCode.match(/(?:A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\s+([0-9](?:\.\d+)?)/)?.[1] ?? afterCode.match(/\b([0-9](?:\.\d+)?)\s*(?:credits?|cr\.?)\b/i)?.[1] ?? afterCode.match(/\s([1-6](?:\.\d+)?)\s+(?:A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b/)?.[1] ?? afterCode.match(/\s([1-6](?:\.\d+)?)\s*$/)?.[1] ?? 3)
    const code = `${course[1].toUpperCase()} ${course[2]}`
    const catalogTitle = sections.find(section => section.courseCode === code)?.title
    const title = (catalogTitle ?? (afterCode.replace(/\b[0-9](?:\.\d+)?\s*(?:credits?|cr\.?)?\b/ig, '').replace(/\b(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b/g, '').replace(/\s+/g, ' ').trim() || 'Imported course')).slice(0, 120)
    if (!found.some(item => item.courseCode === code && item.term === activeTerm && item.grade === grade)) found.push({ key: `${code}-${activeTerm}-${found.length}`, courseCode: code, title, term: activeTerm, credits: Number.isFinite(credits) ? credits : 3, grade, selected: true })
  }
  return found.sort(compareCourseCode)
}

function pdfTranscriptText(items: PositionedText[]) {
  const rows = new Map<number, PositionedText[]>()
  for (const item of items) {
    if (!item.str.trim()) continue
    const y = Math.round(item.transform[5])
    rows.set(y, [...(rows.get(y) ?? []), item])
  }
  return [...rows.entries()].sort(([a], [b]) => b - a).map(([, row]) => {
    const ordered = row.sort((a, b) => a.transform[4] - b.transform[4])
    const subject = ordered.find(item => item.transform[4] < 55 && /^[A-Z]{2,6}$/.test(item.str.trim()))?.str.trim()
    const code = ordered.find(item => item.transform[4] < 130 && /^\d{3,5}[A-Z]?$/.test(item.str.trim()))?.str.trim()
    if (!subject || !code) return ordered.map(item => item.str).join(' ')
    const grade = ordered.find(item => /^(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)$/.test(item.str.trim()))
    const credit = ordered.find(item => item.transform[4] > (grade?.transform[4] ?? 330) && /^\d+(?:\.\d+)?$/.test(item.str.trim()))
    const titleStart = ordered.find(item => item.transform[4] >= 200 && item.transform[4] < (grade?.transform[4] ?? credit?.transform[4] ?? Infinity))
    const title = ordered.filter(item => item.transform[4] >= (titleStart?.transform[4] ?? Infinity) && item.transform[4] < (grade?.transform[4] ?? credit?.transform[4] ?? Infinity) && !/^(GR|UG)$/.test(item.str.trim())).map(item => item.str).join(' ')
    return `${subject} ${code} ${title} ${grade?.str ?? ''} ${credit?.str ?? ''}`.trim()
  }).join('\n')
}

async function readTranscript(file: File, setStatus: (message: string) => void) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Reading PDF locally…')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setStatus(`Reading PDF page ${pageNumber} of ${pdf.numPages} locally…`)
      const content = await (await pdf.getPage(pageNumber)).getTextContent()
      pages.push(pdfTranscriptText(content.items.filter(item => 'str' in item && 'transform' in item && typeof item.str === 'string' && Array.isArray(item.transform)) as unknown as PositionedText[]))
    }
    const text = pages.join('\n')
    if (text.trim().length > 30) return text
    if (pdf.numPages > 8) throw new Error('This scanned PDF has more than 8 pages. Upload the relevant transcript pages as images for faster local OCR.')
    const { recognize } = await import('tesseract.js')
    const ocrPages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setStatus(`Recognizing scanned PDF page ${pageNumber} of ${pdf.numPages} locally…`)
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      const canvasContext = canvas.getContext('2d')
      if (!canvasContext) throw new Error('Your browser cannot prepare this PDF page for local OCR.')
      await page.render({ canvas, canvasContext, viewport }).promise
      ocrPages.push((await recognize(canvas, 'eng')).data.text)
    }
    return ocrPages.join('\n')
  }
  if (!file.type.startsWith('image/')) throw new Error('Choose a PDF, PNG, JPG, or WEBP transcript file.')
  setStatus('Recognizing text in your image locally…')
  const { recognize } = await import('tesseract.js')
  const result = await recognize(file, 'eng')
  return result.data.text
}

function App() {
  const [view, setView] = useState<'dashboard' | 'catalog' | 'planner' | 'grades' | 'study' | 'import' | 'about'>('dashboard')
  const [term, setTerm] = useState('Fall 2026')
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState<Planned[]>(initialPlan)
  const [track, setTrack] = useState<'non-thesis' | 'thesis'>('non-thesis')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('mscs-theme') as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(plan)), [plan])
  useEffect(() => { localStorage.setItem('mscs-theme', theme); document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])
  const offerings = useMemo(() => {
    const source = sections.some(section => section.term === term) ? sections.filter(section => section.term === term) : [...new Map(sections.map(section => [`${section.courseCode}-${section.title}`, section])).values()].map(section => ({ ...section, id: `${term}-${section.courseCode}-${section.title}`, term, section: 'Schedule TBA', type: 'Planning catalog', days: '', start: '', end: '', location: '', instructor: '' }))
    return source.filter(section => `${section.courseCode} ${section.title} ${section.instructor}`.toLowerCase().includes(query.toLowerCase())).sort(compareCourseCode)
  }, [term, query])
  const graded = plan.filter(p => p.grade && gradePoints[p.grade] !== undefined)
  const gradedCredits = graded.reduce((total, p) => total + p.credits, 0)
  const gpa = gradedCredits ? graded.reduce((total, p) => total + gradePoints[p.grade!] * p.credits, 0) / gradedCredits : 0
  const uniquePlanCourses = [...new Set(plan.map(p => p.courseCode))]
  const coreMet = coreCourses.filter(c => c.alternatives.some(code => uniquePlanCourses.includes(code))).length
  const target = track === 'non-thesis' ? 30 : 24
  const degreeCredits = plan.filter(p => p.courseCode !== 'CS 69800').reduce((sum, p) => sum + p.credits, 0)
  const add = (section: Section) => { if (plan.some(p => p.term === term && p.courseCode === section.courseCode && p.title === section.title)) return; setPlan([...plan, { ...section, id: `plan-${term}-${section.courseCode}-${section.title}`, term, status: 'planned', credits: 3 }]) }
  const remove = (id: string) => setPlan(plan.filter(p => p.id !== id))
  const update = (id: string, change: Partial<Planned>) => setPlan(plan.map(p => p.id === id ? { ...p, ...change } : p))
  const importCourses = (courses: TranscriptCourse[]) => setPlan(current => [...current, ...courses.filter(course => !current.some(item => item.courseCode === course.courseCode && item.term === course.term && item.grade === course.grade)).map(course => { const catalogMatch = sections.find(s => s.courseCode === course.courseCode && s.term === course.term && s.days && s.start && s.end && (!s.type || s.type.toLowerCase().includes('lecture'))) || sections.find(s => s.courseCode === course.courseCode && s.term === course.term); return { id: `transcript-${crypto.randomUUID()}`, term: course.term, courseCode: course.courseCode, section: catalogMatch?.section || 'Transcript import', title: course.title, type: catalogMatch?.type || 'Completed course', days: catalogMatch?.days || '', start: catalogMatch?.start || '', end: catalogMatch?.end || '', location: catalogMatch?.location || '', capacity: catalogMatch?.capacity || '', instructor: catalogMatch?.instructor || '', note: 'Imported locally from transcript', status: (course.grade ? 'completed' : 'planned') as Planned['status'], grade: course.grade || undefined, credits: course.credits } })])
  const restoreBackup = (backup: PlanBackup) => { setPlan(backup.plan); setTrack(backup.track); setTerm(backup.term) }
  const conflicts = plan.flatMap((p, i) => plan.slice(i + 1).filter(other => collide(p, other)).map(other => `${p.courseCode} and ${other.courseCode}`))

  return <div className="app-shell">
    <aside><div className="brand"><GraduationCap size={25}/><span>MSCS<span>plan</span></span></div><p className="school">PURDUE UNIVERSITY</p>
      {([['dashboard','Dashboard',LayoutDashboard],['catalog','Course catalog',Search],['planner','Semester planner',CalendarDays],['grades','Grades & GPA',BookOpen],['study','Plan of study',ClipboardList],['import','Import transcript',FileUp],['about','About',Info]] as const).map(([id,label,Icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'nav active' : 'nav'}><Icon size={18}/>{label}</button>)}
      <div className="sidebar-footer"><span className="avatar">S</span><div><b>Student</b><small>Local workspace</small></div><button className="icon" style={{marginLeft: 'auto'}} onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button></div>
    </aside>
    <main><header><div><p className="eyebrow">MASTER OF SCIENCE · COMPUTER SCIENCE</p><h1>{view === 'dashboard' ? 'Your degree, in focus.' : view === 'catalog' ? 'Find a course' : view === 'planner' ? 'Build your semester' : view === 'grades' ? 'Grades & GPA' : view === 'study' ? 'Plan of study' : view === 'import' ? 'Import your transcript' : 'About MSCSplan'}</h1></div>{view !== 'about' && <select value={track} onChange={e => setTrack(e.target.value as typeof track)}><option value="non-thesis">Non-thesis track</option><option value="thesis">Thesis track</option></select>}</header>
      {view === 'dashboard' && <Dashboard track={track} plan={plan} coreMet={coreMet} degreeCredits={degreeCredits} target={target} gpa={gpa} conflicts={conflicts} setView={setView}/>} 
      {view === 'catalog' && <><div className="toolbar"><select value={term} onChange={e => setTerm(e.target.value)}>{terms.map(t => <option key={t}>{t}</option>)}</select><label className="search"><Search size={18}/><input autoFocus placeholder="Search code, title, or instructor" value={query} onChange={e => setQuery(e.target.value)}/></label></div><p className="result-count">{term === 'Spring 2027' ? `${offerings.length} known courses available for planning · schedule TBA` : `${offerings.length} scheduled courses · CS 50000 and above`}</p><div className="course-grid">{offerings.map(s => <CourseCard key={s.id} section={s} added={plan.some(p => p.term === term && p.courseCode === s.courseCode && p.title === s.title)} add={add}/>)}</div></>}
      {view === 'planner' && <><div className="toolbar"><select value={term} onChange={e => setTerm(e.target.value)}>{terms.map(t => <option key={t}>{t}</option>)}</select><button className="primary" onClick={() => setView('catalog')}><Plus size={17}/> Add sections</button></div>{conflicts.length > 0 && <div className="alert">Schedule conflict detected: {conflicts.join('; ')}.</div>}<Timetable plan={plan.filter(p => p.term === term)} /><div className="plan-list">{plan.filter(p => p.term === term).sort(compareCourseCode).map(p => <PlanRow key={p.id} section={p} remove={remove} update={update}/>) || null}{!plan.some(p => p.term === term) && <Empty text="No sections in this term yet. Add a course from the catalog."/>}</div></>}
      {view === 'grades' && <><div className="stat-row"><Stat label="Projected GPA" value={gradedCredits ? gpa.toFixed(2) : '—'} caption={`${gradedCredits} credits with entered grades`}/><Stat label="Degree-plan GPA" value={gradedCredits ? gpa.toFixed(2) : '—'} caption="Includes planned-course estimates"/><Stat label="Minimum required" value="3.00" caption="Purdue MS CS plan of study"/></div><p className="result-count">Enter an estimated grade for any planned course to see its effect. Semesters are newest first.</p><div className="plan-list">{plan.length ? [...plan].sort(comparePlan).map(p => <PlanRow key={p.id} section={p} remove={remove} update={update} grades/>) : <Empty text="Add courses to your plan, then record a grade here."/>}</div></>}
      {view === 'study' && <PlanOfStudy plan={plan} coreMet={coreMet} degreeCredits={degreeCredits} target={target} remove={remove} update={update}/>}
      {view === 'import' && <><TranscriptImporter onImport={importCourses}/><BackupPanel plan={plan} track={track} term={term} onRestore={restoreBackup}/></>}
      {view === 'about' && <About />}
    </main>
  </div>
}

function Dashboard({ track, plan, coreMet, degreeCredits, target, gpa, conflicts, setView }: { track: string; plan: Planned[]; coreMet: number; degreeCredits: number; target: number; gpa: number; conflicts: string[]; setView: (v: 'catalog') => void }) { const percent = Math.min(100, Math.round(degreeCredits / target * 100)); return <><section className="hero"><div><p>WELCOME BACK</p><h2>{degreeCredits} of {target} degree credits planned</h2><div className="progress"><i style={{width: `${percent}%`}}/></div><small>{percent}% of the {track} course-credit target</small></div><button className="light" onClick={() => setView('catalog')}><Plus size={17}/> Explore courses</button></section><div className="stat-row"><Stat label="Core areas" value={`${coreMet}/3`} caption="Systems I · Systems II · Algorithms"/><Stat label="Plan GPA" value={gpa ? gpa.toFixed(2) : '—'} caption="3.00 minimum required"/><Stat label="Courses planned" value={String(new Set(plan.map(p => p.courseCode)).size)} caption="Across all saved terms"/></div><section className="requirements"><div className="section-heading"><div><p className="eyebrow">DEGREE PROGRESS</p><h2>Required foundations</h2></div><span>{coreMet}/3 complete</span></div>{coreCourses.map(rule => { const chosen = plan.find(p => rule.alternatives.includes(p.courseCode)); return <div className="requirement" key={rule.key}><CheckCircle2 size={20} className={chosen ? 'done' : ''}/><div><b>{rule.label}</b><small>{rule.alternatives.join(' or ')}</small></div><em>{chosen ? chosen.courseCode : 'Not planned'}</em></div>})}</section>{conflicts.length > 0 && <div className="alert">{conflicts.length} timetable conflict{conflicts.length > 1 ? 's' : ''} need attention.</div>}<Timetables plan={plan}/></> }
function CourseCard({ section, added, add }: { section: Section; added: boolean; add: (s: Section) => void }) { return <article className="course-card"><div><span className="pill">{courseAreas[section.courseCode] ?? 'Graduate elective'}</span><h3>{section.courseCode}</h3><h2>{section.title}</h2></div><div className="details"><span>{section.section} · {section.type}</span><span>{section.days || 'Arranged'} · {section.start || 'TBA'}–{section.end || 'TBA'}</span><span>{section.instructor || 'Instructor TBA'} · {section.location || 'TBA'}</span></div><button disabled={added} className={added ? 'added' : 'primary'} onClick={() => add(section)}>{added ? 'In your plan' : <><Plus size={16}/> Add to plan</>}</button></article> }
function PlanRow({ section, remove, update, grades = false }: { section: Planned; remove: (id: string) => void; update: (id: string, c: Partial<Planned>) => void; grades?: boolean }) { return <article className="plan-row"><div><b>{section.courseCode}</b><span>{section.title}</span><small>{section.term} · {section.section} · {section.days || 'Arranged'} {section.start && `· ${section.start}–${section.end}`}</small></div>{grades && <><select value={section.status} onChange={e => update(section.id, {status: e.target.value as Planned['status']})}><option value="planned">Planned</option><option value="completed">Completed</option></select><select value={section.grade ?? ''} onChange={e => update(section.id, {grade: e.target.value || undefined})}><option value="">Estimate grade</option>{Object.keys(gradePoints).map(g => <option key={g}>{g}</option>)}</select></>}<button className="icon" aria-label="Remove course" onClick={() => remove(section.id)}><Trash2 size={17}/></button></article> }
function PlanOfStudy({ plan, coreMet, degreeCredits, target, remove, update }: { plan: Planned[]; coreMet: number; degreeCredits: number; target: number; remove: (id: string) => void; update: (id: string, c: Partial<Planned>) => void }) { const remainingCredits = Math.max(0, target - degreeCredits); return <><div className="stat-row"><Stat label="Required foundations" value={`${coreMet}/3`} caption={`${3 - coreMet} area${3 - coreMet === 1 ? '' : 's'} remaining`}/><Stat label="Degree credits" value={`${degreeCredits}/${target}`} caption={remainingCredits ? `${remainingCredits} more credits needed` : 'Credit target met'}/><Stat label="Courses in plan" value={String(new Set(plan.map(course => course.courseCode)).size)} caption="Remove courses from this view"/></div><section className="requirements"><div className="section-heading"><div><p className="eyebrow">REQUIREMENTS TO COMPLETE</p><h2>Required foundations</h2></div><span>{coreMet}/3 fulfilled</span></div>{coreCourses.map(rule => { const chosen = plan.find(course => rule.alternatives.includes(course.courseCode)); return <div className="requirement" key={rule.key}><CheckCircle2 size={20} className={chosen ? 'done' : ''}/><div><b>{rule.label}</b><small>{chosen ? `${chosen.courseCode} is in your plan` : `Take ${rule.alternatives.join(' or ')}`}</small></div><em>{chosen ? 'Planned' : 'Still required'}</em></div>})}<div className="requirement"><CheckCircle2 size={20} className={remainingCredits === 0 ? 'done' : ''}/><div><b>Graduate elective credits</b><small>{remainingCredits ? `Add ${remainingCredits} eligible graduate credits after foundations.` : 'Your planned credits meet the target.'}</small></div><em>{remainingCredits ? `${remainingCredits} needed` : 'Met'}</em></div></section><section className="study-courses"><div className="section-heading"><div><p className="eyebrow">YOUR SELECTED COURSES</p><h2>Edit your plan</h2></div><span>Newest semester first</span></div><div className="plan-list">{plan.length ? [...plan].sort(comparePlan).map(course => <PlanRow key={course.id} section={course} remove={remove} update={update}/>) : <Empty text="Select courses from the catalog to build your plan of study."/>}</div></section><Timetables plan={plan}/></> }
function TranscriptImporter({ onImport }: { onImport: (courses: TranscriptCourse[]) => void }) {
  const [courses, setCourses] = useState<TranscriptCourse[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(''); setCourses([])
    try {
      const parsed = transcriptCourses(await readTranscript(file, setStatus))
      if (!parsed.length) throw new Error('No course codes were found. Try a sharper image or edit a transcript page with clear course rows.')
      setCourses(parsed); setStatus(`${parsed.length} course${parsed.length === 1 ? '' : 's'} found — review before saving.`)
    } catch (reason) { setStatus(''); setError(reason instanceof Error ? reason.message : 'Could not read that transcript.') }
  }
  const edit = (key: string, change: Partial<TranscriptCourse>) => setCourses(items => items.map(item => item.key === key ? { ...item, ...change } : item))
  const save = () => { const selected = courses.filter(course => course.selected); onImport(selected); setCourses([]); setStatus(`${selected.length} course${selected.length === 1 ? '' : 's'} added to your local plan.`) }
  return <section className="transcript-import"><div className="transcript-heading"><div><p className="eyebrow">PRIVATE TRANSCRIPT IMPORT</p><h2>Bring in completed semesters</h2><p>PDF text extraction and image OCR happen in this browser only. Your transcript file is never uploaded.</p></div><label className="primary file-button"><FileUp size={17}/>{status.includes('locally') ? <><LoaderCircle className="spin" size={17}/> Working…</> : 'Choose transcript'}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={chooseFile}/></label></div>{error && <div className="alert">{error}</div>}{status && <p className="import-status">{status}</p>}{courses.length > 0 && <><div className="review-heading"><b>Review detected courses</b><button className="icon" onClick={() => setCourses([])} aria-label="Clear transcript review"><X size={17}/></button></div><div className="transcript-review">{courses.map(course => <div className="transcript-row" key={course.key}><input aria-label={`Include ${course.courseCode}`} type="checkbox" checked={course.selected} onChange={e => edit(course.key, { selected: e.target.checked })}/><input aria-label="Course code" value={course.courseCode} onChange={e => edit(course.key, { courseCode: e.target.value.toUpperCase() })}/><input aria-label="Course title" value={course.title} onChange={e => edit(course.key, { title: e.target.value })}/><input aria-label="Term" value={course.term} onChange={e => edit(course.key, { term: e.target.value })}/><input aria-label="Credits" type="number" min="0" max="12" step="0.5" value={course.credits} onChange={e => edit(course.key, { credits: Number(e.target.value) })}/><select aria-label="Grade" value={course.grade} onChange={e => edit(course.key, { grade: e.target.value })}><option value="">No grade</option>{Object.keys(gradePoints).map(grade => <option key={grade}>{grade}</option>)}</select></div>)}</div><button className="primary" onClick={save} disabled={!courses.some(course => course.selected)}><CheckCircle2 size={17}/> Add selected courses</button></>}</section> }
function BackupPanel({ plan, track, term, onRestore }: { plan: Planned[]; track: 'non-thesis' | 'thesis'; term: string; onRestore: (backup: PlanBackup) => void }) {
  const [message, setMessage] = useState('')
  const exportBackup = () => {
    const backup: PlanBackup = { version: 1, exportedAt: new Date().toISOString(), plan, track, term }
    const href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/x-mscs-plan+json' }))
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = `mscs-plan-${new Date().toISOString().slice(0, 10)}.mscs`; anchor.click()
    URL.revokeObjectURL(href); setMessage('Backup downloaded. Keep the .mscs file somewhere safe.')
  }
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    try {
      const backup = JSON.parse(await file.text()) as Partial<PlanBackup>
      if (backup.version !== 1 || !Array.isArray(backup.plan) || (backup.track !== 'thesis' && backup.track !== 'non-thesis') || typeof backup.term !== 'string') throw new Error('That is not a valid MSCSplan backup file.')
      onRestore(backup as PlanBackup); setMessage(`Restored ${backup.plan.length} saved course${backup.plan.length === 1 ? '' : 's'} from your backup.`)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not read that backup file.') }
  }
  return <section className="transcript-import backup-panel"><div className="transcript-heading"><div><p className="eyebrow">LOCAL BACKUP</p><h2>Save or restore your plan</h2><p>Export every saved course, grade, term, and track setting to a portable <code>.mscs</code> file. It stays on your device unless you choose to share it.</p></div><div className="backup-actions"><button className="primary" onClick={exportBackup}><FileUp size={17}/> Export .mscs</button><label className="light file-button"><FileUp size={17}/> Import .mscs<input type="file" accept=".mscs,application/json" onChange={importBackup}/></label></div></div>{message && <p className="import-status">{message}</p>}</section> }
function Stat({label,value,caption}:{label:string;value:string;caption:string}) { return <article className="stat"><p>{label}</p><strong>{value}</strong><small>{caption}</small></article> }
function Empty({text}:{text:string}) { return <div className="empty"><BookOpen size={28}/><p>{text}</p></div> }
function About() { return <section className="about"><div className="hero"><div><p>UNOFFICIAL STUDENT TOOL</p><h2>Make your MS CS plan easier to see.</h2><small>MSCSplan helps Purdue students explore graduate sections, assemble a timetable, and keep an eye on degree progress.</small></div></div><div className="about-grid"><article><h2>What it includes</h2><p>Term-specific CS 50000+ sections, schedule-conflict checks, thesis and non-thesis progress, and a credit-weighted GPA calculator.</p></article><article><h2>Your data stays local</h2><p>This static release has no accounts or backend. Your course plan and grades are stored only in this browser via local storage.</p></article><article><h2>Use it carefully</h2><p>This does not replace official registration or academic advising. Confirm course eligibility and degree requirements with Purdue CS before submitting your plan of study.</p></article></div><p className="source-note">Degree requirements are based on Purdue CS's Master's Program curriculum. Course schedules are imported from supplied Purdue schedule exports.</p></section> }
function Timetable({ plan }: { plan: Planned[] }) {
  if (plan.length === 0) return null
  const enrichedPlan = plan.map(p => {
    if (!p.days && !p.start) {
      const match = sections.find(s => s.courseCode === p.courseCode && s.term === p.term && s.days && s.start && s.end && (!s.type || s.type.toLowerCase().includes('lecture')))
      if (match) return { ...p, days: match.days, start: match.start, end: match.end, type: match.type, location: match.location }
    }
    return p
  })
  const timed = enrichedPlan.filter(s => s.days && s.start && s.end && (!s.type || s.type.toLowerCase().includes('lecture')))
  const untimed = enrichedPlan.filter(s => !timed.includes(s))
  const days = [{ id: 'M', name: 'Mon' }, { id: 'T', name: 'Tue' }, { id: 'W', name: 'Wed' }, { id: 'R', name: 'Thu' }, { id: 'F', name: 'Fri' }]
  const minTime = 7 * 60; const maxTime = 21 * 60; const hourHeight = 50
  return <div className="timetable-wrapper">
    <div className="timetable" style={{ borderRadius: untimed.length > 0 ? '11px 11px 0 0' : '11px', borderBottom: untimed.length > 0 ? 'none' : undefined }}>
      <div className="timetable-times">
        {[...Array(15)].map((_, i) => <div key={i} className="time-label" style={{ height: hourHeight }}>{7 + i > 12 ? 7 + i - 12 : 7 + i}{7 + i >= 12 ? 'pm' : 'am'}</div>)}
      </div>
      {days.map(day => (
        <div key={day.id} className="timetable-day">
          <div className="day-name">{day.name}</div>
          <div className="day-events" style={{ height: (maxTime - minTime) / 60 * hourHeight }}>
            {timed.filter(s => s.days.includes(day.id)).map(s => {
              const startMins = timeNumber(s.start); const endMins = timeNumber(s.end)
              return <div key={`${s.id}-${day.id}`} className="timetable-event" style={{ top: `${(startMins - minTime) / 60 * hourHeight}px`, height: `${(endMins - startMins) / 60 * hourHeight}px` }} title={`${s.courseCode}: ${s.title}\n${s.start} - ${s.end}\n${s.location}`}>
                <strong>{s.courseCode}</strong>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                <span>{s.start} - {s.end}</span>
              </div>
            })}
          </div>
        </div>
      ))}
    </div>
    {untimed.length > 0 && <div className="timetable-untimed">
      <strong>Arranged / Online / Non-lecture:</strong>
      {untimed.map(s => <span key={s.id} className="untimed-pill" title={s.title}>{s.courseCode}</span>)}
    </div>}
  </div>
}

function Timetables({ plan }: { plan: Planned[] }) {
  const presentTerms = [...new Set(plan.map(p => p.term))].sort((a, b) => semesterRank(b) - semesterRank(a))
  if (presentTerms.length === 0) return null
  return <div className="timetables-container">
    <h2 className="timetables-header">Semester Timetables</h2>
    {presentTerms.map(term => (
      <div key={term}>
        <h3 style={{fontFamily: 'Fraunces, serif', fontSize: '16px', marginBottom: '12px', color: '#4f624d'}}>{term}</h3>
        <Timetable plan={plan.filter(p => p.term === term)} />
      </div>
    ))}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
