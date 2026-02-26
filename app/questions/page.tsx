"use client";
// ===== ANCHOR: questions-list-page =====
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  prompt: string;
  marks: number;
};

type AnswerRow = {
  question_id: string;
  status: "not_started" | "draft" | "submitted";
};

function statusLabel(s: AnswerRow["status"] | "not_started") {
  if (s === "submitted") return "Submitted";
  if (s === "draft") return "Saved draft";
  return "Not started";
}

export default function QuestionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const answerByQuestionId = useMemo(() => {
    const m = new Map<string, AnswerRow["status"]>();
    for (const a of answers) m.set(a.question_id, a.status);
    return m;
  }, [answers]);

  useEffect(() => {
    // ===== ANCHOR: questions-list-supabase-null-guard =====
    if (!supabase) {
      setLoading(false);
      setErrorMsg(
        "Supabase is not configured. Check Vercel → Settings → Environment Variables.",
      );
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg("");

      // 1) Must be logged in
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (cancelled) return;

      setEmail(session.user.email ?? "");

      // 2) Load questions
      const { data: qData, error: qErr } = await supabase
        .from("questions")
        .select("id, question_number, title, prompt, marks")
        .order("question_number", { ascending: true });

      if (qErr) {
        setErrorMsg(`Could not load questions: ${qErr.message}`);
        setLoading(false);
        return;
      }

      const qRows = (qData ?? []) as QuestionRow[];

      // 3) Load this student's answers (RLS keeps it private)
      const { data: aData, error: aErr } = await supabase
        .from("answers")
        .select("question_id, status");

      if (aErr) {
        setErrorMsg(`Could not load answers: ${aErr.message}`);
        setQuestions(qRows);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setQuestions(qRows);
      setAnswers(((aData ?? []) as AnswerRow[]) ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ===== ANCHOR: questions-list-signout =====
  async function handleSignOut() {
    if (!supabase) {
      router.push("/login");
      return;
    }
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Question List</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{email || "…"}</b>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : errorMsg ? (
        <p style={{ marginTop: 18, color: "crimson" }}>{errorMsg}</p>
      ) : (
        <div style={{ marginTop: 18 }}>
          {questions.length === 0 ? (
            <p>No questions found.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {questions.map((q) => {
                const status = answerByQuestionId.get(q.id) ?? "not_started";
                return (
                  <div
                    key={q.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>
                        Q{q.question_number}: {q.title}{" "}
                        <span style={{ fontWeight: 600, opacity: 0.7 }}>
                          [{q.marks}]
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          opacity: 0.75,
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 640,
                        }}
                        title={q.prompt}
                      >
                        {q.prompt}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                        Status: <b>{statusLabel(status)}</b>
                      </div>
                    </div>

                    {/* We’ll build this question page next step */}
                    <Link
                      href={`/q/${q.question_number}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        textDecoration: "none",
                        color: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Open
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: 18, opacity: 0.65, fontSize: 13 }}>
        Note: The “Open” button will work after we create the question screen
        next.
      </p>
    </main>
  );
}
