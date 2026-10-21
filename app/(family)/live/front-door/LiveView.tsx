'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Phase =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'live'; left: number }
  | { kind: 'ended'; reason: string }
  | { kind: 'refused'; text: string }
  | { kind: 'error'; text: string }

/**
 * Ring WHEP live view, following Ring's docs: video only and recvonly (Ring supports
 * no sendrecv), handlers attached before the offer, the offer sent only after ICE
 * gathering finishes, and the session closed before Ring's time limit.
 */
export function LiveView({ residentName, seconds }: { residentName: string; seconds: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const sessionRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const close = useCallback((reason?: string) => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    const sessionUrl = sessionRef.current
    sessionRef.current = null
    if (sessionUrl) {
      // keepalive lets this finish even when the page is closing.
      fetch('/api/live/front-door', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionUrl }),
        keepalive: true,
      }).catch(() => {})
    }
    if (reason) setPhase({ kind: 'ended', reason })
  }, [])

  useEffect(() => {
    const onHide = () => close()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      close()
    }
  }, [close])

  const start = useCallback(async () => {
    close()
    setPhase({ kind: 'connecting' })
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc
      pc.ontrack = (e) => {
        const v = videoRef.current
        if (!v) return
        v.srcObject = e.streams[0] ?? new MediaStream([e.track])
        v.play().catch(() => {})
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') close('The connection to Ring dropped.')
      }
      pc.addTransceiver('video', { direction: 'recvonly' })
      await pc.setLocalDescription(await pc.createOffer())
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve()
        const giveUp = setTimeout(resolve, 3000)
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(giveUp)
            resolve()
          }
        })
      })

      const r = await fetch('/api/live/front-door', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdpOffer: pc.localDescription!.sdp }),
      })
      const body = await r.json().catch(() => ({}))
      if (pcRef.current !== pc) return // closed while waiting
      if (r.status === 403 && body.refused) {
        close()
        return setPhase({ kind: 'refused', text: body.error })
      }
      if (!r.ok) throw new Error(body.error ?? `The live view could not start (${r.status}).`)
      sessionRef.current = body.sessionUrl
      await pc.setRemoteDescription({ type: 'answer', sdp: body.sdpAnswer })

      // Close a little before Ring would, and say how long is left.
      const endsAt = Date.now() + (seconds - 2) * 1000
      setPhase({ kind: 'live', left: seconds - 2 })
      timerRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
        if (left === 0) close(`Ring limits a live view to ${seconds} seconds.`)
        else setPhase({ kind: 'live', left })
      }, 250)
    } catch (e) {
      close()
      setPhase({ kind: 'error', text: e instanceof Error ? e.message : 'The live view could not start.' })
    }
  }, [close, seconds])

  const busy = phase.kind === 'connecting' || phase.kind === 'live'

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="relative aspect-video bg-slate-900">
        <video ref={videoRef} className="h-full w-full object-contain" autoPlay muted playsInline aria-label={`Front door at ${residentName}'s home`} />
        <p className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
          Ring Developer Playground · simulated stream
        </p>
        {phase.kind === 'live' && (
          <p className="absolute right-2 top-2 rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white" aria-live="polite">
            Live · {phase.left}s left
          </p>
        )}
        {!busy && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-200">
            {phase.kind === 'idle' && 'The camera is off until you open it.'}
            {phase.kind === 'ended' && phase.reason}
            {phase.kind === 'refused' && phase.text}
            {phase.kind === 'error' && phase.text}
          </div>
        )}
        {phase.kind === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">Connecting to Ring…</div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-slate-500">Video only, no sound. Closes by itself after {seconds} seconds.</p>
        {busy ? (
          <button type="button" onClick={() => close('Closed.')} className="rounded-full bg-stone-200 px-4 py-2 text-sm font-semibold text-slate-800">
            Close
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={phase.kind === 'refused'}
            className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-stone-300"
          >
            {phase.kind === 'idle' ? 'Open the camera' : 'Look again'}
          </button>
        )}
      </div>
    </section>
  )
}
