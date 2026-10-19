import { getDays, getReport, getState, type Day, type JiraniState, type WeeklyReport } from '@/lib/jirani'
import { RhythmCharts } from './RhythmCharts'
import { Card, JiraniUnavailable, PageTitle } from '../components/ui'

export const dynamic = 'force-dynamic'

export default async function Week() {
  let report: WeeklyReport, s: JiraniState, days: Day[]
  try {
    ;[report, s, days] = await Promise.all([getReport(), getState(), getDays().then((d) => d.days)])
  } catch (e) {
    return <JiraniUnavailable error={e} />
  }
  const flagged = report.metrics.filter((m) => m.flagged)
  const night = report.metrics.find((m) => m.key === 'nightBathroom')
  // The same 7 days the report calls "this week": the last ones it compares.
  const recentDates = days.filter((d) => d.counted).slice(-report.recentDays).map((d) => d.date)

  return (
    <>
      <PageTitle sub={`Week ending ${dayName(report.weekEnding)}: the last ${report.recentDays} lived-in days against ${report.priorDays} earlier ones.`}>
        {s.household.residentName}&apos;s week
      </PageTitle>

      <Card tone={flagged.length ? 'paused' : 'calm'}>
        <p className="font-semibold">{report.headline}</p>
        {report.suggestion && <p className="mt-2 text-sm">{report.suggestion}</p>}
      </Card>

      <Card title="Last 4 weeks">
        {night && (
          <p className="mb-3 text-sm text-slate-600">
            Night-time bathroom trips: about {night.recent} a night this week, {night.prior} a night in the earlier weeks.
          </p>
        )}
        <RhythmCharts days={days} recentDates={recentDates} />
      </Card>

      <Card title="Rhythm">
        <ul className="divide-y divide-stone-200">
          {report.metrics.map((m) => (
            <li key={m.key} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{m.label}</p>
                {m.flagged && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">Worth noticing</span>}
              </div>
              <p className="text-sm text-slate-600">{m.sentence}</p>
            </li>
          ))}
        </ul>
      </Card>

      <p className="px-1 text-xs text-slate-500">Jirani is not a medical device and never diagnoses. It describes changes so you can talk them through.</p>
    </>
  )
}

/** "2026-10-16" → "Fri 16 Oct" (a local calendar date, so read it at noon UTC). */
function dayName(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}
