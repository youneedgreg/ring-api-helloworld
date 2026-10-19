import { NextResponse } from 'next/server'
import { askJirani, JiraniError, type Lang, type Speaker } from '@/lib/jirani'

/**
 * The voice client's only door to Jirani: the browser posts the words it heard here,
 * and this route calls the agent with the API token, which never leaves the server.
 * Not signed-in yet (D2 phase 2 adds Clerk), so keep this off public URLs until then:
 * every question is a paid Amazon Nova call.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { question?: unknown; as?: unknown; lang?: unknown } | null
  const question = typeof b?.question === 'string' ? b.question.trim() : ''
  const speaker = b?.as === 'resident' || b?.as === 'family' ? (b.as as Speaker) : null
  const lang = b?.lang === 'en' || b?.lang === 'es' ? (b.lang as Lang) : null
  if (!question || question.length > 1000 || !speaker || !lang) {
    return NextResponse.json({ error: 'Send {question, as: "resident" | "family", lang: "en" | "es"}.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await askJirani(question, speaker, lang))
  } catch (e) {
    const message = e instanceof JiraniError ? e.message : 'Something went wrong talking to Jirani.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
