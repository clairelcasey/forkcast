// Unauthenticated liveness check for uptime monitors and deploy checks.
export function GET() {
  return Response.json({ ok: true });
}
