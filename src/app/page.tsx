import { Suspense } from "react";
import { ServiceWorker } from "./service-worker";
import { SignOutButton } from "./sign-out-button";
import { Today, TodaySkeleton } from "./today";

// Home screen: the log box, then today's remaining targets and meals.
export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ strava?: string | string[] }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Forkcast</h1>
        <SignOutButton />
      </header>

      <Suspense fallback={<TodaySkeleton />}>
        <Today searchParams={searchParams} />
      </Suspense>
      <ServiceWorker />
    </main>
  );
}
