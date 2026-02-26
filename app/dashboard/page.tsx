"use client";
// ===== ANCHOR: dashboard-page =====
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("Checking session...");

  useEffect(() => {
    let unsub: any = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const userEmail = data.session?.user?.email ?? null;

      if (!userEmail) {
        router.push("/login");
        return;
      }

      setEmail(userEmail);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        const e = session?.user?.email ?? null;
        if (!e) router.push("/login");
        else setEmail(e);
      });

      unsub = sub.subscription;
    })();

    return () => {
      if (unsub) unsub.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
      <p style={{ marginTop: 12 }}>
        Signed in as: <b>{email}</b>
      </p>

      <button
        onClick={handleSignOut}
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #333",
          cursor: "pointer",
        }}
      >
        Sign Out
      </button>
    </main>
  );
}
