import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "../sentry.shared";

Sentry.init({
  ...sentryOptions,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
