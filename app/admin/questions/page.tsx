"use client";

// ===== ANCHOR: admin-questions-page =====
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  prompt: string;
  marks: number;
  section: "A" | "B" | "C" | null;
  created_at?: string;
};

type PartRow = {
  id: string;
  question_id: string;
  part_label: string; // 'a', 'b', ...
  prompt: string;
  marks: number;
  sort_order: number;
  created_at?: string;
};

function normLabel(s: string) {
  return s.trim().toLowerCase();
}

function nextLabel(existing: string[]) {
  const used = new Set(existing.map((x) => normLabel(x)));
  const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
  for (const ch of alphabet) {
    if (!used.has(ch)) return ch;
  }
  // fallback if someone adds 26 parts (unlikely)
  return `p${existing.length + 1}`;
}

export default function AdminQuestionsPage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [adminEmail, setAdminEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  // Base question fields
  const [qNum, setQNum] = useState<string>("");
  const [qTitle, setQTitle] = useState<string>("");
  const [qPrompt, setQPrompt] = useState<string>("");
  const [qMarks, setQMarks] = useState<string>("0");
  const [qSection, setQSection] = useState<"A" | "B" | "C" | "">("");

  // Parts for selected question
  const [parts, setParts] = useState<PartRow[]>([]);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId],
  );

  async function loadAll() {
    if (!sb) return;

    const { data: qData, error: qErr } = await sb
      .from("questions")
      .select("id, question_number, title, prompt, marks, section, created_at")
      .order("question_number", { ascending: true });

    if (qErr) {
      setStatus(`❌ Could not load questions: ${qErr.message}`);
      setQuestions([]);
      return;
    }

    setQuestions((qData ?? []) as any);

    if (selectedId) {
      await loadParts(selectedId);
    }
  }

  async function loadParts(questionId: string) {
    if (!sb) return;

    const { data, error } = await sb
      .from("question_parts")
      .select("id, question_id, part_label, prompt, marks, sort_order, created_at")
      .eq("question_id", questionId)
      .order("sort_order", { ascending: true });

    if (error) {
      setStatus(`❌ Could not load sub-questions: ${error.message}`);
      setParts([]);
      return;
    }

    setParts((data ?? []) as any);
  }

  function clearEditor() {
    setSelectedId("");
    setQNum("");
    setQTitle("");
    setQPrompt("");
    setQMarks("0");
    setQSection("");
    setParts([]);
    setStatus("");
  }

  function loadIntoEditor(q: QuestionRow) {
    setSelectedId(q.id);
    setQNum(String(q.question_number ?? ""));
    setQTitle(q.title ?? "");
    setQPrompt(q.prompt ?? "");
    setQMarks(String(q.marks ?? 0));
    setQSection((q.section as any) ?? "");
    setStatus("");
    void loadParts(q.id);
  }

  useEffect(() => {
    if (!sb) {
      setStatus(
        "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL / ANON KEY.",
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
        router.replace("/login?next=/admin/questions");
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
  }, [router, sb]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveQuestion() {
    if (!sb) return;
    setStatus("");

        const marks = parseInt(qMarks, 10);
    if (!Number.isFinite(marks) || marks < 0) {
      setStatus("❌ Marks must be 0 or more.");
      return;
    }

    const nextQuestionNumber =
      questions.length > 0
        ? Math.max(...questions.map((q) => q.question_number || 0)) + 1
        : 1;
    if (!Number.isFinite(marks) || marks < 0) {
      setStatus("❌ Marks must be 0 or more.");
      return;
    }

    const title = qTitle.trim();
    const prompt = qPrompt.trim();
    const section = (qSection || null) as any;

    if (!title) {
      setStatus("❌ Title is required.");
      return;
    }

    // prompt can be blank if you only use parts
    setStatus(selectedId ? "Saving question…" : "Creating question…");

    if (!selectedId) {
      const { data, error } = await sb
        .from("questions")
                .insert({
          question_number: nextQuestionNumber,
          title,
          prompt,
          marks,
          section,
        })
        .select("id")
        .single();

      if (error) {
        setStatus(`❌ Create failed: ${error.message}`);
        return;
      }

      const newId = String((data as any)?.id ?? "");
      setSelectedId(newId);
      setStatus("✅ Created. You can now add sub-questions (a/b/…).");
      await loadAll();
      await loadParts(newId);
      return;
    }

    const { error } = await sb
      .from("questions")
            .update({
        title,
        prompt,
        marks,
        section,
      })
      .eq("id", selectedId);

    if (error) {
      setStatus(`❌ Save failed: ${error.message}`);
      return;
    }

    setStatus("✅ Saved.");
    await loadAll();
  }

  async function deleteQuestion() {
    if (!sb) return;
    if (!selectedId) return;

    const ok = window.confirm(
      "Delete this question AND its sub-questions? This cannot be undone.",
    );
    if (!ok) return;

    setStatus("Deleting question…");

    const { error } = await sb.from("questions").delete().eq("id", selectedId);

    if (error) {
      setStatus(`❌ Delete failed: ${error.message}`);
      return;
    }

    setStatus("✅ Deleted.");
    clearEditor();
    await loadAll();
  }

  async function addPart() {
    if (!sb) return;
    if (!selectedId) {
      setStatus("❌ Create or select a question first.");
      return;
    }

    const labels = parts.map((p) => p.part_label);
    const label = nextLabel(labels);

    const nextSort = parts.length ? Math.max(...parts.map((p) => p.sort_order)) + 1 : 1;

    setStatus("Adding sub-question…");

    const { error } = await sb.from("question_parts").insert({
      question_id: selectedId,
      part_label: label,
      prompt: "",
      marks: 0,
      sort_order: nextSort,
    });

    if (error) {
      setStatus(`❌ Could not add sub-question: ${error.message}`);
      return;
    }

    setStatus(`✅ Added part ${label}.`);
    await loadParts(selectedId);
  }

  async function updatePart(partId: string, patch: Partial<PartRow>) {
    if (!sb) return;

    const { error } = await sb.from("question_parts").update(patch).eq("id", partId);
    if (error) {
      setStatus(`❌ Could not save part: ${error.message}`);
      return;
    }

    // optimistic update in UI
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, ...(patch as any) } : p)),
    );
  }

  async function deletePart(partId: string) {
    if (!sb) return;
    const p = parts.find((x) => x.id === partId);
    const ok = window.confirm(`Delete part ${p?.part_label ?? ""}?`);
    if (!ok) return;

    const { error } = await sb.from("question_parts").delete().eq("id", partId);
    if (error) {
      setStatus(`❌ Could not delete part: ${error.message}`);
      return;
    }

    setStatus("✅ Sub-question deleted.");
    setParts((prev) => prev.filter((x) => x.id !== partId));
  }

  async function movePart(partId: string, dir: -1 | 1) {
    if (!sb) return;

    const idx = parts.findIndex((p) => p.id === partId);
    if (idx < 0) return;

    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= parts.length) return;

    const a = parts[idx];
    const b = parts[swapIdx];

    // Swap sort_order
    const { error: e1 } = await sb
      .from("question_parts")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);

    if (e1) {
      setStatus(`❌ Reorder failed: ${e1.message}`);
      return;
    }

    const { error: e2 } = await sb
      .from("question_parts")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);

    if (e2) {
      setStatus(`❌ Reorder failed: ${e2.message}`);
      await loadParts(selectedId);
      return;
    }

    await loadParts(selectedId);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Admin: Questions</h1>
            <div className="text-sm text-slate-400 mt-1">
              Logged in as: <b className="text-slate-200">{adminEmail || "…"}</b>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Link
              href="/"
              className="text-xs rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-900"
            >
              Home
            </Link>
            <Link href="/admin" className="underline hover:text-slate-200">
              Admin Hub
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-300">Loading…</div>
        ) : !isAdmin ? (
          <div className="text-red-300">{status || "Admin only."}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: list */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between">
                <div className="font-extrabold">All Questions</div>
                <button
                  onClick={clearEditor}
                  className="text-xs rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-900"
                >
                  New
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {questions.length === 0 ? (
                  <div className="text-slate-400 text-sm">
                    No questions yet.
                  </div>
                ) : (
                  questions.map((q) => {
                    const active = q.id === selectedId;
                    return (
                      <button
                        key={q.id}
                        onClick={() => loadIntoEditor(q)}
                        className={`w-full text-left rounded-lg border px-3 py-3 hover:bg-slate-900 ${
                          active
                            ? "border-cyan-500 bg-cyan-900/10"
                            : "border-slate-800 bg-slate-900/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold truncate">
                            Q{q.question_number}: {q.title}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {q.section ? `Section ${q.section}` : "No section"} •{" "}
                            {q.marks} marks
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 truncate">
                          {q.prompt || "(no main prompt)"}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: editor */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-extrabold">
                  {selectedId ? "Edit Question" : "Create Question"}
                </div>
                {selectedId ? (
                  <button
                    onClick={deleteQuestion}
                    className="text-xs rounded-md border border-red-700 px-3 py-2 hover:bg-red-900/20 text-red-200"
                  >
                    Delete
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                <label className="space-y-1">
                  <div className="text-xs text-slate-400">Section</div>
                  <select
                    value={qSection}
                    onChange={(e) => setQSection(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                  >
                    <option value="">(none)</option>
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1">
                <div className="text-xs text-slate-400">Title</div>
                <input
                  value={qTitle}
                  onChange={(e) => setQTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                  placeholder="Short title"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs text-slate-400">Marks (overall)</div>
                  <input
                    value={qMarks}
                    onChange={(e) => setQMarks(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                    placeholder="e.g. 6"
                  />
                </label>

                <div className="text-xs text-slate-400 flex items-end">
                  Tip: If you use sub-questions, you can set overall marks to
                  total, or leave it as-is.
                </div>
              </div>

              <label className="space-y-1">
                <div className="text-xs text-slate-400">Main prompt (optional)</div>
                <textarea
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  className="w-full min-h-[90px] rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                  placeholder="If the question has a general scenario / stem, put it here. Sub-questions go below."
                />
              </label>

              <div className="flex gap-3 items-center">
                <button
                  onClick={saveQuestion}
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 hover:bg-slate-900 font-semibold"
                >
                  {selectedId ? "Save" : "Create"}
                </button>

                <button
                  onClick={() => selectedId && loadParts(selectedId)}
                  disabled={!selectedId}
                  className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-900 disabled:opacity-50"
                >
                  Refresh parts
                </button>

                <div className="text-sm text-slate-300 ml-auto">{status}</div>
              </div>

              {/* Sub-questions */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Sub-questions (a/b/c…)</div>
                  <button
                    onClick={addPart}
                    className="text-xs rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-900 disabled:opacity-50"
                    disabled={!selectedId}
                  >
                    + Add sub-question
                  </button>
                </div>

                {!selectedId ? (
                  <div className="text-xs text-slate-400">
                    Create the question first, then add sub-questions.
                  </div>
                ) : parts.length === 0 ? (
                  <div className="text-xs text-slate-400">
                    No sub-questions yet. This will behave like a single question.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {parts.map((p, idx) => (
                      <div
                        key={p.id}
                        className="rounded-lg border border-slate-800 bg-slate-900/20 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">
                            Part {p.part_label}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => movePart(p.id, -1)}
                              disabled={idx === 0}
                              className="text-xs rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-900 disabled:opacity-50"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => movePart(p.id, 1)}
                              disabled={idx === parts.length - 1}
                              className="text-xs rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-900 disabled:opacity-50"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => deletePart(p.id)}
                              className="text-xs rounded-md border border-red-700 px-2 py-1 hover:bg-red-900/20 text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <div className="text-xs text-slate-400">Label</div>
                            <input
                              value={p.part_label}
                              onChange={(e) =>
                                updatePart(p.id, {
                                  part_label: normLabel(e.target.value),
                                } as any)
                              }
                              className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs text-slate-400">Marks</div>
                            <input
                              value={String(p.marks ?? 0)}
                              onChange={(e) =>
                                updatePart(p.id, {
                                  marks: parseInt(e.target.value || "0", 10) || 0,
                                } as any)
                              }
                              className="w-full rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                            />
                          </label>
                        </div>

                        <label className="space-y-1">
                          <div className="text-xs text-slate-400">Prompt</div>
                          <textarea
                            value={p.prompt}
                            onChange={(e) =>
                              updatePart(p.id, { prompt: e.target.value } as any)
                            }
                            className="w-full min-h-[80px] rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                            placeholder="Part prompt…"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Next steps: student view rendering + PDF export splitting.
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}