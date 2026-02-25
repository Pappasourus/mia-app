"use client";
// ===== ANCHOR: supabase-test-page =====
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState("Running test...");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // We intentionally query a table that does NOT exist yet.
        // Getting an error back still proves we successfully reached Supabase.
        const { error } = await supabase
          .from("__supabase_connection_test__")
          .select("*")
          .limit(1);

        if (cancelled) return;

        if (error) {
          setStatus(
            `Connected to Supabase (expected error because the test table doesn't exist): ${error.message}`,
          );
        } else {
          setStatus(
            "Connected to Supabase (and the test table exists, which is also fine).",
          );
        }
      } catch (e) {
        if (cancelled) return;
        setStatus(`Something went wrong: ${e?.message ?? String(e)}`);
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
      <p style={{ marginTop: 24, opacity: 0.7 }}>
        When we build the real app, this page will be removed.
      </p>
    </main>
  );
}
