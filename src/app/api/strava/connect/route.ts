import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { authorizeUrl, stravaConfigured } from "@/server/strava/client";

export const STATE_COOKIE = "strava_oauth_state";

/** Starts Strava OAuth. A random state in an httpOnly cookie guards the callback. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!stravaConfigured()) {
    return NextResponse.redirect(new URL("/?strava=unavailable", request.url));
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL(
    "/api/strava/callback",
    request.nextUrl.origin,
  ).toString();
  const response = NextResponse.redirect(authorizeUrl(redirectUri, state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/strava",
    maxAge: 600,
  });
  return response;
}
