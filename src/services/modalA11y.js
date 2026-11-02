// v-modal-a11y on a `.modal-backdrop`: dialog semantics, focus moves in, Tab is trapped, Esc closes, focus returns on close.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const visible = el => el.offsetParent !== null || el.getClientRects().length > 0

export const vModalA11y = {
  mounted(el) {
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    const card = el.firstElementChild
    const heading = el.querySelector('h1,h2,h3')
    if (heading) { heading.id = heading.id || 'dlg-' + Math.random().toString(36).slice(2, 8); el.setAttribute('aria-labelledby', heading.id) }
    el._returnTo = document.activeElement
    queueMicrotask(() => {
      const first = [...el.querySelectorAll(FOCUSABLE)].filter(visible)[0]
      ;(first || card || el).focus?.({ preventScroll: true })
    })
    el._onKey = e => {
      if (e.key === 'Tab') {
        const items = [...el.querySelectorAll(FOCUSABLE)].filter(visible)
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    el.addEventListener('keydown', el._onKey)
    // Esc works wherever focus is (it may be on <body> after an element was removed); only the topmost dialog reacts.
    el._onEsc = e => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const all = document.querySelectorAll('.modal-backdrop')
      if (all[all.length - 1] !== el) return
      e.preventDefault()
      el.dispatchEvent(new MouseEvent('click', { bubbles: false })) // backdrop uses @click.self to close
    }
    document.addEventListener('keydown', el._onEsc)
  },
  unmounted(el) {
    el.removeEventListener('keydown', el._onKey)
    document.removeEventListener('keydown', el._onEsc)
    const back = el._returnTo
    if (back && document.contains(back)) back.focus?.({ preventScroll: true })
  }
}
