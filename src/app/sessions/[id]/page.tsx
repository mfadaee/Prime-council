import { Suspense } from "react";
import { SessionView } from "@/components/council/SessionView";
import { Composer } from "@/components/council/Composer";

export const metadata = { title: "Session" };

async function SessionLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionView key={id} sessionId={id} />;
}

export default function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="panel p-6 text-muted">Loading session…</div>}>
        <SessionLoader params={params} />
      </Suspense>
      <Composer compact />
    </div>
  );
}
