import { watch } from 'vue'
import { lang, dictFor } from './i18n.js'
import { arExtra, arPatterns } from './i18n.ar.js'

// Translates template text that has no t() call by matching rendered text against the dictionaries.
// Originals are remembered so switching back to English restores them; Vue re-renders are re-translated.
const ATTRS = ['placeholder', 'title', 'aria-label']
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE'])
const origText = new WeakMap() // text node -> { src, out }
const origAttr = new WeakMap() // element -> { attr: { src, out } }
let observer = null
const norm = s => s.replace(/\s+/g, ' ').trim()

function translate(raw) {
  const key = norm(raw)
  if (!key || !/[A-Za-z]{2}/.test(key)) return null
  let out = dictFor('ar')[key] || arExtra[key]
  if (!out) for (const [re, rep] of arPatterns) if (re.test(key)) { out = key.replace(re, rep); break }
  if (!out) return null
  return raw.match(/^\s*/)[0] + out + raw.match(/\s*$/)[0]
}

function doText(node) {
  const rec = origText.get(node)
  if (rec && node.data === rec.out) return // our own output
  const out = translate(node.data)
  if (out && out !== node.data) { origText.set(node, { src: node.data, out }); node.data = out }
}
function doEl(el) {
  if (SKIP.has(el.tagName) || el.closest?.('[data-no-translate]')) return
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a)
    if (!v) continue
    const rec = origAttr.get(el)?.[a]
    if (rec && v === rec.out) continue
    const out = translate(v)
    if (out && out !== v) { const m = origAttr.get(el) || {}; m[a] = { src: v, out }; origAttr.set(el, m); el.setAttribute(a, out) }
  }
}
function walk(root) {
  if (root.nodeType === 3) {
    const p = root.parentElement
    if (p && !SKIP.has(p.tagName) && !p.closest('[data-no-translate]')) doText(root)
    return
  }
  if (root.nodeType !== 1) return
  doEl(root)
  for (const c of root.childNodes) walk(c)
}
function restore(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = w.currentNode; n; n = w.nextNode()) {
    if (n.nodeType === 3) {
      const r = origText.get(n)
      if (r && n.data === r.out) n.data = r.src
      origText.delete(n)
    } else {
      const m = origAttr.get(n)
      if (m) { for (const [a, r] of Object.entries(m)) if (n.getAttribute(a) === r.out) n.setAttribute(a, r.src); origAttr.delete(n) }
    }
  }
}

export function startDomTranslate() {
  watch(lang, l => {
    observer?.disconnect(); observer = null
    if (l === 'ar') {
      walk(document.body)
      observer = new MutationObserver(muts => {
        for (const m of muts) {
          if (m.type === 'childList') m.addedNodes.forEach(walk)
          else if (m.type === 'characterData') doText(m.target)
          else if (m.type === 'attributes') doEl(m.target)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
    } else restore(document.body)
  }, { immediate: true, flush: 'post' })
}
