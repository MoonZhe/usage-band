export type UsageLimit = { percentUsed: number; resetsAt: string | null }

export type UsageLimits = { fiveHour: UsageLimit | null; sevenDay: UsageLimit | null }

export type UsageContext = { tokens: number | null; window: number; percent: number | null }

export type UsageTokens = {
  uncachedInput: number
  cacheWrite: number
  output: number
  cacheRead: number
  requests: number
  /** True when counted from turn.complete instead of the transcript. */
  isApprox: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      limits: UsageLimits | null
      context: UsageContext | null
      costUsd: number | null
      tokens: UsageTokens | null
      fallback: UsageTokens | null
      isHidden: boolean
      now: number
    }
  }
}
