// Pure helpers: number/time formatting and the desktop pill SVGs. No engine imports,
// so the same file renders the HTML preview under plain Node.

export type Tone = 'teal' | 'violet' | 'red' | 'green' | 'blue' | 'gold'
export type IconName = 'gauge' | 'countdown' | 'calendar' | 'up' | 'down' | 'layers' | 'dollar'

export type Segment =
  | { kind: 'icon'; name: IconName }
  | { kind: 'text'; text: string; isBold?: boolean; isDim?: boolean }
  | { kind: 'bar'; percent: number; elapsed: number | null }
  | { kind: 'sep' }

export type Pill = { tone: Tone; title: string; alt: string; segments: Segment[] }

const HOUR = 3_600_000
const DAY = 24 * HOUR
export const WINDOW_MS = { fiveHour: 5 * HOUR, sevenDay: 7 * DAY }

export function fmtCount(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

/** A window size: "1M", "200k", "1.5M". */
export function fmtWindow(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

/** The context fill as whole percent: the reading's own, else tokens / window. */
export function contextPercent(c: { tokens: number | null; window: number; percent: number | null }): number | null {
  if (c.percent != null) return c.percent
  if (c.tokens == null || c.window <= 0) return null
  return Math.round((c.tokens / c.window) * 100)
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

export function fmtPercent(n: number): string {
  return `${Math.round(n)}%`
}

/** "2h 40m" under a day, "1d 7h" from a day up, "12m" under an hour. */
export function fmtLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${mm}m`
  return `${mm}m`
}

/** Share of the window already gone: 1 − left / window, clamped to 0..1. */
export function elapsedShare(leftMs: number, windowMs: number): number {
  return Math.min(1, Math.max(0, 1 - leftMs / windowMs))
}

export function level(percent: number): 'ok' | 'warn' | 'high' {
  return percent >= 90 ? 'high' : percent >= 70 ? 'warn' : 'ok'
}

// Light: pastel ground, dark ink. Dark: deep tinted ground, light ink.
const TONES: Record<Tone, { bg: string; fg: string; dbg: string; dfg: string }> = {
  teal: { bg: '#d3efe6', fg: '#1d5546', dbg: '#163a31', dfg: '#9fe2cb' },
  violet: { bg: '#e5dff8', fg: '#45358a', dbg: '#2b2548', dfg: '#c9befa' },
  red: { bg: '#f9ddd6', fg: '#8a3122', dbg: '#40231d', dfg: '#f4b4a6' },
  green: { bg: '#dcf0d4', fg: '#2c6622', dbg: '#20351a', dfg: '#b5e4a5' },
  blue: { bg: '#dde4f9', fg: '#30448e', dbg: '#202944', dfg: '#b6c5f4' },
  gold: { bg: '#f6eac4', fg: '#765608', dbg: '#3b3115', dfg: '#ecd38b' },
}

const ICONS: Record<IconName, string> = {
  gauge: '<path d="M2.6 11.4a5.6 5.6 0 1 1 10.8 0"/><path d="M8 10.6 10.6 6.4"/><circle cx="8" cy="10.6" r=".9" class="f"/>',
  countdown:
    '<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8"/><path d="M2.6 2.4v2.6h2.6"/><path d="M8 5.2V8l2 1.3"/>',
  calendar: '<rect x="2.2" y="3.4" width="11.6" height="10.4" rx="2"/><path d="M2.2 7h11.6M5.2 1.9v3M10.8 1.9v3"/>',
  up: '<path d="M8 11V2.8M4.6 6.2 8 2.8l3.4 3.4M3 13.6h10"/>',
  down: '<path d="M8 2.8V11M4.6 7.6 8 11l3.4-3.4M3 13.6h10"/>',
  layers: '<path d="M8 2.2 14 5.3 8 8.4 2 5.3Z"/><path d="M2 8.2l6 3.1 6-3.1M2 11.1l6 3.1 6-3.1"/>',
  dollar:
    '<circle cx="8" cy="8" r="6.2"/><path d="M10 6.1c-.4-.7-1.1-1.1-2-1.1-1.1 0-1.9.6-1.9 1.4 0 1.9 3.9 1 3.9 3 0 .9-.9 1.5-2 1.5-.9 0-1.7-.4-2.1-1.1M8 3.7v1.3M8 11v1.3"/>',
}

const CHAR_W = 7.25
const H = 24
const BAR_W = 34
const ICON = 14
const GAP = 4

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function segWidth(s: Segment): number {
  switch (s.kind) {
    case 'icon':
      return ICON
    case 'text':
      return s.text.length * CHAR_W
    case 'bar':
      return BAR_W
    case 'sep':
      return 1
  }
}

export function pillWidth(p: Pill): number {
  const inner = p.segments.reduce((w, s, i) => w + segWidth(s) + (i > 0 ? GAP : 0), 0)
  return Math.ceil(inner + 7 + 7)
}

export function pillSvg(p: Pill): string {
  const t = TONES[p.tone]
  const w = pillWidth(p)
  const mid = H / 2
  let x = 7
  const parts: string[] = []
  p.segments.forEach((s, i) => {
    if (i > 0) x += GAP
    switch (s.kind) {
      case 'icon':
        parts.push(
          `<g class="i" transform="translate(${x.toFixed(1)} ${mid - ICON / 2}) scale(${ICON / 16})">${ICONS[s.name]}</g>`,
        )
        break
      case 'text':
        parts.push(
          `<text x="${x.toFixed(1)}" y="${mid + 4.2}" class="${s.isBold ? 't b' : s.isDim ? 't d' : 't'}">${esc(s.text)}</text>`,
        )
        break
      case 'bar': {
        const fill = Math.max(0, Math.min(100, s.percent)) / 100
        parts.push(`<rect x="${x.toFixed(1)}" y="${mid - 2.5}" width="${BAR_W}" height="5" rx="2.5" class="tr"/>`)
        if (fill > 0) {
          parts.push(
            `<rect x="${x.toFixed(1)}" y="${mid - 2.5}" width="${Math.max(3, BAR_W * fill).toFixed(1)}" height="5" rx="2.5" class="lv-${level(s.percent)}"/>`,
          )
        }
        if (s.elapsed !== null) {
          const mx = (x + BAR_W * s.elapsed).toFixed(1)
          parts.push(`<path d="M${mx} ${mid - 6}V${mid + 6}" class="mk"/>`)
        }
        break
      }
      case 'sep':
        parts.push(`<path d="M${(x + 0.5).toFixed(1)} ${mid - 6}V${mid + 6}" class="sp"/>`)
        break
    }
    x += segWidth(s)
  })

  const k = `.u-${p.tone}`
  const rules = (bg: string, fg: string, ok: string, warn: string, high: string) =>
    `${k} .bg{fill:${bg}}${k} .t{fill:${fg}}${k} .i{stroke:${fg}}${k} .i .f{fill:${fg}}${k} .tr{fill:${fg}}` +
    `${k} .mk{stroke:${fg}}${k} .sp{stroke:${fg}}${k} .lv-ok{fill:${ok}}${k} .lv-warn{fill:${warn}}${k} .lv-high{fill:${high}}`
  const css =
    `:root{color-scheme:light dark;background:transparent}html,body{margin:0;background:transparent}` +
    `${k} .t{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}${k} .b{font-weight:700}` +
    `${k} .d{opacity:.7}${k} .i{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}${k} .i .f{stroke:none}` +
    `${k} .tr{opacity:.18}${k} .mk{stroke-width:1.6;stroke-linecap:round}${k} .sp{opacity:.3}` +
    rules(t.bg, t.fg, '#2f9e63', '#d39b12', '#d64040') +
    `@media (prefers-color-scheme:dark){${rules(t.dbg, t.dfg, '#43c07e', '#e8b030', '#ef5b5b')}}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" class="u-${p.tone}">` +
    `<style>${css}</style>` +
    `<g><title>${esc(p.title)}</title>` +
    `<rect width="${w}" height="${H}" rx="${H / 2}" class="bg"/>${parts.join('')}</g></svg>`
  )
}

// ---- the band's model, shared by both surfaces ----

export type BandLimit = { percentUsed: number; resetsAt: string | null }
export type BandInput = {
  now: number
  fiveHour: BandLimit | null
  sevenDay: BandLimit | null
  context: { tokens: number | null; window: number; percent: number | null } | null
  costUsd: number | null
  tokens: {
    uncachedInput: number
    cacheWrite: number
    output: number
    cacheRead: number
    requests: number
    isApprox: boolean
  } | null
}

export type LimitView = {
  label: '5h' | '7d'
  percent: number
  left: string | null
  elapsed: number | null
}

export function limitView(label: '5h' | '7d', l: BandLimit, now: number): LimitView {
  const windowMs = label === '5h' ? WINDOW_MS.fiveHour : WINDOW_MS.sevenDay
  const resetAt = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  const leftMs = Number.isFinite(resetAt) ? Math.max(0, resetAt - now) : null
  return {
    label,
    percent: l.percentUsed,
    left: leftMs === null ? null : fmtLeft(leftMs),
    elapsed: leftMs === null ? null : elapsedShare(leftMs, windowMs),
  }
}

function contextLine(b: BandInput): string {
  const c = b.context
  if (!c || c.tokens == null) return 'Context: no reading yet'
  const pct = contextPercent(c)
  return `Context: ${fmtCount(c.tokens)} / ${fmtWindow(c.window)}${pct != null ? ` (${pct}%)` : ''}`
}

function hhmm(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return ` (${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())})`
}

/** Pills grouped as [5h 7d] [in out context] [cost]; empty groups dropped. */
export function buildGroups(b: BandInput): Pill[][] {
  const limits: Pill[] = []
  for (const [label, l, tone, icon, name] of [
    ['5h', b.fiveHour, 'teal', 'gauge', '5-hour'],
    ['7d', b.sevenDay, 'violet', 'calendar', '7-day'],
  ] as const) {
    if (!l) continue
    const v = limitView(label, l, b.now)
    const segs: Segment[] = [
      { kind: 'icon', name: icon },
      { kind: 'text', text: label },
      { kind: 'bar', percent: v.percent, elapsed: v.elapsed },
      { kind: 'text', text: fmtPercent(v.percent), isBold: true },
    ]
    if (v.left !== null) {
      segs.push({ kind: 'sep' }, { kind: 'text', text: v.left })
    }
    limits.push({
      tone,
      alt: `${label} limit ${fmtPercent(v.percent)} used${v.left ? `, resets in ${v.left}` : ''}`,
      title:
        `${name} limit: ${l.percentUsed}% used\n` +
        (v.left ? `Resets in ${v.left}${hhmm(l.resetsAt)}\n` : '') +
        (v.elapsed !== null ? `Window elapsed: ${Math.round(v.elapsed * 100)}%` : ''),
      segments: segs,
    })
  }

  const tokens: Pill[] = []
  const t = b.tokens
  if (t) {
    const p = t.isApprox ? '~' : ''
    const tail = `\nRequests: ${t.requests}${t.isApprox ? '\n~ approximate: summed from turn ends (transcript not readable)' : ''}`
    const input = t.uncachedInput + t.cacheWrite
    tokens.push(
      {
        tone: 'red',
        alt: `Input ${p}${fmtCount(input)} tokens`,
        title:
          `Input tokens: ${p}${fmtCount(input)}\n  uncached: ${fmtCount(t.uncachedInput)}\n  cache write: ${fmtCount(t.cacheWrite)}` +
          `\n  cache read: ${fmtCount(t.cacheRead)}${tail}`,
        segments: [{ kind: 'icon', name: 'up' }, { kind: 'text', text: p + fmtCount(input) }],
      },
      {
        tone: 'green',
        alt: `Output ${p}${fmtCount(t.output)} tokens`,
        title: `Output tokens: ${p}${fmtCount(t.output)}${tail}`,
        segments: [{ kind: 'icon', name: 'down' }, { kind: 'text', text: p + fmtCount(t.output) }],
      },
    )
  }
  const c = b.context
  if (c && c.tokens != null) {
    const pct = contextPercent(c) ?? 0
    tokens.push({
      tone: 'blue',
      alt: `Context ${fmtCount(c.tokens)} of ${fmtWindow(c.window)} tokens, ${fmtPercent(pct)}`,
      title: `${contextLine(b)}\nInput the last response was answered over`,
      segments: [
        { kind: 'icon', name: 'layers' },
        { kind: 'text', text: `${fmtCount(c.tokens)}/${fmtWindow(c.window)}` },
        { kind: 'sep' },
        { kind: 'text', text: fmtPercent(pct), isBold: true },
      ],
    })
  }

  const cost: Pill[] = []
  if (b.costUsd != null) {
    cost.push({
      tone: 'gold',
      alt: `Session cost ${fmtUsd(b.costUsd)}`,
      title: `Session cost: ${fmtUsd(b.costUsd)}\nAt API list price (not what a subscription bills)`,
      segments: [{ kind: 'icon', name: 'dollar' }, { kind: 'text', text: fmtUsd(b.costUsd) }],
    })
  }

  return [limits, tokens, cost].filter(g => g.length > 0)
}
