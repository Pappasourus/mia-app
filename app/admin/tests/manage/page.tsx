"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  marks: number;
  prompt: string;
};

type TestRow = {
  id: string;
  name: string;
  is_finalized: boolean;
};

export default function AdminTestManagePage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [currentTest, setCurrentTest] = useState<TestRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortOrderByQid, setSortOrderByQid] = useState<Record<string, number>>(
    {},
  );

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
  const includedQuestions = useMemo(() => {
    const arr = questions.filter((q) => selectedIds.has(q.id));
    arr.sort((a, b) => {
      const ao = sortOrderByQid[a.id] ?? a.question_number ?? 0;
      const bo = sortOrderByQid[b.id] ?? b.question_number ?? 0;
      return ao - bo;
    });
    return arr;
  }, [questions, selectedIds, sortOrderByQid]);

  async function loadAll() {
    if (!sb) return;

    // current test id
    const { data: settings, error: sErr } = await sb
      .from("app_settings")
      .select("current_test_id")
      .eq("id", 1)
      .maybeSingle();

    if (sErr) {
      setStatus(`Could not load app settings: ${sErr.message}`);
      return;
    }

    const testId = String((settings as any)?.current_test_id ?? "");
    if (!testId) {
      setStatus("No current test selected. Go to Admin → Tests and set one.");
      setCurrentTest(null);
      return;
    }

    // test details
    const { data: t, error: tErr } = await sb
      .from("tests")
      .select("id, name, is_finalized")
      .eq("id", testId)
      .maybeSingle();

    if (tErr) {
      setStatus(`Could not load test: ${tErr.message}`);
      return;
    }

    setCurrentTest((t as any) ?? null);

    // all questions
    const { data: qData, error: qErr } = await sb
      .from("questions")
      .select("id, question_number, title, marks, prompt")
      .order("question_number", { ascending: true });

    if (qErr) {
      setStatus(`Could not load questions: ${qErr.message}`);
      setQuestions([]);
      return;
    }
    setQuestions((qData ?? []) as any);

    // current selections
    const { data: tqData, error: tqErr } = await sb
      .from("test_questions")
      .select("question_id, sort_order")
      .eq("test_id", testId)
      .order("sort_order", { ascending: true });

    if (tqErr) {
      setStatus(`Could not load test questions: ${tqErr.message}`);
      setSelectedIds(new Set());
      return;
    }

    const set = new Set<string>(
      (tqData ?? []).map((r: any) => String(r.question_id)),
    );
    setSelectedIds(set);
    const orderMap: Record<string, number> = {};
    for (const r of tqData ?? []) {
      const qid = String((r as any)?.question_id ?? "");
      const so = Number((r as any)?.sort_order ?? 0);
      if (qid) orderMap[qid] = so;
    }
    setSortOrderByQid(orderMap);

    setStatus("");
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

      const { data: s } = await sb.auth.getSession();
      const session = s.session;

      if (!session) {
        router.replace("/login?next=/admin/tests/manage");
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

  async function toggleQuestion(qid: string, checked: boolean) {
    if (!sb) return;
    if (!currentTest) return;

    if (currentTest.is_finalized) {
      setStatus("❌ This test is finalized. You can’t change its questions.");
      return;
    }

    setStatus("Saving…");

    if (checked) {
      const nextSortOrder =
        includedQuestions.length > 0
          ? Math.max(
              ...includedQuestions.map((q) => sortOrderByQid[q.id] ?? 0),
            ) + 1
          : 1;

      const { error } = await sb.from("test_questions").upsert(
        {
          test_id: currentTest.id,
          question_id: qid,
          sort_order: nextSortOrder,
        },
        { onConflict: "test_id,question_id" },
      );

      if (error) {
        setStatus(`❌ Could not add: ${error.message}`);
        return;
      }

      setSelectedIds((prev) => new Set(prev).add(qid));
      setStatus("✅ Updated");
    } else {
      const { error } = await sb
        .from("test_questions")
        .delete()
        .eq("test_id", currentTest.id)
        .eq("question_id", qid);

      if (error) {
        setStatus(`❌ Could not remove: ${error.message}`);
        return;
      }

      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(qid);
        return n;
      });
      setStatus("✅ Updated");
    }
  }

  async function moveQuestion(qid: string, direction: "up" | "down") {
    if (!sb) return;
    if (!currentTest) return;

    if (currentTest.is_finalized) {
      setStatus("❌ This test is finalized. You can’t reorder questions.");
      return;
    }

    const list = includedQuestions;
    const idx = list.findIndex((q) => q.id === qid);
    if (idx === -1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const a = list[idx];
    const b = list[swapIdx];

    const aOrder = sortOrderByQid[a.id] ?? a.question_number ?? 0;
    const bOrder = sortOrderByQid[b.id] ?? b.question_number ?? 0;

    setStatus("Reordering…");

    // swap the two sort_order values
    const { error: err1 } = await sb
      .from("test_questions")
      .update({ sort_order: bOrder })
      .eq("test_id", currentTest.id)
      .eq("question_id", a.id);

    if (err1) {
      setStatus(`❌ Could not reorder: ${err1.message}`);
      return;
    }

    const { error: err2 } = await sb
      .from("test_questions")
      .update({ sort_order: aOrder })
      .eq("test_id", currentTest.id)
      .eq("question_id", b.id);

    if (err2) {
      setStatus(`❌ Could not reorder: ${err2.message}`);
      return;
    }

    // update local map
    setSortOrderByQid((prev) => ({
      ...prev,
      [a.id]: bOrder,
      [b.id]: aOrder,
    }));

    setStatus("✅ Reordered");
  }
  function snippet(s: string, max = 120) {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }
  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        maxWidth: 1100,
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
            Manage Test Questions
          </h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{adminEmail || "…"}</b>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
            Current test: <b>{currentTest ? currentTest.name : "—"}</b>{" "}
            {currentTest?.is_finalized ? (
              <span style={{ color: "#fca5a5" }}>(Finalized)</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/admin/tests"
            style={{ textDecoration: "none", color: "#e5e7eb" }}
          >
            ← Back to Tests
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : !isAdmin ? (
        <p style={{ marginTop: 18, color: "#fca5a5" }}>
          {status || "Admin only."}
        </p>
      ) : !currentTest ? (
        <p style={{ marginTop: 18, color: "#fca5a5" }}>
          {status || "No current test."}
        </p>
      ) : (
        <>
          <div
            style={{
              marginTop: 18,
              border: "1px solid #23324a",
              borderRadius: 12,
              padding: 14,
              background: "#0f1b31",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 900 }}>
              Included questions: {selectedCount}
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                Included questions (ordered)
              </div>

              {includedQuestions.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  No questions included yet. Tick checkboxes below to add them.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {includedQuestions.map((q, i) => (
                    <div
                      key={q.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        background: "#ffffff",
                        color: "#111827",
                        border: "1px solid #23324a",
                        borderRadius: 12,
                        padding: 10,
                      }}
                      title={q.prompt || q.title}
                    >
                      <div
                        style={{
                          width: 22,
                          textAlign: "right",
                          fontWeight: 900,
                        }}
                      >
                        {i + 1}.
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 900 }}>
                          Question {i + 1}: {q.title}{" "}
                          <span style={{ opacity: 0.7 }}>[{q.marks}]</span>
                        </div>
                        <div
                          style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}
                        >
                          {snippet(q.prompt || q.title, 90)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => moveQuestion(q.id, "up")}
                          disabled={i === 0 || currentTest.is_finalized}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #333",
                            cursor:
                              i === 0 || currentTest.is_finalized
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              i === 0 || currentTest.is_finalized ? 0.5 : 1,
                          }}
                        >
                          ↑
                        </button>

                        <button
                          onClick={() => moveQuestion(q.id, "down")}
                          disabled={
                            i === includedQuestions.length - 1 ||
                            currentTest.is_finalized
                          }
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #333",
                            cursor:
                              i === includedQuestions.length - 1 ||
                              currentTest.is_finalized
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              i === includedQuestions.length - 1 ||
                              currentTest.is_finalized
                                ? 0.5
                                : 1,
                          }}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{status}</div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              All questions
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {questions.map((q) => {
                const checked = selectedIds.has(q.id);
                return (
                  <label
                    key={q.id}
                    title={q.prompt || q.title}
                    style={{
                      border: "1px solid #23324a",
                      borderRadius: 12,
                      padding: 12,
                      background: "#ffffff",
                      color: "#111827",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={currentTest.is_finalized}
                      onChange={(e) => toggleQuestion(q.id, e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>
                        Q{q.question_number}: {q.title}{" "}
                        <span style={{ opacity: 0.7 }}>[{q.marks}]</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                        {checked ? "Included in test" : "Not included"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                        {snippet(q.prompt || q.title)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
