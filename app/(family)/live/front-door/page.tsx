import Link from 'next/link'
import { getState, type JiraniState } from '@/lib/jirani'
import { liveMode, liveViewGate, SESSION_SECONDS, type Gate } from '@/lib/live'
import { Card, JiraniUnavailable, PageTitle } from '../../components/ui'
import { LiveView } from './LiveView'

export const dynamic = 'force-dynamic'

/** The page Jirani's view_front_door tool links to. Closed unless Jirani says it may open. */
export default async function FrontDoor() {
  let s: JiraniState
  let gate: Gate
  try {
    ;[s, gate] = await Promise.all([getState(), liveViewGate()])
  } catch (e) {
    return <JiraniUnavailable error={e} />
  }
  const name = s.household.residentName
  const mode = liveMode()

  return (
    <>
      <PageTitle sub={`Only during a serious alert, and only because ${name} agreed to it in advance.`}>Front door</PageTitle>
      {!gate.allowed ? (
        <Card title="Camera closed" tone="calm">
          <p className="text-[15px] leading-relaxed">{gate.text}</p>
          <p className="mt-3 text-sm">
            <Link href="/alerts" className="font-medium text-teal-800 underline">
              See the alerts
            </Link>
          </p>
        </Card>
      ) : (
        <>
          <Card tone="alert">
            {/* Jirani's own sentence says "Opening…", which would be wrong when nothing opens. */}
            <p className="text-[15px] leading-relaxed">
              {mode === 'live' ? gate.text : `Allowed now: ${name} agreed to this for a serious alert like this one.`}
            </p>
          </Card>
          {mode === 'live' ? (
            <LiveView residentName={name} seconds={SESSION_SECONDS} />
          ) : (
            <section className="mb-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="relative aspect-video bg-slate-900">
                {/* Recorded once from the Playground's live view through this page (21 Oct 2026), cropped to the stream. */}
                <video
                  src="/live/playground-replay.mp4"
                  className="h-full w-full object-contain"
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-label="Replay of the Ring Developer Playground's simulated stream"
                />
                <p className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
                  Replay · Ring Developer Playground simulated stream
                </p>
              </div>
              <div className="p-4">
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">Replay mode</h2>
                <p className="text-[15px] leading-relaxed">
                  This public demo has no Ring token, so no camera is connected. The video above was recorded from the Ring Developer
                  Playground&apos;s simulated stream through this page. With a Ring token, this page opens the front-door live view from
                  Ring for {SESSION_SECONDS} seconds at a time.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
