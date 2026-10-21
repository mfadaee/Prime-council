import { Suspense } from "react";
import { DiscoveryView } from "@/components/discoveries/DiscoveryView";

export const metadata = { title: "Discovery" };

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiscoveryView key={id} id={id} />;
}

export default function DiscoveryPage({ params }: PageProps<"/discoveries/[id]">) {
  return (
    <Suspense fallback={<div className="panel p-6 text-muted">Loading discovery…</div>}>
      <Loader params={params} />
    </Suspense>
  );
}
