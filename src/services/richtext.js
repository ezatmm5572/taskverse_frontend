// Tiny, safe markdown-lite renderer: HTML is escaped first, then a few inline patterns are
// turned back into tags. Supported: **bold**, _italic_, `code`, - lists, [text](https://url), bare URLs, @mentions.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const handleOf = m => {
  const name = `${m?.fname || ''}${m?.lname || ''}`.replace(/\s+/g, '')
  return name || String(m?.email || 'member').split('@')[0]
}

function inline(s, handles) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/@([\p{L}\p{N}_]+)/gu, (m, h) => (handles.has(h.toLowerCase()) ? `<span class="mention">@${h}</span>` : m))
}

export function renderRich(text, handles = []) {
  const set = new Set(handles.map(h => h.toLowerCase()))
  const out = []
  let inList = false
  for (const line of esc(text).split('\n')) {
    const item = /^\s*[-*]\s+(.*)$/.exec(line)
    if (item) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(item[1], set)}</li>`)
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(line.trim() ? `<p>${inline(line, set)}</p>` : '')
    }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

// Plain text version for table cells / CSV.
export const stripRich = text => String(text ?? '')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,!?:;])/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*[-*]\s+/gm, '• ')

export const mentionsOf = (text, handles) => {
  const set = new Set(handles.map(h => h.toLowerCase()))
  return [...String(text ?? '').matchAll(/@([\p{L}\p{N}_]+)/gu)].map(m => m[1].toLowerCase()).filter(h => set.has(h))
}
