"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type TestRow = {
  id: string;
  name: string;
  is_finalized: boolean;
  created_at: string;
};

export default function AdminTestsPage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [tests, setTests] = useState<TestRow[]>([]);
  const [currentTestId, setCurrentTestId] = useState<string>("");

  const [newName, setNewName] = useState("");

  async function loadAll() {
    if (!sb) return;

    const { data: settings } = await sb
      .from("app_settings")
      .select("current_test_id")
      .eq("id", 1)
      .maybeSingle();

    const cur = String((settings as any)?.current_test_id ?? "");
    setCurrentTestId(cur);

    const { data: tData, error: tErr } = await sb
      .from("tests")
      .select("id, name, is_finalized, created_at")
      .order("created_at", { ascending: false });

    if (tErr) {
      setStatus(`Could not load tests: ${tErr.message}`);
      setTests([]);
      return;
    }

    setTests((tData ?? []) as any);
  }

  useEffect(() => {
    if (!sb) {
      setStatus(
        "Supabase is not configured. Check Vercel → Settings → Environment Variables.",
      );
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setStatus("");

      const { data: s } = await sb.auth.getSession();
      const session = s.session;

      if (!session) {
        router.replace("/login?next=/admin/tests");
        return;
      }

      if (cancelled) return;

      const emailLower = (session.user.email ?? "").toLowerCase().trim();
      setAdminEmail(emailLower);

      if (emailLower !== "riegardts@gmail.com") {
        setStatus("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      await loadAll();
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sb]);

  async function setCurrent(id: string) {
    if (!sb) return;

    setStatus("Setting current test…");
    const { error } = await sb
      .from("app_settings")
      .update({ current_test_id: id })
      .eq("id", 1);

    if (error) {
      setStatus(`❌ Could not set current test: ${error.message}`);
      return;
    }

    setStatus("✅ Current test updated.");
    await loadAll();
  }

  async function createTest() {
    if (!sb) return;

    const name = newName.trim();
    if (!name) {
      setStatus("Please enter a test name.");
      return;
    }

    setStatus("Creating test…");

    const { data, error } = await sb
      .from("tests")
      .insert({ name })
      .select("id")
      .single();

    if (error) {
      setStatus(`❌ Could not create test: ${error.message}`);
      return;
    }

    setNewName("");
    setStatus("✅ Created. Setting as current…");
    await setCurrent(String((data as any)?.id ?? ""));
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        maxWidth: 1000,
        minHeight: "100vh",
        background: "#0b1220",
        color: "#e5e7eb",
      }}
    >
      <div className="flex justify-end mb-3">
        <Link
          href="/"
          className="text-xs rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-900"
        >
          Home
        </Link>
      </div>

      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>Admin: Tests</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{adminEmail || "…"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            Admin Hub
          </Link>
          <Link href="/admin/tests/manage" style={{ textDecoration: "none" }}>
            Manage Questions
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : adminEmail !== "riegardts@gmail.com" ? (
        <p style={{ marginTop: 18, color: "crimson" }}>
          {status || "Admin only."}
        </p>
      ) : (
        <>
          <div
            style={{
              marginTop: 18,
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
              background: "#ffffff",
              color: "#111827",
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900 }}>Create new test</div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Mock March 2026"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                minWidth: 280,
              }}
            />
            <button
              onClick={createTest}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
              }}
            >
              Create & Set Current
            </button>

            <div style={{ marginLeft: "auto", opacity: 0.85, fontSize: 13 }}>
              {status}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>All tests</div>

            {tests.length === 0 ? (
              <p>No tests yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {tests.map((t) => {
                  const isCurrent = t.id === currentTestId;
                  return (
                    <div
                      key={t.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        background: isCurrent ? "#eef6ff" : "#fff",
                        color: "#111827",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>
                          {t.name}{" "}
                          {t.is_finalized ? (
                            <span style={{ color: "crimson" }}>
                              (Finalized)
                            </span>
                          ) : null}
                        </div>
                        <div
                          style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}
                        >
                          {isCurrent ? "Current test" : "Not current"} •
                          Created:{" "}
                          {t.created_at
                            ? new Date(t.created_at).toLocaleString()
                            : ""}
                        </div>
                      </div>

                      <button
                        onClick={() => setCurrent(t.id)}
                        disabled={isCurrent}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #333",
                          cursor: isCurrent ? "not-allowed" : "pointer",
                          opacity: isCurrent ? 0.5 : 1,
                        }}
                      >
                        Set Current
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
