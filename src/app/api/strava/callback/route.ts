import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { exchangeCode } from "@/server/strava/client";
import { saveConnection, syncStrava } from "@/server/strava";
import { STATE_COOKIE } from "../connect/route";

const READ_SCOPES = ["activity:read", "activity:read_all"];

function sameState(a: string | undefined, b: string | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Strava redirects here after the user approves (or declines) access. */
export async function GET(request: NextRequest) {
  const home = (result: string) => {
    const response = NextResponse.redirect(
      new URL(`/?strava=${result}`, request.url),
    );
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/strava" });
    return response;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const params = request.nextUrl.searchParams;
  if (
    !sameState(request.cookies.get(STATE_COOKIE)?.value, params.get("state"))
  ) {
    return home("failed");
  }
  if (params.get("error")) return home("declined");

  const code = params.get("code");
  const scopes = (params.get("scope") ?? "").split(",").filter(Boolean);
  if (!code || !scopes.some((s) => READ_SCOPES.includes(s))) {
    // Activity access is needed to see runs; ask again.
    return home("needs-activity-access");
  }

  try {
    await saveConnection(await exchangeCode(code), scopes);
  } catch {
    return home("failed");
  }
  await syncStrava(user.id);
  return home("connected");
}
