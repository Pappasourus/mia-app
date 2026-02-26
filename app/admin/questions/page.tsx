"use client";
// ===== ANCHOR: admin-questions-page =====
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  prompt: string;
  marks: number;
};

export default function AdminQuestionsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [status, setStatus] = useState("");

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qNum, setQNum] = useState<number>(1);
  const [title, setTitle] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [marks, setMarks] = useState<number>(0);

  useEffect(() => {
    // ===== ANCHOR: admin-questions-boot =====
    if (!supabase) {
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

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (cancelled) return;

      setEmail(session.user.email ?? "");

      // Check role
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (profErr) {
        setStatus(`Could not load profile: ${profErr.message}`);
        setLoading(false);
        return;
      }

      const admin = String((prof as any)?.role) === "admin";
      setIsAdmin(admin);

      if (!admin) {
        setStatus("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      await loadQuestions();
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ===== ANCHOR: admin-questions-load =====
  async function loadQuestions() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("questions")
      .select("id, question_number, title, prompt, marks")
      .order("question_number", { ascending: true });

    if (error) {
      setStatus(`Could not load questions: ${error.message}`);
      return;
    }

    setQuestions((data ?? []) as any);
  }

  // ===== ANCHOR: admin-questions-reset-form =====
  function resetForm() {
    setEditingId(null);
    setQNum(1);
    setTitle("");
    setPrompt("");
    setMarks(0);
  }

  // ===== ANCHOR: admin-questions-start-edit =====
  function startEdit(q: QuestionRow) {
    setEditingId(q.id);
    setQNum(q.question_number);
    setTitle(q.title ?? "");
    setPrompt(q.prompt ?? "");
    setMarks(Number(q.marks ?? 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ===== ANCHOR: admin-questions-save =====
  async function saveQuestion() {
    if (!supabase) return;
    if (!isAdmin) return;

    setStatus("Saving...");

    if (!qNum || qNum < 1) {
      setStatus("Question number must be 1 or higher.");
      return;
    }
    if (!prompt.trim()) {
      setStatus("Prompt cannot be empty.");
      return;
    }

    if (editingId) {
      // Update existing
      const { error } = await supabase
        .from("questions")
        .update({
          question_number: qNum,
          title,
          prompt,
          marks,
        })
        .eq("id", editingId);

      if (error) {
        setStatus(`❌ Could not update: ${error.message}`);
        return;
      }

      setStatus("✅ Updated");
    } else {
      // Insert new
      const { error } = await supabase.from("questions").insert({
        question_number: qNum,
        title,
        prompt,
        marks,
      });

      if (error) {
        setStatus(`❌ Could not create: ${error.message}`);
        return;
      }

      setStatus("✅ Created");
    }

    resetForm();
    await loadQuestions();
  }

  // ===== ANCHOR: admin-questions-delete =====
  async function deleteQuestion(id: string) {
    if (!supabase) return;
    if (!isAdmin) return;

    const ok = window.confirm(
      "Delete this question? This also deletes related answers.",
    );
    if (!ok) return;

    setStatus("Deleting...");

    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) {
      setStatus(`❌ Could not delete: ${error.message}`);
      return;
    }

    setStatus("✅ Deleted");
    await loadQuestions();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>Admin: Questions</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{email || "…"}</b>
          </div>
        </div>
        <Link href="/questions" style={{ textDecoration: "none" }}>
          ← Back to student view
        </Link>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : !isAdmin ? (
        <p style={{ marginTop: 18, color: "crimson" }}>{status}</p>
      ) : (
        <>
          {/* ===== ANCHOR: admin-questions-form ===== */}
          <div
            style={{
              marginTop: 18,
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900 }}>
              {editingId ? "Edit question" : "Add a new question"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr",
                gap: 10,
                marginTop: 12,
                alignItems: "center",
              }}
            >
              <label style={{ fontWeight: 700 }}>Question #</label>
              <input
                type="number"
                value={qNum}
                onChange={(e) => setQNum(Number(e.target.value))}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  maxWidth: 220,
                }}
              />

              <label style={{ fontWeight: 700 }}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short title (optional)"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />

              <label style={{ fontWeight: 700 }}>Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Full question text"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  fontFamily: "inherit",
                }}
              />

              <label style={{ fontWeight: 700 }}>Marks</label>
              <input
                type="number"
                value={marks}
                onChange={(e) => setMarks(Number(e.target.value))}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  maxWidth: 220,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={saveQuestion}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  cursor: "pointer",
                }}
              >
                {editingId ? "Save changes" : "Create question"}
              </button>

              <button
                onClick={resetForm}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>

              {status ? (
                <div style={{ marginLeft: "auto", opacity: 0.85 }}>
                  {status}
                </div>
              ) : null}
            </div>
          </div>

          {/* ===== ANCHOR: admin-questions-list ===== */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Existing questions
            </div>

            {questions.length === 0 ? (
              <p>No questions yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {questions.map((q) => (
                  <div
                    key={q.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>
                        Q{q.question_number}: {q.title}{" "}
                        <span style={{ opacity: 0.7 }}>[{q.marks}]</span>
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          opacity: 0.75,
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 760,
                        }}
                        title={q.prompt}
                      >
                        {q.prompt}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => startEdit(q)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #333",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteQuestion(q.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #333",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
