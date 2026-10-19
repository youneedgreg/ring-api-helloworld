// Server-side client for Jirani's API (the local `pnpm mcp`, or the deployed ApiFn).
// Import it only from server components, route handlers and server actions: the API
// token is read from the environment here and must never reach the browser.

export interface LadderAction {
  type: 'log' | 'checkin_resident' | 'notify_contact' | 'offer_live_view' | 'suggest_emergency' | 'all_clear'
  to?: string
  message: string
}

export interface Escalation {
  id: string
  summary: string
  level: 0 | 1 | 2 | 3 | 4
  status: 'open' | 'resolved' | 'logged'
  openedAt: string
  history: { at: string; level: number; actions: LadderAction[]; note?: string }[]
  resolution?: { at: string; by: string; note: string }
}

export interface OutboxMessage {
  at: string
  escalationId: string
  to: string
  type: LadderAction['type']
  message: string
}

export interface JiraniState {
  now: string
  household: { id: string; residentName: string; timeZone: string }
  summary: {
    date: string
    lines: string[]
    facts: {
      upAt: string | null
      usualUpAt: string
      fridgeOpenings: number
      medicine: string[]
      trips: number
      visitors: number
      lastActivity: string | null
      openAlerts: number
      activeContext: string[]
    }
  }
  escalations: Escalation[]
  suppressed: { summary: string; reason: string }[]
  notices: { kind: string; message: string }[]
  outbox: OutboxMessage[]
  paused: { until: string } | null
}

export interface DriftMetric {
  key: 'nightBathroom' | 'wakeTime' | 'outings' | 'visitors'
  label: string
  recent: number
  prior: number
  z: number
  flagged: boolean
  sentence: string
}

export interface WeeklyReport {
  weekEnding: string
  recentDays: number
  priorDays: number
  metrics: DriftMetric[]
  headline: string
  suggestion?: string
}

export interface Plan {
  id: string
  kind: 'away' | 'late_start' | 'visitor_expected' | 'note'
  text: string
  startsAt: string
  endsAt: string
  createdBy: 'resident' | 'family'
}

export interface TimelineItem {
  at: string
  /** Local "7:12am". */
  time: string
  role: 'frontDoor' | 'fridge' | 'bathroom' | 'medicine' | 'doorbell'
  text: string
}

export interface Day {
  date: string
  weekday: number
  /** Minutes after local midnight; null if she wasn't up at home. */
  firstActivity: number | null
  nightBathroom: number
  outings: number
  visitors: number
  indoorCount: number
  away: boolean
  /** Whether the weekly report compares this day. */
  counted: boolean
}

export class JiraniError extends Error {}

function base(): string {
  const url = process.env.JIRANI_API_URL ?? 'http://127.0.0.1:3333/'
  return url.endsWith('/') ? url : `${url}/`
}

function headers(): Record<string, string> {
  const token = process.env.JIRANI_API_TOKEN
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
}

async function get<T>(path: string): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${base()}${path}`, { headers: headers(), cache: 'no-store' })
  } catch {
    // The URL helps in development; in production it would expose the API's address.
    throw new JiraniError(
      process.env.NODE_ENV === 'production'
        ? "Can't reach Jirani right now. Try again in a minute."
        : `Can't reach Jirani at ${base()}. Start it with "JIRANI_DEMO=1 pnpm mcp", or set JIRANI_API_URL.`,
    )
  }
  if (r.status === 401) throw new JiraniError('Jirani refused the API token. Check JIRANI_API_TOKEN.')
  if (!r.ok) throw new JiraniError(`Jirani answered ${r.status} for /${path}.`)
  return r.json() as Promise<T>
}

export const getState = () => get<JiraniState>('api/state')
export const getReport = () => get<WeeklyReport>('api/report')
export const getTimeline = () => get<{ date: string; items: TimelineItem[] }>('api/timeline')
export const getDays = () => get<{ timeZone: string; residentName: string; days: Day[] }>('api/days')

export type Speaker = 'resident' | 'family'
export type Lang = 'en' | 'es'

export interface AskAnswer {
  answer: string
  /** The MCP tools the agent called, in order. */
  toolCalls: { name: string; input: unknown }[]
}

/**
 * Ask Jirani's agent (Amazon Nova on Bedrock). JIRANI_ASK_URL is the deployed AskUrl;
 * locally `pnpm mcp` serves the same POST /ask next to its API. Each call costs a
 * fraction of a cent, so only signed-in people should reach it (D2 phase 2).
 */
export async function askJirani(question: string, speaker: Speaker, lang: Lang): Promise<AskAnswer> {
  const url = process.env.JIRANI_ASK_URL ?? `${base()}ask`
  const r = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ question, as: speaker, lang }),
    cache: 'no-store',
  }).catch(() => {
    throw new JiraniError("Can't reach Jirani's agent right now.")
  })
  if (r.status === 401) throw new JiraniError('Jirani refused the API token. Check JIRANI_API_TOKEN.')
  if (r.status === 404) throw new JiraniError('This Jirani has no agent. Run the latest `pnpm mcp`, or set JIRANI_ASK_URL.')
  if (!r.ok) throw new JiraniError('Jirani could not answer right now. Try again in a minute.')
  return r.json() as Promise<AskAnswer>
}

/** Call one of Jirani's MCP tools (stateless Streamable HTTP, JSON or SSE response). */
export async function callTool<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; data?: T; isError: boolean }> {
  const r = await fetch(`${base()}mcp`, {
    method: 'POST',
    headers: { ...headers(), accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    cache: 'no-store',
  }).catch(() => {
    throw new JiraniError("Can't reach Jirani right now.")
  })
  const raw = await r.text()
  if (!r.ok) throw new JiraniError(`Jirani answered ${r.status} for the ${name} tool.`)
  const json = raw.trimStart().startsWith('{') ? raw : raw.split('\n').find((l) => l.startsWith('data: '))?.slice(6)
  if (!json) throw new JiraniError(`Jirani's ${name} tool sent no result.`)
  const res = JSON.parse(json).result as { content: { text?: string }[]; structuredContent?: T; isError?: boolean }
  return { text: res.content.map((c) => c.text ?? '').join(' '), data: res.structuredContent, isError: !!res.isError }
}

/** "Mon 19 Oct, 10:47am" in the household's time zone. */
export function when(iso: string, timeZone: string, opts: { date?: boolean } = { date: true }): string {
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))
    .replace(' AM', 'am')
    .replace(' PM', 'pm')
  if (opts.date === false) return time
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
  return `${day}, ${time}`
}
