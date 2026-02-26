"use client";
// ===== ANCHOR: question-page =====
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  prompt: string;
  marks: number;
};

type AnswerRow = {
  id: string;
  question_id: string;
  student_user_id: string;
  status: "not_started" | "draft" | "submitted";
  draft_text: string;
  submitted_text: string;
};

export default function QuestionPage() {
  const router = useRouter();
  const params = useParams<{ questionNumber: string }>();
  const questionNumber = Number(params.questionNumber || 0);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [email, setEmail] = useState<string>("");
  // ===== ANCHOR: question-page-userid-state =====
const [userId, setUserId] = useState<string>("");
  const [question, setQuestion] = useState<QuestionRow | null>(null);
  // ===== ANCHOR: question-page-all-question-numbers-state =====
const [allQuestionNumbers, setAllQuestionNumbers] = useState<number[]>([]);
  const [answerRow, setAnswerRow] = useState<AnswerRow | null>(null);

  const [draft, setDraft] = useState("");
  const [statusText, setStatusText] = useState<string>("");

  const isSubmitted = useMemo(
    () => answerRow?.status === "submitted",
    [answerRow],
  );
  // ===== ANCHOR: question-page-prev-next-computed =====
const { prevNum, nextNum } = useMemo(() => {
  const nums = allQuestionNumbers;
  const idx = nums.indexOf(questionNumber);
  return {
    prevNum: idx > 0 ? nums[idx - 1] : null,
    nextNum: idx >= 0 && idx < nums.length - 1 ? nums[idx + 1] : null,
  };
}, [allQuestionNumbers, questionNumber]);

  useEffect(() => {
    // ===== ANCHOR: question-page-supabase-null-guard =====
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
      setStatusText("");

      if (!questionNumber) {
        setErrorMsg("Invalid question number.");
        setLoading(false);
        return;
      }

      // 1) Must be logged in
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (cancelled) return;

      setEmail(session.user.email ?? "");
      // ===== ANCHOR: question-page-store-userid =====
setUserId(session.user.id);

      // 2) Load this question by number
      const { data: qData, error: qErr } = await supabase
        .from("questions")
        .select("id, question_number, title, prompt, marks")
        .eq("question_number", questionNumber)
        .single();

      if (qErr || !qData) {
        setErrorMsg(`Question not found: ${qErr?.message ?? "Unknown error"}`);
        setLoading(false);
        return;
      }

      const q = qData as QuestionRow;
      // ===== ANCHOR: question-page-load-question-numbers =====
const { data: numsData, error: numsErr } = await supabase
  .from("questions")
  .select("question_number")
  .order("question_number", { ascending: true });

if (!numsErr) {
  const nums = (numsData ?? [])
    .map((r: any) => Number(r?.question_number))
    .filter((n) => Number.isFinite(n));
  setAllQuestionNumbers(nums);
}

      // 3) Load this student's answer row (if any)
      const { data: aData, error: aErr } = await supabase
        .from("answers")
        .select("id, question_id, student_user_id, status, draft_text, submitted_text")
        .eq("question_id", q.id)
        .maybeSingle();

      if (aErr) {
        setErrorMsg(`Could not load answer: ${aErr.message}`);
        setQuestion(q);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setQuestion(q);
      setAnswerRow((aData as any) ?? null);

      const startingDraft =
        (aData as any)?.status === "submitted"
          ? (aData as any)?.submitted_text ?? ""
          : (aData as any)?.draft_text ?? "";

      setDraft(startingDraft);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, questionNumber]);

  // ===== ANCHOR: question-page-save-draft-returns-boolean =====
async function saveDraft(): Promise<boolean> {
    if (!supabase) return false;
if (!question) return false;
if (!userId) {
  setStatusText("Still loading your account. Try again in a moment.");
  return false;
}

    setStatusText("Saving draft...");

    // ===== ANCHOR: question-page-save-draft-payload-with-user =====
const payload = {
  question_id: question.id,
  student_user_id: userId,
  status: "draft",
  draft_text: draft,
  draft_updated_at: new Date().toISOString(),
};

    const { data, error } = await supabase
      .from("answers")
      .upsert(payload, { onConflict: "question_id,student_user_id" })
      .select("id, question_id, student_user_id, status, draft_text, submitted_text")
      .single();

    if (error) {
  setStatusText(`❌ Could not save: ${error.message}`);
  return false;
}

    setAnswerRow(data as any);
    setStatusText("✅ Draft saved");
  return true;
  }
// ===== ANCHOR: question-page-save-and-next =====
async function saveAndNext() {
  const ok = await saveDraft();
  if (!ok) return;
  if (nextNum) router.push(`/q/${nextNum}`);
}
  // ===== ANCHOR: question-page-submit-final =====
  async function submitFinal() {
    if (!supabase) return;
    if (!question) return;

    const ok = window.confirm(
      "Submit final answer? You can still edit later in our MVP, but we will lock this down later to match the video.",
    );
    if (!ok) return;

    setStatusText("Submitting...");

    // ===== ANCHOR: question-page-submit-final-payload-with-user =====
const payload = {
  question_id: question.id,
  student_user_id: userId,
  status: "submitted",
  submitted_text: draft,
  submitted_at: new Date().toISOString(),
  // also keep draft_text in sync for now
  draft_text: draft,
  draft_updated_at: new Date().toISOString(),
};
    const { data, error } = await supabase
      .from("answers")
      .upsert(payload, { onConflict: "question_id,student_user_id" })
      .select("id, question_id, student_user_id, status, draft_text, submitted_text")
      .single();

    if (error) {
      setStatusText(`❌ Could not submit: ${error.message}`);
      return;
    }

    setAnswerRow(data as any);
    setStatusText("✅ Submitted");
  }

  return (
    <main
  style={{
    padding: 24,
    fontFamily: "system-ui",
  }}
>
  {/* ===== ANCHOR: question-page-2col-layout ===== */}
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 300px",
      gap: 16,
      maxWidth: 1200,
      margin: "0 auto",
      alignItems: "start",
    }}
  >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        {/* ===== ANCHOR: question-page-left-col ===== */}
<div>
        <div>
          <div style={{ fontSize: 14, opacity: 0.75 }}>
            Logged in as: <b>{email || "…"}</b>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>
            Question {questionNumber}
          </h1>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/questions" style={{ textDecoration: "none" }}>
            ← Back to list
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : errorMsg ? (
        <p style={{ marginTop: 18, color: "crimson" }}>{errorMsg}</p>
      ) : question ? (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {question.title}{" "}
              <span style={{ fontWeight: 700, opacity: 0.7 }}>
                [{question.marks}]
              </span>
            </div>
            <div style={{ marginTop: 10, lineHeight: 1.5 }}>
              {question.prompt}
            </div>

            {/* Media area will go here next phase */}
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 10,
                border: "1px dashed #bbb",
                opacity: 0.8,
                fontSize: 13,
              }}
            >
              Media area (videos/images) will appear here in the next steps.
            </div>

            <label
              style={{
                display: "block",
                marginTop: 16,
                fontWeight: 800,
              }}
            >
              Your answer
            </label>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                marginTop: 8,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #ccc",
                fontFamily: "inherit",
              }}
              placeholder="Type your answer here..."
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={saveDraft}
                disabled={isSubmitted}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  cursor: isSubmitted ? "not-allowed" : "pointer",
                  opacity: isSubmitted ? 0.5 : 1,
                }}
              >
                Save Draft
              </button>
              <button
  onClick={saveAndNext}
  disabled={!nextNum || isSubmitted}
  style={{
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    cursor: !nextNum || isSubmitted ? "not-allowed" : "pointer",
    opacity: !nextNum || isSubmitted ? 0.5 : 1,
  }}
>
  Save &amp; Next
</button>

              <button
                onClick={submitFinal}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  cursor: "pointer",
                }}
              >
                Submit Final
              </button>

              <div style={{ marginLeft: "auto", opacity: 0.8 }}>
                Status:{" "}
                <b>{answerRow?.status ? answerRow.status : "not_started"}</b>
              </div>
            </div>

            {statusText ? (
              <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                {statusText}
              </p>
            ) : null}
            </div>
          {/* ===== ANCHOR: question-page-right-guidance ===== */}
<aside
  style={{
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 12,
    position: "sticky",
    top: 16,
  }}
>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Guidance</div>

  <div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          display: "inline-block",
          borderRadius: 3,
          background: "#2f7d32",
        }}
      />
      Attempted
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          display: "inline-block",
          borderRadius: 3,
          background: "#999",
        }}
      />
      Not Attempted
    </div>
  </div>

  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
    Questions
  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 8,
    }}
  >
    {(allQuestionNumbers.length ? allQuestionNumbers : [questionNumber]).map(
      (n) => {
        const isCurrent = n === questionNumber;
        const attempted = isCurrent ? (draft?.trim()?.length ?? 0) > 0 : false;

        return (
          <button
            key={n}
            onClick={() => router.push(`/q/${n}`)}
            style={{
              padding: "8px 0",
              borderRadius: 10,
              border: isCurrent ? "2px solid #000" : "1px solid #bbb",
              cursor: "pointer",
              background: attempted ? "#2f7d32" : "#999",
              color: "#fff",
              fontWeight: 900,
            }}
            title={isCurrent ? "Current question" : `Go to Q${n}`}
          >
            {n}
          </button>
        );
      },
    )}
  </div>

  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
    <button
      onClick={saveDraft}
      disabled={isSubmitted}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #333",
        cursor: isSubmitted ? "not-allowed" : "pointer",
        opacity: isSubmitted ? 0.5 : 1,
      }}
    >
      Save
    </button>

    <button
      onClick={() => router.push("/questions")}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #333",
        cursor: "pointer",
      }}
    >
      Finish
    </button>
  </div>

  <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
    Text size + “Text BG” controls will be added after MVP.
  </div>
</aside>
          </div>
        </div>
      ) : null}
      </div>
</main>
  );
}
