export const PAGE = String.raw`(() => {
  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const bare = (s) => norm((s ?? '').replace(/[\p{S}\p{P}\p{Cf}\uFE00-\uFE0F\u20E3]/gu, ' '))
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 }
  const spoken = (el) =>
    [...el.childNodes]
      .map((n) => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' ? spoken(n) : ''))
      .join('')
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria
    const by = el.getAttribute('aria-labelledby')
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(' ')
    if (el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type)) return el.value
    if (el.placeholder) return el.placeholder
    if (el.getAttribute('title') && !el.textContent.trim()) return el.getAttribute('title')
    return spoken(el)
  }
  const KINDS = {
    fill: 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), textarea, [contenteditable=true]',
    select: 'select',
    check: 'input[type=checkbox], input[type=radio]',
    click: 'button, a[href], [role=button], [role=link], [role=tab], [role=option], [role=menuitem], [role=checkbox], [role=switch], input[type=submit], input[type=button], input[type=image], summary, [title], label',
  }
  const SCOPES = 'li, tr, form, [role=listitem], [role=row]'
  const scopeOf = (within) => {
    if (within === null) return { roots: [null] }
    const want = norm(within)
    const all = [...document.querySelectorAll(SCOPES)].filter((el) => shown(el) && norm(el.innerText).includes(want))
    const exact = all.filter((el) => el.innerText.split('\n').some((l) => norm(l) === want))
    const pool = exact.length ? exact : all
    const roots = pool.filter((el) => !pool.some((o) => o !== el && el.contains(o)))
    if (!roots.length) return { error: 'No list item, table row or form contains "' + within + '"' }
    return { roots }
  }
  const inside = (root, el) => root === null || root.contains(el) || (root.tagName === 'FORM' && el.form === root)
  const note = (count, scoped) =>
    [count > 1 ? count + ' matched; used the first' : null, scoped > 1 ? scoped + ' places contain the text and the target; used the first' : null]
      .filter(Boolean).join('; ') || null
  const find = (kind, name, within) => {
    const scope = scopeOf(within)
    if (scope.error) return scope
    const want = norm(name)
    let all = []
    const found = scope.roots.map((root) => {
      const pool = [...document.querySelectorAll(KINDS[kind])].filter((el) => shown(el) && inside(root, el))
      all = all.concat(pool)
      let hits = pool.filter(
        (el) => norm(nameOf(el)) === want || norm(el.getAttribute('title')) === want || norm(el.textContent) === want,
      )
      if (!hits.length && kind !== 'click') hits = pool.filter((el) => norm(el.getAttribute('name')) === want)
      if (!hits.length && kind === 'click')
        hits = [...(root ?? document.body).querySelectorAll('*')].filter(
          (el) => shown(el) && norm(el.textContent) === want && ![...el.children].some((c) => norm(c.textContent) === want),
        )
      if (!hits.length && bare(name)) {
        const loose = pool.filter((el) => bare(nameOf(el)) === bare(name) || bare(el.textContent) === bare(name))
        if (loose.length === 1) hits = loose
      }
      return hits
    }).filter((hits) => hits.length)
    if (!found.length) {
      const names = [...new Set(all.map((el) => (nameOf(el) ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))]
      const words = (x) => new Set(norm(x).split(/[^a-z0-9]+/).filter(Boolean))
      const asked = words(name)
      const near = names
        .map((n) => {
          const w = words(n)
          const shared = [...asked].filter((x) => w.has(x)).length
          const part = norm(n).includes(want) || want.includes(norm(n)) ? 1 : 0
          return { n, score: shared * 2 + part }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0]
      return { error: 'No ' + kind + ' target named "' + name + '"' + (within === null ? '' : ' in "' + within + '"') + (near ? '. Did you mean "' + near.n + '"?' : '') + (names.length ? (near ? ' ' : '. ') + (within === null ? 'On the page' : 'There') + ': ' + names.slice(0, 20).map((n) => JSON.stringify(n.slice(0, 40))).join(', ') : '') }
    }
    return { els: found[0], scoped: found.length }
  }
  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    el.focus()
    if (el.isContentEditable) el.textContent = value
    else Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const jsOnly = (el) => {
    const tag = el.tagName.toLowerCase()
    const type = (el.getAttribute('type') ?? '').toLowerCase()
    if (tag === 'a') return el.hasAttribute('href') ? null : 'a link without href'
    if (tag === 'button') {
      const native = ['show-modal', 'close', 'request-close', 'show-popover', 'hide-popover', 'toggle-popover']
      if ((el.hasAttribute('commandfor') && native.includes(el.getAttribute('command'))) || el.hasAttribute('popovertarget'))
        return null
      return type === 'button' ? 'a type=button button' : el.form ? null : 'a button outside a form'
    }
    if (tag === 'input') {
      if (type === 'button') return 'a type=button input'
      if (['submit', 'image', 'reset'].includes(type)) return el.form ? null : 'a button outside a form'
      return null
    }
    if (tag === 'label') return el.control ? null : 'a label without a control'
    if (['summary', 'select', 'option', 'textarea'].includes(tag)) return null
    const host = el.parentElement?.closest('a[href], button, label, summary, input')
    if (host) return jsOnly(host)
    const role = el.getAttribute('role')
    return 'a <' + tag + '>' + (role ? ' with role=' + role : '') + ' has no native action'
  }
  const at = (el) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const top = document.elementFromPoint(x, y)
    const label = el.control ?? null
    const hit = top && (el.contains(top) || top === label || (top.tagName === 'LABEL' && top.control === el))
    const tag = (e) => '<' + e.tagName.toLowerCase() + (e.getAttribute('href') ? ' href="' + e.getAttribute('href') + '"' : '') + '>'
    const covered = hit ? null : !top ? 'nothing' : tag(top) + (top.contains(el) ? ' (its ::before or ::after)' : '')
    return { x, y, covered, target: tag(el) }
  }
  const FILLED = Symbol.for('hozu.browse.filled')
  const formName = (form) => {
    const own = form.getAttribute('aria-label') ?? (form.getAttribute('aria-labelledby') ? nameOf(form) : null) ?? form.querySelector('legend')?.textContent
    const buttons = [...form.elements].filter((e) => (e.tagName === 'BUTTON' && (e.getAttribute('type') ?? 'submit') === 'submit') || (e.tagName === 'INPUT' && ['submit', 'image'].includes(e.type)))
    return { names: [own, ...buttons.map((b) => nameOf(b))].filter(Boolean).map((n) => n.replace(/\s+/g, ' ').trim()), buttons }
  }
  const TEXT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']
  return {
    point(name, within) {
      const f = find('click', name, within)
      if (f.error) return f
      return { ...at(f.els[0]), jsOnly: jsOnly(f.els[0]), note: note(f.els.length, f.scoped) }
    },
    checkable(name, within) {
      const f = find('check', name, within)
      if (f.error) return f
      const el = f.els[0]
      return { ...at(el), checked: el.checked, radio: el.type === 'radio', note: note(f.els.length, f.scoped) }
    },
    fill(name, value, within) {
      const f = find('fill', name, within)
      if (f.error) return f
      const done = (window[FILLED] ??= new WeakSet())
      const index = Math.max(0, f.els.findIndex((el) => !done.has(el)))
      done.add(f.els[index])
      setValue(f.els[index], value)
      return { note: f.els.length > 1 ? 'filled ' + (index + 1) + ' of ' + f.els.length + ' named "' + name + '"' : note(1, f.scoped) }
    },
    select(name, option, within) {
      const f = find('select', name, within)
      if (f.error) return f
      const el = f.els[0]
      const o = [...el.options].find((o) => norm(o.textContent) === norm(option) || o.value === option)
      if (!o) return { error: 'Select "' + name + '" has no option "' + option + '". Options: ' + [...el.options].map((o) => JSON.stringify(o.textContent.trim())).join(', ') }
      if (el.multiple) {
        el.focus()
        o.selected = true
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else setValue(el, o.value)
      return { note: note(f.els.length, f.scoped) }
    },
    submit(label, within) {
      const scope = scopeOf(within)
      if (scope.error) return scope
      const want = norm(label)
      const forms = [...document.forms].filter((f) => scope.roots.some((root) => inside(root, f) || root?.contains(f)))
      const hits = forms.filter((f) => formName(f).names.some((n) => norm(n) === want))
      if (!hits.length) {
        const names = forms.map((f) => formName(f).names[0]).filter(Boolean)
        return { error: 'No form named "' + label + '"' + (names.length ? '. Forms: ' + names.slice(0, 20).map((n) => JSON.stringify(n.slice(0, 40))).join(', ') : '') }
      }
      const form = hits[0]
      form.requestSubmit(formName(form).buttons[0])
      return { note: note(hits.length, 1) }
    },
    keyJsOnly(key) {
      const el = document.activeElement
      const tag = el && el !== document.body ? el.tagName.toLowerCase() : null
      if (key === 'Tab') return null
      if (key === 'Enter') {
        if (!tag) return 'nothing is focused'
        if (tag === 'a') return el.hasAttribute('href') ? null : 'a link without href'
        if (tag === 'button') return jsOnly(el)
        if (tag === 'textarea') return 'Enter in a textarea adds a line'
        if (tag === 'input') {
          if (!el.form) return 'Enter in a field outside a form'
          const buttons = formName(el.form).buttons
          const fields = [...el.form.elements].filter((e) => e.tagName === 'INPUT' && TEXT_TYPES.includes(e.type))
          if (!buttons.length && fields.length > 1) return 'the form has no submit button'
          return TEXT_TYPES.includes(el.type) ? null : jsOnly(el)
        }
        return 'Enter on a <' + tag + '> has no native action'
      }
      if (key === 'Space' || key.length === 1) return tag ? null : 'nothing is focused'
      return key + ' has no native action'
    },
    snapshot() {
      const clean = (s) => (s ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
      const text = clean(document.body?.innerText)
      const component = [...document.querySelectorAll('[data-hozu-component]')].flatMap((el) => clean(el.innerText).split('\n').filter(Boolean))
      const url = new URL(location.href)
      url.searchParams.delete('__hozu')
      return { url: url.pathname + url.search, title: document.title, text, component }
    },
    report(selectors, expected) {
      const components = []
      const hydrated = document.documentElement.hasAttribute('data-hozu-ready') || !document.getElementById('hozu-payload')
      for (const el of document.querySelectorAll('[data-hozu-component]')) {
        const name = el.getAttribute('data-hozu-component')
        const state = el.getAttribute('data-hozu-component-state')
        const load = expected.find(([n]) => n === name)?.[1]
        const r = el.getBoundingClientRect()
        const empty = !el.children.length && !el.textContent.trim()
        components.push({
          name,
          state: state === 'loading' ? 'not mounted' : state,
          width: Math.round(r.width),
          height: Math.round(r.height),
          canvases: el.querySelectorAll('canvas').length,
          elements: el.querySelectorAll('*').length,
          hint:
            state === 'failed'
              ? 'its setup threw; see errors'
              : state === 'loading'
                ? load === 'visible' && (r.bottom < 0 || r.top > innerHeight)
                  ? "load: 'visible' mounts it when it scrolls into view"
                  : load === 'idle'
                    ? "load: 'idle' mounts it when the browser is idle"
                    : 'its module has not loaded; see errors'
                : r.height === 0
                  ? 'it has no height, so a map or canvas inside shows nothing: give it a height class such as h-64'
                  : empty
                    ? 'it mounted but rendered nothing'
                    : null,
        })
      }
      if (!hydrated)
        for (const [name] of expected)
          components.push({
            name, state: 'not mounted', width: null, height: null, canvases: 0, elements: 0,
            hint: 'the page did not hydrate; see errors',
          })
      const elements = []
      for (const sel of selectors)
        for (const el of document.querySelectorAll(sel)) {
          const attrs = {}
          for (const a of el.attributes) attrs[a.name] = a.value
          const text = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
          elements.push({ selector: sel, tag: el.tagName.toLowerCase(), attrs, text: text.length > 120 ? text.slice(0, 120) + '…' : text })
        }
      return { hydrated, components, elements }
    },
  }
})()`
