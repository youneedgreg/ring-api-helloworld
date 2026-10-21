// Shared by the server and edge Sentry setups (not the browser, to keep pages light). Sentry is on only when
// SENTRY_DSN is set, and sends stack traces only: no tracing, no
// replays, and none of the page's data (Margaret's day, questions, answers).
const dsn = process.env.SENTRY_DSN

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? 'development',
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
  },
}
