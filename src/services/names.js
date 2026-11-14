// Some accounts store the job title inside the name ("Ahmed Azouz" + "UI UX Designer", "Amira Shobhi" + "Marketing").
// Cards show the person's name and put the title on its own line. The split starts at the first job-title word.
const TITLE_WORDS = new Set(['ui', 'ux', 'ui/ux', 'designer', 'desinger', 'design', 'marketing', 'frontend', 'front-end', 'front', 'backend', 'back-end', 'back', '3d', 'cyber', 'security', 'developer', 'engineer', 'manager', 'mobile', 'qa', 'testing', 'tester', 'data', 'ai', 'devops', 'analyst', 'leader', 'lead', 'full', 'fullstack', 'content', 'sales'])

export function splitName(m) {
  const words = `${m?.fname || ''} ${m?.lname || ''}`.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { name: m?.email || 'Member', title: '' }
  let i = words.findIndex((w, idx) => idx >= 1 && TITLE_WORDS.has(w.toLowerCase()))
  if (i < 0) i = words.length
  return { name: words.slice(0, i).join(' '), title: words.slice(i).join(' ') }
}
