'use client'

import { useState } from 'react'
import type { Day } from '@/lib/jirani'

/**
 * The last 28 days as small charts on one shared day axis: night-time bathroom trips,
 * getting-up time (dots), front-door openings and visitors (bars). Separate charts,
 * never a dual axis: they have different units. One hue (validated against the light
 * surface); days the weekly report leaves out use a lighter step of it AND a text
 * label, so the difference never rests on color alone. Every value is also in the
 * table below.
 */

const HUE = '#2a78d6'
const SURFACE = '#fcfcfb'
const GRID = '#e1e0d9'
const BASELINE = '#c3c2b7'
const MUTED = '#898781'
const BAND = '#f0efec'

const W = 340
const H = 150
const PAD = { left: 30, right: 6, top: 18, bottom: 22 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const longDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const clock = (m: number) => {
  const h = Math.floor(m / 60) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${String(Math.round(m % 60)).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}
const leftOut = (d: Day) => (d.away ? 'away' : 'not compared')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Bar with a 4px rounded data-end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function RhythmCharts({ days, recentDates }: { days: Day[]; recentDates: string[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (days.length === 0) return <p className="text-sm text-slate-600">Not enough days recorded yet.</p>

  const band = plotW / days.length
  const barW = Math.min(24, Math.max(2, band - 2)) // 2px surface gap between neighbours
  const xAt = (i: number) => PAD.left + i * band
  const recent = new Set(recentDates)
  const recentIdx = days.map((d, i) => (recent.has(d.date) ? i : -1)).filter((i) => i >= 0)
  const weekBand = recentIdx.length ? { x: xAt(recentIdx[0]!), w: xAt(recentIdx.at(-1)!) + band - xAt(recentIdx[0]!) } : null
  const mondays = days.map((d, i) => (d.weekday === 1 ? i : -1)).filter((i) => i >= 0)

  // Getting up: morning hours only; a day that starts in the afternoon is labelled, not plotted.
  const mornings = days.filter((d) => d.firstActivity !== null && d.firstActivity < 12 * 60).map((d) => d.firstActivity!)
  const lo = Math.max(5 * 60, Math.floor((Math.min(...mornings, 7 * 60) - 30) / 60) * 60)
  const hi = Math.min(12 * 60, Math.ceil((Math.max(...mornings, 8 * 60) + 30) / 60) * 60)
  const yWake = (m: number) => PAD.top + ((m - lo) / (hi - lo)) * plotH // later = lower, like a day planner
  const wakeTicks = Array.from({ length: (hi - lo) / 60 + 1 }, (_, k) => lo + k * 60)

  const hovered = hover === null ? null : days[hover]!
  const leftOutDays = days.filter((d) => !d.counted)

  const frame = (ticks: { y: number; label: string }[]) => (
    <>
      {weekBand && <rect x={weekBand.x} y={PAD.top - 14} width={weekBand.w} height={plotH + 14} fill={BAND} rx={4} />}
      {weekBand && (
        <text x={weekBand.x + weekBand.w / 2} y={PAD.top - 4} textAnchor="middle" fontSize={10} fill={MUTED}>
          this week
        </text>
      )}
      {ticks.map((t) => (
        <g key={t.label}>
          <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} stroke={GRID} strokeWidth={1} />
          <text x={PAD.left - 4} y={t.y + 3.5} textAnchor="end" fontSize={10} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {t.label}
          </text>
        </g>
      ))}
      {mondays.map((i) => (
        <text key={i} x={xAt(i) + band / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
          {shortDate(days[i]!.date)}
        </text>
      ))}
    </>
  )

  // Each day's whole column is its hover/focus target, bigger than the mark.
  const hits = (label: (d: Day) => string) =>
    days.map((d, i) => (
      <rect
        key={d.date}
        x={xAt(i)}
        y={PAD.top - 14}
        width={band}
        height={plotH + 14}
        fill="transparent"
        tabIndex={0}
        role="img"
        aria-label={label(d)}
        onPointerEnter={() => setHover(i)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(i)}
        onBlur={() => setHover(null)}
        className="outline-none focus-visible:stroke-slate-900"
      />
    ))

  // A count per day as bars, on 0 .. a clean even max (at least `floor`).
  const countChart = (caption: string, value: (d: Day) => number, label: (d: Day) => string, floor = 2) => {
    const max = Math.max(floor, Math.ceil(Math.max(...days.map(value)) / 2) * 2)
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH
    const ticks = Array.from({ length: max / 2 + 1 }, (_, k) => k * 2)
    return (
      <figure className="mb-5">
        <figcaption className="mb-1 text-sm font-medium">{caption}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ background: SURFACE }}>
          {frame(ticks.map((t) => ({ y: y(t), label: String(t) })))}
          {days.map((d, i) => {
            const v = value(d)
            const x = xAt(i) + (band - barW) / 2
            return (
              <g key={d.date}>
                {v > 0 && <path d={barPath(x, y(v), barW, y(0) - y(v))} fill={HUE} opacity={d.counted ? 1 : 0.3} />}
              </g>
            )
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke={BASELINE} strokeWidth={1} />
          {hits((d) => `${longDate(d.date)}: ${label(d)}${d.counted ? '' : `, ${leftOut(d)}`}`)}
        </svg>
      </figure>
    )
  }

  return (
    <div>
      {countChart('Night-time bathroom trips, one bar per night', (d) => d.nightBathroom, (d) => plural(d.nightBathroom, 'night trip'), 4)}

      <figure className="mb-5">
        <figcaption className="mb-1 text-sm font-medium">Getting up, first activity each morning</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" style={{ background: SURFACE }}>
          {frame(wakeTicks.map((m) => ({ y: yWake(m), label: clock(m).replace(':00', '') })))}
          {days.map((d, i) => {
            const cx = xAt(i) + band / 2
            if (d.firstActivity === null || d.firstActivity >= hi) return null // named in the note below
            return <circle key={d.date} cx={cx} cy={yWake(d.firstActivity)} r={4} fill={HUE} opacity={d.counted ? 1 : 0.3} stroke={SURFACE} strokeWidth={2} />
          })}
          {hits((d) => `${longDate(d.date)}: up at ${d.firstActivity === null ? 'no activity' : clock(d.firstActivity)}${d.counted ? '' : `, ${leftOut(d)}`}`)}
        </svg>
      </figure>

      {countChart('Front-door openings each day (outings)', (d) => d.outings, (d) => plural(d.outings, 'front-door opening'))}
      {countChart('Visitors, doorbell presses each day', (d) => d.visitors, (d) => plural(d.visitors, 'visitor'))}

      {leftOutDays.length > 0 && (
        <p className="mt-1 text-xs text-slate-600">
          Pale marks are left out of the weekly comparison:{' '}
          {leftOutDays
            .map((d) => `${longDate(d.date)} (${d.away ? 'away' : 'not home in the morning'}${d.firstActivity !== null && d.firstActivity >= 12 * 60 ? `, first activity ${clock(d.firstActivity)}` : ''})`)
            .join(', ')}
          .
        </p>
      )}

      <div aria-live="polite" className="mt-2 min-h-10 rounded-xl bg-stone-100 px-3 py-2 text-sm">
        {hovered ? (
          <p>
            <strong className="font-semibold">{plural(hovered.nightBathroom, 'night trip')}</strong>
            {' · '}
            <strong className="font-semibold">up {hovered.firstActivity === null ? '—' : clock(hovered.firstActivity)}</strong>
            {' · '}
            <strong className="font-semibold">{plural(hovered.outings, 'door opening')}</strong>
            {' · '}
            <strong className="font-semibold">{plural(hovered.visitors, 'visitor')}</strong>
            <span className="text-slate-500">
              {' '}
              · {longDate(hovered.date)}
              {hovered.counted ? '' : ` · ${leftOut(hovered)}, not in the weekly comparison`}
            </span>
          </p>
        ) : (
          <p className="text-slate-500">Touch or hover a day for its numbers.</p>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-teal-800">Show as a table</summary>
        <table className="mt-2 w-full text-left text-xs sm:text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 pl-2 text-right font-medium">Night trips</th>
              <th className="py-1 pl-2 text-right font-medium">Up at</th>
              <th className="py-1 pl-2 text-right font-medium">Door</th>
              <th className="py-1 pl-2 text-right font-medium">Visitors</th>
              <th className="py-1 pl-2 font-medium">Compared</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...days].reverse().map((d) => (
              <tr key={d.date} className="border-t border-stone-200">
                <td className="py-1">{longDate(d.date)}</td>
                <td className="py-1 pl-2 text-right">{d.nightBathroom}</td>
                <td className="py-1 pl-2 text-right">{d.firstActivity === null ? '—' : clock(d.firstActivity)}</td>
                <td className="py-1 pl-2 text-right">{d.outings}</td>
                <td className="py-1 pl-2 text-right">{d.visitors}</td>
                <td className="py-1 pl-2 text-slate-600">{d.counted ? (recent.has(d.date) ? 'this week' : 'yes') : d.away ? 'away' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
