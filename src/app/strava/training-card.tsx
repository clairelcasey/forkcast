"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disconnectStravaAction,
  logPilatesToday,
  removePilatesToday,
  syncStravaNow,
} from "./actions";

const STALE_MS = 60 * 60 * 1000;

const NOTES: Record<string, string> = {
  connected: "Strava connected.",
  declined: "Strava wasn't connected.",
  "needs-activity-access": "Allow activity access on Strava to see your runs.",
  failed: "Couldn't connect Strava. Try again.",
  unavailable: "Strava isn't set up for this app yet.",
};

export function TrainingCard({
  stravaAvailable,
  connected,
  lastSyncedAt,
  pilatesToday,
  result,
}: {
  stravaAvailable: boolean;
  connected: boolean;
  lastSyncedAt: string | null;
  pilatesToday: boolean;
  /** ?strava=… after the Strava redirect. */
  result: string | null;
}) {
  const [note, setNote] = useState<string | null>(
    result ? (NOTES[result] ?? null) : null,
  );
  const [reconnect, setReconnect] = useState(false);
  const [pending, startTransition] = useTransition();

  // The note after the Strava redirect shows once; tidy the URL.
  useEffect(() => {
    if (result) window.history.replaceState(null, "", window.location.pathname);
  }, [result]);

  // Sync in the background when the last sync is over an hour old.
  useEffect(() => {
    if (!connected || !navigator.onLine) return;
    const last = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
    if (Date.now() - last < STALE_MS) return;
    startTransition(async () => {
      const result = await syncStravaNow();
      if (!result.ok && result.reconnect) setReconnect(true);
    });
  }, [connected, lastSyncedAt]);

  function sync() {
    startTransition(async () => {
      const result = await syncStravaNow();
      setReconnect(!result.ok && result.reconnect);
      setNote(result.ok ? "Synced." : result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Training</CardTitle>
        {stravaAvailable ? (
          <p className="text-sm text-muted-foreground">
            {connected && !reconnect
              ? `Strava connected${lastSyncedAt ? ` · synced ${ago(lastSyncedAt)}` : ""}`
              : connected
                ? "Reconnect Strava to keep syncing. Day types use manual entries until then."
                : "Connect Strava to set day types from your runs."}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {stravaAvailable && (!connected || reconnect) ? (
          <Button asChild size="lg">
            <a href="/api/strava/connect">
              {connected ? "Reconnect Strava" : "Connect Strava"}
            </a>
          </Button>
        ) : null}
        {connected && !reconnect ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={sync}
          >
            {pending ? "Syncing…" : "Sync now"}
          </Button>
        ) : null}

        {pilatesToday ? (
          <p className="flex items-center justify-between text-sm">
            <span>Pilates logged today.</span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              disabled={pending}
              onClick={() => startTransition(() => removePilatesToday())}
            >
              Remove
            </Button>
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => startTransition(() => logPilatesToday())}
          >
            I did Pilates
          </Button>
        )}

        {note ? (
          <p role="status" className="text-sm text-muted-foreground">
            {note}
          </p>
        ) : null}

        {connected ? (
          <Button
            type="button"
            variant="link"
            className="h-auto self-start p-0 text-muted-foreground"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Disconnect Strava? Synced workouts stay.")) {
                startTransition(() => disconnectStravaAction());
              }
            }}
          >
            Disconnect Strava
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
