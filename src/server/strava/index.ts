import "server-only";
import {
  keepKnownCalories,
  toWorkoutRow,
  type StravaActivity,
} from "@/lib/strava/map";
import { createClient } from "@/lib/supabase/server";
import {
  deauthorize,
  getActivity,
  listActivities,
  refreshTokens,
  StravaError,
  STRAVA_SCOPE,
  type StravaTokens,
} from "./client";
import { decryptToken, encryptToken } from "./crypto";

// DB access path for tokens: the user's own session (RLS) calling the
// security-definer functions save_strava_connection / strava_tokens, which
// only touch auth.uid()'s row. No service-role key: the user is always
// signed in when connecting or syncing.

const SYNC_DAYS = 14;
/** Detailed fetches (for calorie estimates) per sync, to respect rate limits. */
const MAX_DETAIL_FETCHES = 10;

export type StravaStatus = {
  connected: boolean;
  lastSyncedAt: string | null;
};

export async function stravaStatus(userId: string): Promise<StravaStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("strava_connections")
    .select("last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    connected: Boolean(data),
    lastSyncedAt: data?.last_synced_at ?? null,
  };
}

export async function saveConnection(tokens: StravaTokens, scopes: string[]) {
  if (!tokens.athlete)
    throw new StravaError("Strava didn't return the athlete");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_strava_connection", {
    p_athlete_id: tokens.athlete.id,
    p_refresh_token_encrypted: encryptToken(tokens.refresh_token),
    p_access_token_encrypted: encryptToken(tokens.access_token),
    p_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    p_scopes: scopes.length ? scopes : [STRAVA_SCOPE],
  });
  if (error)
    throw new StravaError(`Couldn't save the connection (${error.code})`);
}

/** A valid access token, refreshed when it's about to expire. */
async function accessToken(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("strava_tokens");
  const row = data?.[0];
  if (error || !row) throw new StravaError("Not connected", 404);

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    return decryptToken(row.access_token_encrypted);
  }
  const fresh = await refreshTokens(decryptToken(row.refresh_token_encrypted));
  const { error: saveError } = await supabase.rpc("save_strava_connection", {
    p_athlete_id: row.athlete_id,
    p_refresh_token_encrypted: encryptToken(fresh.refresh_token),
    p_access_token_encrypted: encryptToken(fresh.access_token),
    p_expires_at: new Date(fresh.expires_at * 1000).toISOString(),
    p_scopes: [STRAVA_SCOPE],
  });
  if (saveError) throw new StravaError(`Couldn't save refreshed tokens`);
  return fresh.access_token;
}

export type SyncResult =
  | { ok: true; synced: number }
  | { ok: false; reconnect: boolean; error: string };

/** Pulls the last two weeks of activities into workouts (deduped by id). */
export async function syncStrava(userId: string): Promise<SyncResult> {
  const supabase = await createClient();
  try {
    const token = await accessToken();
    const after = Math.floor(Date.now() / 1000) - SYNC_DAYS * 86_400;
    const activities = await listActivities(token, after);

    // Runs need Strava's calorie estimate, which only the detailed activity
    // has. Fetch it for runs not already stored with one.
    const { data: known } = await supabase
      .from("workouts")
      .select("strava_activity_id, calories_estimate")
      .eq("user_id", userId)
      .not("strava_activity_id", "is", null);
    const knownCalories = new Map(
      (known ?? [])
        .filter((w) => w.calories_estimate !== null)
        .map((w) => [
          Number(w.strava_activity_id),
          Number(w.calories_estimate),
        ]),
    );
    const haveCalories = new Set(knownCalories.keys());
    const detailed: StravaActivity[] = [];
    let fetches = 0;
    for (const activity of activities) {
      const row = toWorkoutRow(activity);
      if (
        row.type === "run" &&
        !haveCalories.has(activity.id) &&
        fetches < MAX_DETAIL_FETCHES
      ) {
        fetches++;
        detailed.push(
          await getActivity(token, activity.id).catch(() => activity),
        );
      } else {
        detailed.push(activity);
      }
    }

    const rows = keepKnownCalories(
      detailed.map(toWorkoutRow),
      knownCalories,
    ).map((row) => ({ user_id: userId, ...row }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from("workouts")
        .upsert(rows, { onConflict: "user_id,strava_activity_id" });
      if (error)
        return {
          ok: false,
          reconnect: false,
          error: "Couldn't save workouts.",
        };
    }
    await supabase.rpc("mark_strava_synced");
    return { ok: true, synced: rows.length };
  } catch (err) {
    const status = err instanceof StravaError ? err.status : undefined;
    // 400/401 from the token endpoint: access was revoked or expired for good.
    const reconnect = status === 400 || status === 401 || status === 404;
    return {
      ok: false,
      reconnect,
      error: reconnect
        ? "Reconnect Strava to keep syncing."
        : "Couldn't reach Strava. Try again later.",
    };
  }
}

/** Revokes access on Strava and deletes the connection row. */
export async function disconnectStrava(userId: string) {
  try {
    await deauthorize(await accessToken());
  } catch {
    // Already revoked or unreachable: still remove our copy.
  }
  const supabase = await createClient();
  await supabase.from("strava_connections").delete().eq("user_id", userId);
}
