import type * as Sentry from "@sentry/nextjs";

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

// Meals, weights and AI prompts are personal data. Keep them out of Sentry:
// errors and stack traces only, no bodies, cookies, headers or AI inputs.
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Sentry is off unless NEXT_PUBLIC_SENTRY_DSN is set.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
  },
} satisfies InitOptions;
