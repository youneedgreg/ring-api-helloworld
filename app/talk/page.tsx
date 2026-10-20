import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { getState } from '@/lib/jirani'
import { JiraniUnavailable } from '../(family)/components/ui'
import { VoiceClient } from './VoiceClient'

export const dynamic = 'force-dynamic'

/** Talk to Jirani by voice, as Margaret or as family, in English or Spanish. */
export default async function Talk() {
  let residentName: string
  try {
    residentName = (await getState()).household.residentName
  } catch (e) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-4">
        <JiraniUnavailable error={e} />
      </main>
    )
  }
  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-teal-800">Jirani</p>
            <p className="text-xs text-slate-500">talk to the neighbour who notices</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-medium text-teal-800 underline underline-offset-4">
              Dashboard
            </Link>
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-4">
        <VoiceClient residentName={residentName} />
      </main>
    </div>
  )
}
