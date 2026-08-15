export const coreCourses = [
  { key: 'systems1', label: 'Systems I', alternatives: ['CS 50200', 'CS 56500'] },
  { key: 'systems2', label: 'Systems II', alternatives: ['CS 50300', 'CS 53600'] },
  { key: 'algorithms', label: 'Algorithms', alternatives: ['CS 58000', 'CS 58800'] },
]

export const courseAreas: Record<string, string> = {
  'CS 50500': 'Distributed Systems', 'CS 51400': 'Numerical Computing', 'CS 51500': 'Numerical Computing',
  'CS 52500': 'Parallel & Distributed Computing', 'CS 53000': 'Graphics & Visualization', 'CS 53100': 'Graphics & Visualization',
  'CS 53500': 'Graphics & Visualization', 'CS 53600': 'Systems II', 'CS 54100': 'Databases', 'CS 54200': 'Databases',
  'CS 55700': 'Artificial Intelligence', 'CS 56500': 'Systems I', 'CS 57100': 'Artificial Intelligence',
  'CS 57300': 'Artificial Intelligence', 'CS 57700': 'Artificial Intelligence', 'CS 57800': 'Artificial Intelligence',
  'CS 58000': 'Algorithms', 'CS 58100': 'Algorithms', 'CS 58400': 'Complexity', 'CS 58800': 'Algorithms', 'CS 58900': 'Algorithms',
}

export const gradePoints: Record<string, number> = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0 }
