const { withSentryConfig } = require('@sentry/nextjs/config')

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    return config
  },
}

// Source maps aren't uploaded (that needs a Sentry auth token in Vercel); stack traces show bundled code.
module.exports = withSentryConfig(nextConfig, {
  org: 'webtech-solutions-ke',
  project: 'jirani-dashboard',
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
})
