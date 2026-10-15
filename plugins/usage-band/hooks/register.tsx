import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UsageContext, UsageLimit, UsageLimits, UsageTokens } from '../types'
import {
  buildGroups,
  contextPercent,
  fmtCount,
  fmtPercent,
  fmtUsd,
  fmtWindow,
  level,
  limitView,
  pillSvg,
  pillWidth,
  type BandInput,
} from './pills'

const limitsA = atom({ plugin: 'usage-band', key: 'limits' } as const, null)
const contextA = atom({ plugin: 'usage-band', key: 'context' } as const, null)
const costA = atom({ plugin: 'usage-band', key: 'costUsd' } as const, null)
const tokensA = atom({ plugin: 'usage-band', key: 'tokens' } as const, null)
const fallbackA = atom({ plugin: 'usage-band', key: 'fallback' } as const, null)
const hiddenA = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)
const nowA = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const NODES = ['node', '/usr/local/bin/node', '/opt/homebrew/bin/node']
const ZERO: UsageTokens = { uncachedInput: 0, cacheWrite: 0, output: 0, cacheRead: 0, requests: 0, isApprox: true }

type Rate = { kind: string; percentUsed: number; resetsAt?: string }

function pickLimit(list: readonly Rate[], kind: string): UsageLimit | null {
  const r = list.find(x => x.kind === kind)
  return r ? { percentUsed: r.percentUsed, resetsAt: r.resetsAt ?? null } : null
}

function toLimits(list: readonly Rate[]): UsageLimits | null {
  const fiveHour = pickLimit(list, 'five_hour')
  const sevenDay = pickLimit(list, 'seven_day')
  return fiveHour || sevenDay ? { fiveHour, sevenDay } : null
}

function toContext(c: { tokens?: number; window: number; percent?: number }): UsageContext {
  return { tokens: c.tokens ?? null, window: c.window, percent: c.percent ?? null }
}

// Module variables only cache work; everything drawn lives in $.state.
let lastSig = ''
let nodeBin: string | null = null
let isCounting = false

const MINUTE = 60_000

// Every write redraws the band, and an interactive Svg whose source changes
// reloads its frame (a visible flash), so callers skip writes that change nothing.
// (read/update stay at the call sites: the validator wants literal atoms there.)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function putLimits($: EngineInterface, v: UsageLimits | null) {
  if (!same(await read($, limitsA), v)) await update($, limitsA, () => v)
}

async function putContext($: EngineInterface, v: UsageContext) {
  if (!same(await read($, contextA), v)) await update($, contextA, () => v)
}

async function putCost($: EngineInterface, v: number | null) {
  if (!same(await read($, costA), v)) await update($, costA, () => v)
}

async function putTokens($: EngineInterface, v: UsageTokens | null) {
  if (!same(await read($, tokensA), v)) await update($, tokensA, () => v)
}

// Rate limits arrive with this session's own API responses only, so an idle or
// resumed session would keep showing its last reading. Every session publishes
// a fresh reading to one shared file and shows whichever reading is newest.
type Reading = { at: number; limits: UsageLimits | null }
let own: Reading = { at: 0, limits: null }

async function sharedPath($: EngineInterface): Promise<string | null> {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  if (config) return `${config}/usage-band/limits.json`
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home}/.claude/usage-band/limits.json` : null
}

async function readShared($: EngineInterface): Promise<Reading | null> {
  try {
    const path = await sharedPath($)
    if (!path) return null
    const r = JSON.parse(await $.fs.read(path)) as Reading
    return typeof r?.at === 'number' ? r : null
  } catch {
    return null
  }
}

async function publish($: EngineInterface, reading: Reading) {
  try {
    const path = await sharedPath($)
    const shared = await readShared($)
    if (path && (!shared || shared.at < reading.at)) await $.fs.write(path, JSON.stringify(reading))
  } catch {
    // sharing is best effort; this session still shows its own reading
  }
}

// A window whose reset time has passed starts over, whatever the last reading said.
function expire(l: UsageLimit | null, now: number): UsageLimit | null {
  if (!l?.resetsAt) return l
  return Date.parse(l.resetsAt) <= now ? { percentUsed: 0, resetsAt: null } : l
}

async function showLimits($: EngineInterface, now: number) {
  const shared = await readShared($)
  const best = shared && shared.at > own.at ? shared : own
  const l = best.limits
  await putLimits($, l ? { fiveHour: expire(l.fiveHour, now), sevenDay: expire(l.sevenDay, now) } : null)
}

async function refreshUsage($: EngineInterface) {
  const [u, now] = await Promise.all([$.session.usage(), $.clock.now()])
  await showLimits($, now)
  await putContext($, toContext(u.context))
  await putCost($, u.cost?.usd ?? null)
  // "time left" shows whole minutes, so the clock only needs minute steps
  const minute = Math.floor(now / MINUTE) * MINUTE
  if ((await read($, nowA)) !== minute) await update($, nowA, () => minute)
}

async function runScript($: EngineInterface, id: string): Promise<string | null> {
  const script = `${$.plugin.root}/scripts/tokens.mjs`
  for (const bin of nodeBin ? [nodeBin] : NODES) {
    try {
      const r = await $.process.run([bin, script, id, lastSig], { timeoutMs: 20_000 })
      if (r.exitCode === 0) {
        nodeBin = bin
        return r.stdout
      }
      if (nodeBin) return null
    } catch {
      // this node could not start; try the next one
    }
  }
  return null
}

async function refreshTokens($: EngineInterface) {
  if (isCounting) return
  isCounting = true
  try {
    const out = await runScript($, await $.session.id())
    const parsed = out ? (JSON.parse(out) as Partial<UsageTokens> & { sig?: string; unchanged?: boolean; error?: string }) : null
    if (parsed && !parsed.error && parsed.sig) {
      lastSig = parsed.sig
      if (parsed.unchanged) return
      const t: UsageTokens = {
        uncachedInput: parsed.uncachedInput ?? 0,
        cacheWrite: parsed.cacheWrite ?? 0,
        output: parsed.output ?? 0,
        cacheRead: parsed.cacheRead ?? 0,
        requests: parsed.requests ?? 0,
        isApprox: false,
      }
      await putTokens($, t)
      return
    }
    lastSig = ''
    await putTokens($, await read($, fallbackA))
  } catch {
    lastSig = ''
    await putTokens($, await read($, fallbackA))
  } finally {
    isCounting = false
  }
}

async function refreshAll($: EngineInterface) {
  await Promise.allSettled([refreshUsage($), refreshTokens($)])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-band',
      description: 'Usage band: refresh and summarize (hide / show toggles the band)',
      argumentHint: '[hide|show]',
    })
    $.clock.every(30_000, () => void refreshUsage($))
    void refreshAll($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.rateLimits.length > 0) {
      own = { at: now, limits: toLimits(e.rateLimits) }
      await publish($, own)
    }
    await showLimits($, now)
    await putContext($, toContext(e.context))
    if (e.cost) await putCost($, e.cost.usd ?? null)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const u = e.usage
    if (u) {
      await update($, fallbackA, prev => {
        const b = prev ?? ZERO
        return {
          uncachedInput: b.uncachedInput + u.input_tokens,
          cacheWrite: b.cacheWrite + u.cache_creation_input_tokens,
          output: b.output + u.output_tokens,
          cacheRead: b.cacheRead + u.cache_read_input_tokens,
          requests: b.requests + 1,
          isApprox: true,
        }
      })
    }
    await refreshAll($)

    return result
  })

  on('command.run', { command: 'usage-band' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide') {
      await update($, hiddenA, () => true)
      return { text: 'Usage band hidden. /usage-band show brings it back.' }
    }
    if (arg === 'show') {
      await update($, hiddenA, () => false)
    }
    lastSig = ''
    await refreshAll($)
    const limits = await read($, limitsA)
    const tokens = await read($, tokensA)
    const cost = await read($, costA)
    const context = await read($, contextA)
    const now = await $.clock.now()
    const parts: string[] = []
    if (limits?.fiveHour) {
      const v = limitView('5h', limits.fiveHour, now)
      parts.push(`5h ${fmtPercent(v.percent)}${v.left ? ` (${v.left} left)` : ''}`)
    }
    if (limits?.sevenDay) {
      const v = limitView('7d', limits.sevenDay, now)
      parts.push(`7d ${fmtPercent(v.percent)}${v.left ? ` (${v.left} left)` : ''}`)
    }
    if (tokens) {
      const p = tokens.isApprox ? '~' : ''
      parts.push(
        `in ${p}${fmtCount(tokens.uncachedInput + tokens.cacheWrite)}`,
        `out ${p}${fmtCount(tokens.output)}`,
      )
    }
    if (context?.tokens != null) {
      const pct = contextPercent(context)
      parts.push(`ctx ${fmtCount(context.tokens)} / ${fmtWindow(context.window)}${pct != null ? ` (${fmtPercent(pct)})` : ''}`)
    }
    if (cost != null) parts.push(fmtUsd(cost))

    return { text: parts.length ? parts.join(' · ') : 'No usage readings yet.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenA))) return next(e)

    const limits = await read($, limitsA)
    const band: BandInput = {
      now: Math.max(await read($, nowA), 0) || (await $.clock.now()),
      fiveHour: limits?.fiveHour ?? null,
      sevenDay: limits?.sevenDay ?? null,
      context: await read($, contextA),
      costUsd: await read($, costA),
      tokens: await read($, tokensA),
    }
    const groups = buildGroups(band)
    if (groups.length === 0) return next(e)

    if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const { Box, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1}>
          {groups.map((g, gi) => (
            <Box key={`g${gi}`} flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
              {g.map(p => (
                <Svg key={p.alt.split(' ')[0]} source={pillSvg(p)} alt={p.alt} width={pillWidth(p)} height={24} isInteractive />
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    const TONE: Record<string, string> = {
      teal: 'cyan',
      violet: 'magenta',
      red: 'red',
      green: 'green',
      blue: 'blue',
      gold: 'yellow',
    }
    const LEVEL = { ok: 'green', warn: 'yellow', high: 'red' }

    const lim = (['5h', '7d'] as const).flatMap(label => {
      const l = label === '5h' ? band.fiveHour : band.sevenDay
      if (!l) return []
      const v = limitView(label, l, band.now)
      const cells = 10
      const filled = Math.round((Math.min(100, v.percent) / 100) * cells)
      const mark = v.elapsed === null ? -1 : Math.min(cells - 1, Math.floor(v.elapsed * cells))
      let bar = ''
      for (let i = 0; i < cells; i++) bar += i === mark ? '│' : i < filled ? '█' : '░'
      const tone = label === '5h' ? 'cyan' : 'magenta'
      return [
        <Text key={label}>
          <Text color={tone}>{label} </Text>
          <Text color={LEVEL[level(v.percent)]}>{bar}</Text>
          <Text color={tone} bold> {fmtPercent(v.percent)}</Text>
          {v.left ? <Text color={tone} dimColor> ⟲ {v.left}</Text> : null}
        </Text>,
      ]
    })
    const rest = groups
      .flat()
      .filter(p => p.tone !== 'teal' && p.tone !== 'violet')
      .map(p => {
        const glyph = p.tone === 'red' ? '↑' : p.tone === 'green' ? '↓' : p.tone === 'blue' ? '≡' : ''
        const text = p.segments.flatMap(s => (s.kind === 'text' ? [s.text] : [])).join(' ')
        return (
          <Text key={p.tone} color={TONE[p.tone]}>
            {glyph}
            {text}
          </Text>
        )
      })

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {lim}
        {rest}
      </Box>
    )
  })
}
