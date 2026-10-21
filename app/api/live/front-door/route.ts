import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { JiraniError } from '@/lib/jirani'
import { liveMode, liveViewGate, RingLiveError, startSession, stopSession } from '@/lib/live'

export const dynamic = 'force-dynamic'

// The middleware already requires sign-in; this is the camera, so check again here.
const signedOut = async () => !(await auth()).userId
const SIGN_IN = { error: 'Sign in required' }

function failure(e: unknown) {
  if (e instanceof RingLiveError) return NextResponse.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 })
  if (e instanceof JiraniError) return NextResponse.json({ error: e.message }, { status: 503 })
  console.error('live view error', e)
  return NextResponse.json({ error: 'The live view could not start.' }, { status: 500 })
}

/** Start a live view: Jirani's consent and level check first, then Ring's WHEP. Body: { sdpOffer }. */
export async function POST(request: NextRequest) {
  if (await signedOut()) return NextResponse.json(SIGN_IN, { status: 401 })
  try {
    const { sdpOffer } = (await request.json().catch(() => ({}))) as { sdpOffer?: unknown }
    if (typeof sdpOffer !== 'string' || !sdpOffer.startsWith('v=0')) {
      return NextResponse.json({ error: 'Missing SDP offer.' }, { status: 400 })
    }
    // Checked again here, not only on the page, so nobody can skip it.
    const gate = await liveViewGate()
    if (!gate.allowed) return NextResponse.json({ error: gate.text, refused: true }, { status: 403 })
    if (liveMode() !== 'live') {
      return NextResponse.json({ error: 'No Ring token is configured, so this demo shows a replay.' }, { status: 409 })
    }
    return NextResponse.json(await startSession(sdpOffer))
  } catch (e) {
    return failure(e)
  }
}

/** Close a live view. Body: { sessionUrl }. Closing is always allowed. */
export async function DELETE(request: NextRequest) {
  if (await signedOut()) return NextResponse.json(SIGN_IN, { status: 401 })
  try {
    const { sessionUrl } = (await request.json().catch(() => ({}))) as { sessionUrl?: unknown }
    if (typeof sessionUrl !== 'string') return NextResponse.json({ error: 'Missing sessionUrl.' }, { status: 400 })
    await stopSession(sessionUrl)
    return NextResponse.json({ closed: true })
  } catch (e) {
    return failure(e)
  }
}
