"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/brand/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <form
        className="panel space-y-3 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          const r = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
          if (r.ok) {
            router.replace("/");
            router.refresh();
          }
          else setErr((await r.json().catch(() => ({})))?.error ?? "Sign-in failed");
        }}
      >
        <div className="flex items-center gap-2">
          <LogoMark size={32} />
          <h1 className="font-display text-xl font-bold">Founder sign-in</h1>
        </div>
        <p className="text-sm text-muted">This deployment requires the access token set in SIMLIFE_ACCESS_TOKEN.</p>
        <label className="block text-sm">
          Access token
          <input type="password" className="field mt-1" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" required />
        </label>
        {err && (
          <p className="text-sm text-danger" role="alert">
            {err}
          </p>
        )}
        <button className="btn btn-primary w-full">Enter</button>
      </form>
    </div>
  );
}
