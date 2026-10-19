'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Voice client: the browser's Web Speech API listens and speaks; the words go to
 * /api/talk, which asks Jirani's agent (Amazon Nova on Bedrock). Under every answer
 * it lists the MCP tools the agent called, so you can see what Jirani actually did.
 * Typing works too, for browsers that can't listen.
 */

type Speaker = 'resident' | 'family'
type Lang = 'en' | 'es'
interface ToolCall {
  name: string
  input: unknown
}
interface Turn {
  id: number
  speaker: Speaker
  lang: Lang
  question: string
  answer?: string
  toolCalls?: ToolCall[]
  error?: string
}

// The Web Speech API's recognizer isn't in TypeScript's DOM types; this is the part we use.
interface Recognizer {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognizerCtor = new () => Recognizer
const recognizerCtor = (): RecognizerCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const VOICE_LANG: Record<Lang, string> = { en: 'en-US', es: 'es-US' }

const T = {
  en: {
    who: 'Who is speaking?',
    family: 'Family',
    language: 'Language',
    tap: 'Tap and speak',
    listening: 'Listening… tap to stop',
    thinking: 'Jirani is thinking…',
    type: 'Or type a question',
    ask: 'Ask',
    speak: 'Speak answers aloud',
    try: 'Try saying',
    tools: "Jirani's MCP server",
    noTools: 'No tools called',
    cantListen: "This browser can't listen. Type instead (Chrome works best).",
    micBlocked: 'The microphone is blocked. Allow it for this site, or type instead.',
    notHeard: "I didn't catch that. Tap and try again.",
    privacy:
      "Your browser turns your voice into text (Chrome uses Google's speech service for this). Jirani only receives the text: never audio, never video.",
  },
  es: {
    who: '¿Quién habla?',
    family: 'Familia',
    language: 'Idioma',
    tap: 'Toca y habla',
    listening: 'Escuchando… toca para parar',
    thinking: 'Jirani está pensando…',
    type: 'O escribe una pregunta',
    ask: 'Preguntar',
    speak: 'Leer las respuestas en voz alta',
    try: 'Prueba a decir',
    tools: 'Servidor MCP de Jirani',
    noTools: 'Sin herramientas',
    cantListen: 'Este navegador no puede escuchar. Escribe tu pregunta (Chrome funciona mejor).',
    micBlocked: 'El micrófono está bloqueado. Permítelo para este sitio o escribe tu pregunta.',
    notHeard: 'No te entendí. Toca e inténtalo de nuevo.',
    privacy:
      'Tu navegador convierte tu voz en texto (Chrome usa el servicio de voz de Google). Jirani solo recibe el texto: nunca audio ni vídeo.',
  },
} satisfies Record<Lang, Record<string, string>>

const SUGGESTIONS: Record<Speaker, Record<Lang, string[]>> = {
  resident: {
    en: ["I'm at my sister's this weekend, back Sunday evening", "I'm fine, thank you", 'Jirani, pause for two hours'],
    es: ['Este fin de semana estoy en casa de mi hermana, vuelvo el domingo por la tarde', 'Estoy bien, gracias', 'Jirani, pausa dos horas'],
  },
  family: {
    en: ["How's Mum today?", 'Why did you alert me?', 'How was her week?'],
    es: ['¿Cómo está mamá hoy?', '¿Por qué me avisaste?', '¿Qué tal su semana?'],
  },
}

export function VoiceClient({ residentName }: { residentName: string }) {
  const [speaker, setSpeaker] = useState<Speaker>('resident')
  const [lang, setLang] = useState<Lang>('en')
  const [speakAloud, setSpeakAloud] = useState(true)
  const [canListen, setCanListen] = useState<boolean | null>(null)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const busy = turns.some((t) => !t.answer && !t.error)
  const recognizer = useRef<Recognizer | null>(null)
  const nextId = useRef(1)
  const t = T[lang]
  const big = speaker === 'resident'

  useEffect(() => setCanListen(!!recognizerCtor()), [])
  // Stop listening and talking when leaving the page.
  useEffect(
    () => () => {
      recognizer.current?.stop()
      window.speechSynthesis?.cancel()
    },
    [],
  )

  function say(text: string, l: Lang) {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = VOICE_LANG[l]
    const voice = synth.getVoices().find((v) => v.lang.replace('_', '-').startsWith(VOICE_LANG[l])) ?? synth.getVoices().find((v) => v.lang.startsWith(l))
    if (voice) u.voice = voice
    u.rate = 0.95
    synth.speak(u)
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const id = nextId.current++
    const turn: Turn = { id, speaker, lang, question: q }
    setTurns((ts) => [turn, ...ts])
    setNotice(null)
    const update = (patch: Partial<Turn>) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    try {
      const r = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, as: turn.speaker, lang: turn.lang }),
      })
      const body = (await r.json()) as { answer?: string; toolCalls?: ToolCall[]; error?: string }
      if (!r.ok || typeof body.answer !== 'string') throw new Error(body.error ?? `Jirani answered ${r.status}.`)
      update({ answer: body.answer, toolCalls: body.toolCalls ?? [] })
      if (speakAloud) say(body.answer, turn.lang)
    } catch (e) {
      update({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  function toggleListening() {
    if (listening) return recognizer.current?.stop()
    const Ctor = recognizerCtor()
    if (!Ctor) return setNotice(t.cantListen)
    window.speechSynthesis?.cancel() // don't let Jirani hear itself
    const rec = new Ctor()
    rec.lang = VOICE_LANG[lang]
    rec.interimResults = true
    rec.continuous = false
    let final = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      setHeard(final || interim)
    }
    rec.onerror = (e) => setNotice(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? t.micBlocked : e.error === 'no-speech' ? t.notHeard : `${t.notHeard} (${e.error})`)
    rec.onend = () => {
      setListening(false)
      setHeard('')
      recognizer.current = null
      if (final.trim()) void ask(final)
    }
    recognizer.current = rec
    setHeard('')
    setNotice(null)
    setListening(true)
    rec.start()
  }

  const choice = (active: boolean) =>
    `min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold ${active ? 'bg-teal-800 text-white' : 'bg-white text-slate-700 ring-1 ring-stone-300'}`

  return (
    <div lang={lang}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.who}</legend>
          <div className="flex gap-2">
            <button type="button" aria-pressed={speaker === 'resident'} onClick={() => setSpeaker('resident')} className={choice(speaker === 'resident')}>
              {residentName}
            </button>
            <button type="button" aria-pressed={speaker === 'family'} onClick={() => setSpeaker('family')} className={choice(speaker === 'family')}>
              {t.family}
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.language}</legend>
          <div className="flex gap-2">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} className={choice(lang === 'en')} lang="en">
              English
            </button>
            <button type="button" aria-pressed={lang === 'es'} onClick={() => setLang('es')} className={choice(lang === 'es')} lang="es">
              Español
            </button>
          </div>
        </fieldset>
      </div>

      <div className="mb-4 flex flex-col items-center rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={toggleListening}
          disabled={busy || canListen === false}
          aria-pressed={listening}
          className={`flex h-28 w-28 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-40 ${
            listening ? 'animate-pulse bg-rose-600' : 'bg-teal-800'
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
          </svg>
          <span className="sr-only">{listening ? t.listening : t.tap}</span>
        </button>
        <p aria-live="polite" className={`mt-3 min-h-7 text-center ${big ? 'text-xl' : 'text-base'} font-medium`}>
          {busy ? t.thinking : listening ? heard || t.listening : canListen === false ? t.cantListen : t.tap}
        </p>
        {notice && <p className="mt-1 text-center text-sm text-rose-700">{notice}</p>}

        <form
          className="mt-4 flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void ask(typed)
            setTyped('')
          }}
        >
          <label className="sr-only" htmlFor="typed">
            {t.type}
          </label>
          <input
            id="typed"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t.type}
            maxLength={1000}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 text-base"
          />
          <button type="submit" disabled={busy || !typed.trim()} className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-40">
            {t.ask}
          </button>
        </form>

        <div className="mt-3 w-full">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.try}</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS[speaker][lang].map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => void ask(s)} className="rounded-full bg-stone-100 px-3 py-1.5 text-left text-sm text-slate-700 disabled:opacity-40">
                “{s}”
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 self-start text-sm text-slate-600">
          <input type="checkbox" checked={speakAloud} onChange={(e) => setSpeakAloud(e.target.checked)} className="h-4 w-4 accent-teal-800" />
          {t.speak}
        </label>
      </div>

      <ol className="space-y-3">
        {turns.map((turn) => (
          <li key={turn.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" lang={turn.lang}>
            <p className="text-sm text-slate-500">
              {turn.speaker === 'resident' ? residentName : T[turn.lang].family}: “{turn.question}”
            </p>
            {turn.error ? (
              <p className="mt-2 text-sm text-rose-700">{turn.error}</p>
            ) : turn.answer === undefined ? (
              <p className="mt-2 text-slate-500">{T[turn.lang].thinking}</p>
            ) : (
              <>
                <p className={`mt-2 ${turn.speaker === 'resident' ? 'text-xl' : 'text-base'}`}>{turn.answer}</p>
                <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-teal-300">{T[turn.lang].tools}</p>
                  {turn.toolCalls && turn.toolCalls.length > 0 ? (
                    <ul className="space-y-1">
                      {turn.toolCalls.map((c, i) => (
                        <li key={i} className="break-words">
                          <span className="text-slate-400">tools/call</span> <span className="font-semibold text-white">{c.name}</span>{' '}
                          {c.input && Object.keys(c.input as object).length > 0 ? <span className="text-slate-300">{JSON.stringify(c.input)}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-400">{T[turn.lang].noTools}</p>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ol>

      <p className="mt-6 text-xs text-slate-500">{t.privacy}</p>
    </div>
  )
}
