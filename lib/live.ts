// Server-only helpers for the family's front-door live view. Two rules, checked here
// on every request, never in the browser:
//  1. Jirani decides whether the camera may open (view_front_door: only during an
//     open level 3+ alert, and only if the resident agreed in advance).
//  2. The Ring token and the device id stay on the server.
import { getAccessToken, getAuthMode } from '@/lib/auth'
import { callTool } from '@/lib/jirani'

export const RING_API = 'https://api.amazonvision.com'

/** Ring ends a live session after 30 s on battery devices (60 s wired); assume the shorter one. */
export const SESSION_SECONDS = 30

/** "live" streams from Ring (a Playground token is set); "replay" is the default for the public demo. */
export type LiveMode = 'live' | 'replay'

export function liveMode(): LiveMode {
  return getAuthMode() ? 'live' : 'replay'
}

export interface Gate {
  allowed: boolean
  /** Jirani's own sentence, e.g. why the camera is closed. */
  text: string
}

export async function liveViewGate(): Promise<Gate> {
  const r = await callTool<{ allowed?: boolean }>('view_front_door')
  return { allowed: !r.isError && r.data?.allowed === true, text: r.text }
}

/** RING_FRONT_DOOR_DEVICE_ID, or the first device on the account (the Playground has one). */
async function frontDoorDeviceId(token: string): Promise<string> {
  if (process.env.RING_FRONT_DOOR_DEVICE_ID) return process.env.RING_FRONT_DOOR_DEVICE_ID
  const r = await fetch(`${RING_API}/v1/devices`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!r.ok) throw new RingLiveError(r.status, `Ring answered ${r.status} when listing devices.`)
  const id = (await r.json())?.data?.[0]?.id
  if (typeof id !== 'string') throw new RingLiveError(404, 'This Ring account has no devices.')
  return id
}

export class RingLiveError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Send the browser's SDP offer to Ring's WHEP endpoint; returns the answer and the session URL. */
export async function startSession(sdpOffer: string): Promise<{ sdpAnswer: string; sessionUrl: string }> {
  const token = await getAccessToken()
  const deviceId = await frontDoorDeviceId(token)
  const r = await fetch(`${RING_API}/v1/devices/${encodeURIComponent(deviceId)}/media/streaming/whep/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
    body: sdpOffer,
    cache: 'no-store',
  })
  if (!r.ok) {
    // An expired Playground token (they last 30 minutes) shows up as 401.
    const hint = r.status === 401 ? ' The Ring token has probably expired.' : ''
    throw new RingLiveError(r.status, `Ring answered ${r.status} when starting the live view.${hint}`)
  }
  const location = r.headers.get('location')
  if (!location) throw new RingLiveError(502, 'Ring started the live view but sent no session URL.')
  return { sdpAnswer: await r.text(), sessionUrl: new URL(location, RING_API).toString() }
}

/**
 * Close a session. Only Ring WHEP session URLs are accepted, so this route can never
 * be used to send the Ring token anywhere else.
 */
export async function stopSession(sessionUrl: string): Promise<void> {
  if (!isWhepSessionUrl(sessionUrl)) throw new RingLiveError(400, 'Not a Ring live-view session.')
  const token = await getAccessToken()
  await fetch(sessionUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
}

export function isWhepSessionUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === RING_API && /^\/v1\/devices\/[^/]+\/media\/streaming\/whep\/sessions\/[^/]+$/.test(u.pathname) && !u.search
  } catch {
    return false
  }
}
