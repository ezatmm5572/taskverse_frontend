const csvCell = v => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// UTF-8 with BOM so Excel opens Arabic text correctly.
export function downloadCSV(filename, headers, rows) {
  const body = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// Opens a clean printable page; the browser's print dialog offers "Save as PDF".
export function printReport({ title, subtitle = '', sections, rtl = false }) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Pop-up blocked. Allow pop-ups for this site to export a PDF.')
  const tables = sections.map(sec => `
    <h2>${esc(sec.heading)}</h2>
    <table><thead><tr>${sec.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${sec.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${sec.headers.length}">—</td></tr>`}</tbody></table>`).join('')
  w.document.write(`<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1b1f2e;margin:32px}
      h1{margin:0 0 4px;font-size:22px} p{margin:0 0 18px;color:#667} h2{font-size:15px;margin:22px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #d9dce8;padding:6px 8px;text-align:start;vertical-align:top}
      th{background:#f0effa} tr{page-break-inside:avoid}
      @media print{body{margin:12mm}}
    </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${tables}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
