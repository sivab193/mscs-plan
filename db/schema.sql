-- Temporary local data model. Firebase/Firestore will replace user-owned tables
-- once project configuration is supplied; catalog tables map directly to imports.
CREATE TABLE IF NOT EXISTS terms (id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_on TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses (code TEXT PRIMARY KEY, title TEXT NOT NULL, level INTEGER NOT NULL, area TEXT, credits INTEGER DEFAULT 3);
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY, term_id TEXT NOT NULL, course_code TEXT NOT NULL, section TEXT,
  meeting_type TEXT, days TEXT, starts_at TEXT, ends_at TEXT, location TEXT,
  capacity INTEGER, instructor TEXT, note TEXT, first_date TEXT, last_date TEXT,
  FOREIGN KEY(term_id) REFERENCES terms(id), FOREIGN KEY(course_code) REFERENCES courses(code)
);
CREATE TABLE IF NOT EXISTS student_courses (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, course_code TEXT NOT NULL, term_id TEXT,
  credits INTEGER NOT NULL, grade TEXT, status TEXT NOT NULL
);
