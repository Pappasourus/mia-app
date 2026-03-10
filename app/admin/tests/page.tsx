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
  const [isAdmin, setIsAdmin] = useState(false);

  const [tests, setTests] = useState<TestRow[]>([]);
  const [currentTestId, setCurrentTestId] = useState<string>("");

  const [newName, setNewName] = useState("");
  // Delete flow (UI only for now)
  const [deleteId, setDeleteId] = useState<string>("");
  const [deleteName, setDeleteName] = useState<string>("");
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);

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

      const { data: adminOk, error: adminErr } = await sb.rpc(
        "is_current_user_admin",
      );

      if (adminErr) {
        setIsAdmin(false);
        setStatus(`Admin check failed: ${adminErr.message}`);
        setLoading(false);
        return;
      }

      if (!adminOk) {
        setIsAdmin(false);
        setStatus("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      setIsAdmin(true);
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

  function openDelete(t: TestRow) {
    setDeleteId(t.id);
    setDeleteName(t.name);
    setDeleteConfirmText("");
    setDeleteOpen(true);
    setStatus("");
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeleteId("");
    setDeleteName("");
    setDeleteConfirmText("");
    setStatus("");
  }

  async function confirmDelete() {
    if (!sb) return;

    if (!deleteId) {
      setStatus("❌ No test selected to delete.");
      return;
    }

    if (deleteConfirmText !== "DELETE") {
      setStatus("❌ Type DELETE to confirm.");
      return;
    }

    setStatus("Deleting test…");

    const { error } = await sb.rpc("admin_delete_test", {
      p_test_id: deleteId,
      p_confirm: "DELETE",
    });

    if (error) {
      setStatus(`❌ Delete failed: ${error.message}`);
      return;
    }

    setStatus("✅ Test deleted.");
    closeDelete();
    await loadAll();
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
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>
            Admin: Tests{" "}
            <span style={{ fontSize: 12, opacity: 0.6 }}>(preview)</span>
          </h1>
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
      ) : !isAdmin ? (
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

          {deleteOpen ? (
            <div
              style={{
                marginTop: 18,
                border: "1px solid #fecaca",
                borderRadius: 12,
                padding: 14,
                background: "#fff1f2",
                color: "#111827",
              }}
            >
              <div style={{ fontWeight: 900, color: "#991b1b" }}>
                Delete test (confirmation)
              </div>

              <div style={{ marginTop: 8, fontSize: 14 }}>
                You are about to delete: <b>{deleteName || "(unknown)"}</b>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                Type <b>DELETE</b> to enable the final delete button.
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    minWidth: 220,
                  }}
                />

                <button
                  onClick={confirmDelete}
                  disabled={deleteConfirmText !== "DELETE"}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #991b1b",
                    background:
                      deleteConfirmText === "DELETE" ? "#dc2626" : "#fca5a5",
                    color: "white",
                    cursor:
                      deleteConfirmText === "DELETE"
                        ? "pointer"
                        : "not-allowed",
                    fontWeight: 900,
                    opacity: deleteConfirmText === "DELETE" ? 1 : 0.7,
                  }}
                >
                  Confirm Delete
                </button>

                <button
                  onClick={closeDelete}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #333",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

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

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
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

                        <button
                          onClick={() => openDelete(t)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #991b1b",
                            background: "#fee2e2",
                            color: "#991b1b",
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                        >
                          Delete
                        </button>
                      </div>
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
