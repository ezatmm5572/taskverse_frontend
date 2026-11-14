// Some accounts store the job title inside the last name ("Ahmed" + "Azouz UI UX Designer").
// Cards show the person's name and put the rest on its own line as a subtitle.
export function splitName(m) {
  const first = String(m?.fname || '').trim()
  const words = String(m?.lname || '').trim().split(/\s+/).filter(Boolean)
  if (!first && !words.length) return { name: m?.email || 'Member', title: '' }
  return { name: [first, words[0]].filter(Boolean).join(' '), title: words.slice(1).join(' ') }
}
