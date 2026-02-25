"use client";
// ===== ANCHOR: supabase-test-page-ts =====
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState("Running test...");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Query a table that doesn't exist yet.
        // Even an "expected error" proves we reached Supabase successfully.
        const { error } = await supabase
          .from("__supabase_connection_test__")
          .select("*")
          .limit(1);

        if (cancelled) return;

        if (error) {
          setStatus(
            `Connected to Supabase ✅ (expected error because test table doesn't exist): ${error.message}`,
          );
        } else {
          setStatus("Connected to Supabase ✅");
        }
      } catch (e: any) {
        if (cancelled) return;
        setStatus(`Something went wrong ❌: ${e?.message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        Supabase connection test
      </h1>
      <p style={{ marginTop: 12 }}>{status}</p>
    </main>
  );
}
