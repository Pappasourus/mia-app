"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AdminGate({
  children,
  nextPath,
}: {
  children: ReactNode;
  nextPath: string;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [status, setStatus] = useState("Checking admin access…");

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setStatus("Supabase not configured (missing env vars).");
        return;
      }

      let user = null;

      for (let i = 0; i < 10; i++) {
        const { data, error } = await supabase.auth.getUser();
        user = data?.user ?? null;

        if (user) break;

        // If there's a transient issue right after login, wait briefly and retry
        setStatus(`Waiting for user… (${i + 1}/10)`);
        await new Promise((r) => setTimeout(r, 200));

        // If Supabase reports an error, no need to keep retrying forever
        if (error) break;
      }

      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      // Admin check via allowlist table (RPC)
const { data: isAdmin, error: adminErr } = await supabase.rpc(
  "is_current_user_admin",
);

if (adminErr) {
  setStatus(`Admin check failed: ${adminErr.message}`);
  return;
}

if (!isAdmin) {
  router.replace("/");
  return;
}

      setOk(true);
      setStatus("✅ Admin access confirmed.");
    }

    run();
  }, [router, nextPath]);

  if (!ok) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-xl mx-auto text-xs text-slate-400">{status}</div>
      </main>
    );
  }

  return <>{children}</>;
}
