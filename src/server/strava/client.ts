import { z } from "zod";
import type { StravaActivity } from "@/lib/strava/map";

// Strava API (https://developers.strava.com/docs/). Server-only: the client
// secret and tokens never reach the browser.

/** Overridable only to test against a local fake server. */
const BASE = () => process.env.STRAVA_BASE_URL ?? "https://www.strava.com";
/** Read all activities, including private ones (needed for every run). */
export const STRAVA_SCOPE = "activity:read_all";

export class StravaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "StravaError";
  }
}

function credentials() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new StravaError(
      "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not set.",
    );
  }
  return { clientId, clientSecret };
}

export function stravaConfigured() {
  return Boolean(
    process.env.STRAVA_CLIENT_ID &&
    process.env.STRAVA_CLIENT_SECRET &&
    process.env.TOKEN_ENCRYPTION_KEY,
  );
}

export function authorizeUrl(redirectUri: string, state: string) {
  const url = new URL("/oauth/authorize", BASE());
  url.search = new URLSearchParams({
    client_id: credentials().clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  athlete: z.object({ id: z.number() }).optional(),
});

export type StravaTokens = z.infer<typeof tokenSchema>;

async function tokenRequest(
  body: Record<string, string>,
): Promise<StravaTokens> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(new URL("/oauth/token", BASE()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new StravaError(`Strava token request failed`, response.status);
  }
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new StravaError("Unexpected Strava token response");
  return parsed.data;
}

export const exchangeCode = (code: string) =>
  tokenRequest({ code, grant_type: "authorization_code" });

export const refreshTokens = (refreshToken: string) =>
  tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

async function api<T>(path: string, accessToken: string, schema: z.ZodType<T>) {
  const response = await fetch(new URL(`/api/v3${path}`, BASE()), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new StravaError(`Strava ${path} failed`, response.status);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success)
    throw new StravaError(`Unexpected Strava ${path} response`);
  return parsed.data;
}

const activitySchema = z.object({
  id: z.number(),
  sport_type: z.string().optional(),
  type: z.string().optional(),
  start_date: z.string(),
  start_date_local: z.string(),
  distance: z.number().optional(),
  moving_time: z.number().optional(),
  elapsed_time: z.number().optional(),
  calories: z.number().optional(),
});

/** Activities that started after `afterEpoch` (seconds). */
export function listActivities(
  accessToken: string,
  afterEpoch: number,
): Promise<StravaActivity[]> {
  return api(
    `/athlete/activities?after=${afterEpoch}&per_page=100`,
    accessToken,
    z.array(activitySchema),
  );
}

/** The detailed activity, which includes Strava's calorie estimate. */
export function getActivity(
  accessToken: string,
  id: number,
): Promise<StravaActivity> {
  return api(`/activities/${id}`, accessToken, activitySchema);
}

/** Revokes the app's access on Strava's side. Best effort. */
export async function deauthorize(accessToken: string) {
  await fetch(new URL("/oauth/deauthorize", BASE()), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
