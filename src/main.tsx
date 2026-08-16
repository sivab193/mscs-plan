import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, CalendarDays, CheckCircle2, FileUp, GraduationCap, Info, LayoutDashboard, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react'
import sectionsData from './data/sections.json'
import { coreCourses, courseAreas, gradePoints } from './data/requirements'
import './styles.css'

type Section = { id: string; term: string; courseCode: string; section: string; title: string; type: string; days: string; start: string; end: string; location: string; capacity: string; instructor: string; note: string }
type Planned = Section & { status: 'planned' | 'completed'; grade?: string; credits: number }
type TranscriptCourse = { key: string; courseCode: string; title: string; term: string; credits: number; grade: string; selected: boolean }
const sections = sectionsData as Section[]
const storageKey = 'mscs-planner:plan'
const terms = ['Fall 2025', 'Spring 2026', 'Fall 2026']

function timeNumber(value: string) { const match = value.match(/(\d+):(\d+)([ap])/i); if (!match) return 0; let hour = +match[1]; if (match[3].toLowerCase() === 'p' && hour !== 12) hour += 12; if (match[3].toLowerCase() === 'a' && hour === 12) hour = 0; return hour * 60 + +match[2] }
function collide(a: Planned, b: Planned) { return a.term === b.term && a.days.split('').some(day => b.days.includes(day)) && timeNumber(a.start) < timeNumber(b.end) && timeNumber(b.start) < timeNumber(a.end) }
function initialPlan(): Planned[] { try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch { return [] } }

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
    const credits = Number(afterCode.match(/\b([0-9](?:\.\d+)?)\s*(?:credits?|cr\.?)\b/i)?.[1] ?? afterCode.match(/\s([1-6](?:\.\d+)?)\s+(?:A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b/)?.[1] ?? 3)
    const code = `${course[1].toUpperCase()} ${course[2]}`
    const catalogTitle = sections.find(section => section.courseCode === code)?.title
    const title = (catalogTitle ?? (afterCode.replace(/\b[0-9](?:\.\d+)?\s*(?:credits?|cr\.?)?\b/ig, '').replace(/\b(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)\b/g, '').replace(/\s+/g, ' ').trim() || 'Imported course')).slice(0, 120)
    if (!found.some(item => item.courseCode === code && item.term === activeTerm && item.grade === grade)) found.push({ key: `${code}-${activeTerm}-${found.length}`, courseCode: code, title, term: activeTerm, credits: Number.isFinite(credits) ? credits : 3, grade, selected: true })
  }
  return found
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
      pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '))
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
  const [view, setView] = useState<'dashboard' | 'catalog' | 'planner' | 'grades' | 'import' | 'about'>('dashboard')
  const [term, setTerm] = useState('Fall 2026')
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState<Planned[]>(initialPlan)
  const [track, setTrack] = useState<'non-thesis' | 'thesis'>('non-thesis')
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(plan)), [plan])
  const offerings = useMemo(() => sections.filter(s => s.term === term && `${s.courseCode} ${s.title} ${s.instructor}`.toLowerCase().includes(query.toLowerCase())), [term, query])
  const completed = plan.filter(p => p.status === 'completed' && p.grade && gradePoints[p.grade] !== undefined)
  const gradedCredits = completed.reduce((total, p) => total + p.credits, 0)
  const gpa = gradedCredits ? completed.reduce((total, p) => total + gradePoints[p.grade!] * p.credits, 0) / gradedCredits : 0
  const uniquePlanCourses = [...new Set(plan.map(p => p.courseCode))]
  const coreMet = coreCourses.filter(c => c.alternatives.some(code => uniquePlanCourses.includes(code))).length
  const target = track === 'non-thesis' ? 30 : 24
  const degreeCredits = plan.filter(p => p.courseCode !== 'CS 69800').reduce((sum, p) => sum + p.credits, 0)
  const add = (section: Section) => { if (plan.some(p => p.id === section.id)) return; setPlan([...plan, { ...section, status: 'planned', credits: 3 }]) }
  const remove = (id: string) => setPlan(plan.filter(p => p.id !== id))
  const update = (id: string, change: Partial<Planned>) => setPlan(plan.map(p => p.id === id ? { ...p, ...change } : p))
  const importCourses = (courses: TranscriptCourse[]) => setPlan(current => [...current, ...courses.filter(course => !current.some(item => item.courseCode === course.courseCode && item.term === course.term && item.grade === course.grade)).map(course => ({ id: `transcript-${crypto.randomUUID()}`, term: course.term, courseCode: course.courseCode, section: 'Transcript import', title: course.title, type: 'Completed course', days: '', start: '', end: '', location: '', capacity: '', instructor: '', note: 'Imported locally from transcript', status: (course.grade ? 'completed' : 'planned') as Planned['status'], grade: course.grade || undefined, credits: course.credits }))])
  const conflicts = plan.flatMap((p, i) => plan.slice(i + 1).filter(other => collide(p, other)).map(other => `${p.courseCode} and ${other.courseCode}`))

  return <div className="app-shell">
    <aside><div className="brand"><GraduationCap size={25}/><span>MSCS<span>plan</span></span></div><p className="school">PURDUE UNIVERSITY</p>
      {([['dashboard','Dashboard',LayoutDashboard],['catalog','Course catalog',Search],['planner','Semester planner',CalendarDays],['grades','Grades & GPA',BookOpen],['import','Import transcript',FileUp],['about','About',Info]] as const).map(([id,label,Icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'nav active' : 'nav'}><Icon size={18}/>{label}</button>)}
      <div className="sidebar-footer"><span className="avatar">S</span><div><b>Student</b><small>Local workspace</small></div></div>
    </aside>
    <main><header><div><p className="eyebrow">MASTER OF SCIENCE · COMPUTER SCIENCE</p><h1>{view === 'dashboard' ? 'Your degree, in focus.' : view === 'catalog' ? 'Find a course' : view === 'planner' ? 'Build your semester' : view === 'grades' ? 'Grades & GPA' : view === 'import' ? 'Import your transcript' : 'About MSCSplan'}</h1></div>{view !== 'about' && <select value={track} onChange={e => setTrack(e.target.value as typeof track)}><option value="non-thesis">Non-thesis track</option><option value="thesis">Thesis track</option></select>}</header>
      {view === 'dashboard' && <Dashboard track={track} plan={plan} coreMet={coreMet} degreeCredits={degreeCredits} target={target} gpa={gpa} conflicts={conflicts} setView={setView}/>} 
      {view === 'catalog' && <><div className="toolbar"><select value={term} onChange={e => setTerm(e.target.value)}>{terms.map(t => <option key={t}>{t}</option>)}</select><label className="search"><Search size={18}/><input autoFocus placeholder="Search code, title, or instructor" value={query} onChange={e => setQuery(e.target.value)}/></label></div><p className="result-count">{offerings.length} scheduled meetings · CS 50000 and above</p><div className="course-grid">{offerings.map(s => <CourseCard key={s.id} section={s} added={plan.some(p => p.id === s.id)} add={add}/>)}</div></>}
      {view === 'planner' && <><div className="toolbar"><select value={term} onChange={e => setTerm(e.target.value)}>{terms.map(t => <option key={t}>{t}</option>)}</select><button className="primary" onClick={() => setView('catalog')}><Plus size={17}/> Add sections</button></div>{conflicts.length > 0 && <div className="alert">Schedule conflict detected: {conflicts.join('; ')}.</div>}<div className="plan-list">{plan.filter(p => p.term === term).map(p => <PlanRow key={p.id} section={p} remove={remove} update={update}/>) || null}{!plan.some(p => p.term === term) && <Empty text="No sections in this term yet. Add a course from the catalog."/>}</div></>}
      {view === 'grades' && <><div className="stat-row"><Stat label="Cumulative GPA" value={gradedCredits ? gpa.toFixed(2) : '—'} caption={`${gradedCredits} graded credits`}/><Stat label="Degree-plan GPA" value={gradedCredits ? gpa.toFixed(2) : '—'} caption="Current local plan"/><Stat label="Minimum required" value="3.00" caption="Purdue MS CS plan of study"/></div><div className="plan-list">{plan.length ? plan.map(p => <PlanRow key={p.id} section={p} remove={remove} update={update} grades/>) : <Empty text="Add courses to your plan, then record a grade here."/>}</div></>}
      {view === 'import' && <TranscriptImporter onImport={importCourses}/>}
      {view === 'about' && <About />}
    </main>
  </div>
}

function Dashboard({ track, plan, coreMet, degreeCredits, target, gpa, conflicts, setView }: { track: string; plan: Planned[]; coreMet: number; degreeCredits: number; target: number; gpa: number; conflicts: string[]; setView: (v: 'catalog') => void }) { const percent = Math.min(100, Math.round(degreeCredits / target * 100)); return <><section className="hero"><div><p>WELCOME BACK</p><h2>{degreeCredits} of {target} degree credits planned</h2><div className="progress"><i style={{width: `${percent}%`}}/></div><small>{percent}% of the {track} course-credit target</small></div><button className="light" onClick={() => setView('catalog')}><Plus size={17}/> Explore courses</button></section><div className="stat-row"><Stat label="Core areas" value={`${coreMet}/3`} caption="Systems I · Systems II · Algorithms"/><Stat label="Plan GPA" value={gpa ? gpa.toFixed(2) : '—'} caption="3.00 minimum required"/><Stat label="Courses planned" value={String(new Set(plan.map(p => p.courseCode)).size)} caption="Across all saved terms"/></div><section className="requirements"><div className="section-heading"><div><p className="eyebrow">DEGREE PROGRESS</p><h2>Required foundations</h2></div><span>{coreMet}/3 complete</span></div>{coreCourses.map(rule => { const chosen = plan.find(p => rule.alternatives.includes(p.courseCode)); return <div className="requirement" key={rule.key}><CheckCircle2 size={20} className={chosen ? 'done' : ''}/><div><b>{rule.label}</b><small>{rule.alternatives.join(' or ')}</small></div><em>{chosen ? chosen.courseCode : 'Not planned'}</em></div>})}</section>{conflicts.length > 0 && <div className="alert">{conflicts.length} timetable conflict{conflicts.length > 1 ? 's' : ''} need attention.</div>}</> }
function CourseCard({ section, added, add }: { section: Section; added: boolean; add: (s: Section) => void }) { return <article className="course-card"><div><span className="pill">{courseAreas[section.courseCode] ?? 'Graduate elective'}</span><h3>{section.courseCode}</h3><h2>{section.title}</h2></div><div className="details"><span>{section.section} · {section.type}</span><span>{section.days || 'Arranged'} · {section.start || 'TBA'}–{section.end || 'TBA'}</span><span>{section.instructor || 'Instructor TBA'} · {section.location || 'TBA'}</span></div><button disabled={added} className={added ? 'added' : 'primary'} onClick={() => add(section)}>{added ? 'In your plan' : <><Plus size={16}/> Add to plan</>}</button></article> }
function PlanRow({ section, remove, update, grades = false }: { section: Planned; remove: (id: string) => void; update: (id: string, c: Partial<Planned>) => void; grades?: boolean }) { return <article className="plan-row"><div><b>{section.courseCode}</b><span>{section.title}</span><small>{section.term} · {section.section} · {section.days || 'Arranged'} {section.start && `· ${section.start}–${section.end}`}</small></div>{grades && <><select value={section.status} onChange={e => update(section.id, {status: e.target.value as Planned['status']})}><option value="planned">Planned</option><option value="completed">Completed</option></select><select disabled={section.status !== 'completed'} value={section.grade ?? ''} onChange={e => update(section.id, {grade: e.target.value})}><option value="">Grade</option>{Object.keys(gradePoints).map(g => <option key={g}>{g}</option>)}</select></>}<button className="icon" aria-label="Remove course" onClick={() => remove(section.id)}><Trash2 size={17}/></button></article> }
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
function Stat({label,value,caption}:{label:string;value:string;caption:string}) { return <article className="stat"><p>{label}</p><strong>{value}</strong><small>{caption}</small></article> }
function Empty({text}:{text:string}) { return <div className="empty"><BookOpen size={28}/><p>{text}</p></div> }
function About() { return <section className="about"><div className="hero"><div><p>UNOFFICIAL STUDENT TOOL</p><h2>Make your MS CS plan easier to see.</h2><small>MSCSplan helps Purdue students explore graduate sections, assemble a timetable, and keep an eye on degree progress.</small></div></div><div className="about-grid"><article><h2>What it includes</h2><p>Term-specific CS 50000+ sections, schedule-conflict checks, thesis and non-thesis progress, and a credit-weighted GPA calculator.</p></article><article><h2>Your data stays local</h2><p>This static release has no accounts or backend. Your course plan and grades are stored only in this browser via local storage.</p></article><article><h2>Use it carefully</h2><p>This does not replace official registration or academic advising. Confirm course eligibility and degree requirements with Purdue CS before submitting your plan of study.</p></article></div><p className="source-note">Degree requirements are based on Purdue CS's Master's Program curriculum. Course schedules are imported from supplied Purdue schedule exports.</p></section> }
createRoot(document.getElementById('root')!).render(<App />)
