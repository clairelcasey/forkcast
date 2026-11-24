import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";

Sentry.init({
  ...sentryOptions,
  environment: process.env.VERCEL_ENV ?? "development",
});
