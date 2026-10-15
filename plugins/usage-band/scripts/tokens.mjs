// Sums assistant usage for one session transcript (and its subagents).
// usage: node tokens.mjs <sessionId> [previousSignature]
// Prints JSON: { sig, unchanged } or { sig, uncachedInput, cacheWrite, output, cacheRead, requests }.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [id, prevSig = ''] = process.argv.slice(2)
if (!id) {
  console.log(JSON.stringify({ error: 'no session id' }))
  process.exit(1)
}

const root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
const files = []
for (const dir of existsSync(root) ? readdirSync(root) : []) {
  const main = join(root, dir, `${id}.jsonl`)
  if (existsSync(main)) files.push(main)
  const subs = join(root, dir, id, 'subagents')
  if (existsSync(subs)) {
    for (const f of readdirSync(subs)) if (f.endsWith('.jsonl')) files.push(join(subs, f))
  }
}

const sig = files
  .map(f => {
    const s = statSync(f)
    return `${f}:${s.size}:${s.mtimeMs}`
  })
  .sort()
  .join('|')

if (files.length === 0) {
  console.log(JSON.stringify({ error: 'transcript not found' }))
  process.exit(1)
}
if (sig === prevSig) {
  console.log(JSON.stringify({ sig, unchanged: true }))
  process.exit(0)
}

// The same message is written once per content block: key on message.id + requestId, keep each field's max.
const byKey = new Map()
for (const f of files) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.includes('"assistant"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const u = row?.message?.usage
    if (row?.type !== 'assistant' || !u) continue
    const key = `${row.message.id ?? row.uuid}:${row.requestId ?? ''}`
    const prev = byKey.get(key) ?? { i: 0, w: 0, o: 0, r: 0 }
    byKey.set(key, {
      i: Math.max(prev.i, u.input_tokens ?? 0),
      w: Math.max(prev.w, u.cache_creation_input_tokens ?? 0),
      o: Math.max(prev.o, u.output_tokens ?? 0),
      r: Math.max(prev.r, u.cache_read_input_tokens ?? 0),
    })
  }
}

const out = { sig, uncachedInput: 0, cacheWrite: 0, output: 0, cacheRead: 0, requests: byKey.size }
for (const v of byKey.values()) {
  out.uncachedInput += v.i
  out.cacheWrite += v.w
  out.output += v.o
  out.cacheRead += v.r
}
console.log(JSON.stringify(out))
