"use client";
// ===== ANCHOR: question-page =====
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  prompt: string;
  marks: number;
  section?: "A" | "B" | "C" | null;
};

type PartRow = {
  id: string;
  question_id: string;
  part_label: string; // a, b, c...
  prompt: string;
  marks: number;
  sort_order: number;
};

type AnswerRow = {
  id: string;
  question_id: string;
  student_user_id: string;
  status: "not_started" | "draft" | "submitted";
  draft_text: string;
  submitted_text: string;
};

// ===== ANCHOR: question-page-media-types =====
type MediaItem = {
  id: string;
  kind: "image" | "video";
  url: string;
  caption: string;
  sort_order: number;
};

function parsePartAnswers(s: string): Record<string, string> {
  try {
    const obj = JSON.parse(s || "{}");
    if (obj && typeof obj === "object") return obj as any;
    return {};
  } catch {
    return {};
  }
}

function allPartsAnswered(answerText: string, partLabels: string[]): boolean {
  if (!partLabels.length) return false;
  const obj = parsePartAnswers(answerText);
  return partLabels.every((lab) => (obj[lab] ?? "").trim().length > 0);
}

function serializePartAnswers(obj: Record<string, string>) {
  return JSON.stringify(obj ?? {});
}

export default function QuestionPage() {
  const router = useRouter();
  const params = useParams<{ questionNumber: string }>();
  const questionNumber = Number(params.questionNumber || 0);
  useEffect(() => {
    if (questionNumber > 0) {
      window.localStorage.setItem(
        "mia_last_question_number",
        String(questionNumber),
      );
    }
  }, [questionNumber]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);

    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, []);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [email, setEmail] = useState<string>("");
  // ===== ANCHOR: question-page-candidateid-state =====
  const [candidateId, setCandidateId] = useState<string>("");
  // ===== ANCHOR: question-page-userid-state =====
  const [userId, setUserId] = useState<string>("");

  const [question, setQuestion] = useState<QuestionRow | null>(null);
  const [parts, setParts] = useState<PartRow[]>([]);

  // ===== ANCHOR: question-page-all-question-numbers-state =====
  const [allQuestionNumbers, setAllQuestionNumbers] = useState<number[]>([]);
  // ===== ANCHOR: question-page-questionsIdByNumber-state =====
  const [questionsIdByNumber, setQuestionsIdByNumber] = useState<
    Record<number, string>
  >({});

  const [answerRow, setAnswerRow] = useState<AnswerRow | null>(null);

  // ===== ANCHOR: question-page-media-state =====
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  // ===== ANCHOR: question-page-status-map-state =====
  const [statusByQuestionId, setStatusByQuestionId] = useState<
    Record<string, "not_started" | "draft" | "submitted">
  >({});

  const [partLabelsByQuestionId, setPartLabelsByQuestionId] = useState<
    Record<string, string[]>
  >({});

  // NEW: answer text per question (for tile logic)
  const [answerTextByQuestionId, setAnswerTextByQuestionId] = useState<
    Record<string, string>
  >({});

  const [draft, setDraft] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft && draft !== lastSavedDraft) {
        saveDraft();
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [draft]);
  const [partAnswers, setPartAnswers] = useState<Record<string, string>>({});
  const [statusText, setStatusText] = useState<string>("");
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [currentTestId, setCurrentTestId] = useState<string>("");

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraftRef = useRef<string>("");
  const [lastSavedDraft, setLastSavedDraft] = useState<string>("");
  const isAutoSavingRef = useRef(false);

  const isSubmitted = useMemo(
    () => answerRow?.status === "submitted",
    [answerRow],
  );

  const hasTypedContent = useMemo(() => draft.trim().length > 0, [draft]);

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
    // ===== ANCHOR: question-page-sb-alias =====
    const sb = supabase;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

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
      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (cancelled) return;

      setEmail(session.user.email ?? "");
      // ===== ANCHOR: question-page-store-userid =====
      setUserId(session.user.id);

      // Load current test id (used to isolate answers per test)
      const { data: settings0, error: settings0Err } = await sb
        .from("app_settings")
        .select("current_test_id")
        .eq("id", 1)
        .maybeSingle();

      if (settings0Err) {
        setErrorMsg(`Could not load app settings: ${settings0Err.message}`);
        setLoading(false);
        return;
      }

      const testId = String((settings0 as any)?.current_test_id ?? "");
      setCurrentTestId(testId);

      if (!testId) {
        setErrorMsg("No active test is available.");
        setLoading(false);
        return;
      }

      // Load + poll finalized status (locks students if admin finalizes mid-test)
      async function fetchFinalized() {
        // Find current test
        const { data: settings } = await sb
          .from("app_settings")
          .select("current_test_id")
          .eq("id", 1)
          .maybeSingle();

        const testId = String((settings as any)?.current_test_id ?? "");

        if (!testId) {
          setIsFinalized(false);
          return false;
        }

        // Read test finalized flag
        const { data: t } = await sb
          .from("tests")
          .select("is_finalized")
          .eq("id", testId)
          .maybeSingle();

        const finalized = Boolean((t as any)?.is_finalized);
        setIsFinalized(finalized);
        return finalized;
      }

      // initial load
      await fetchFinalized();

      // poll every 5s while on this page
      intervalId = setInterval(() => {
        fetchFinalized();
      }, 5000);

      // ===== ANCHOR: question-page-load-candidateid =====
      const { data: pData, error: pErr } = await sb
        .from("profiles")
        .select("candidate_id")
        .eq("user_id", session.user.id)
        .single();

      if (!pErr) {
        setCandidateId(String((pData as any)?.candidate_id ?? ""));
      }

      // ===== ANCHOR: question-page-load-all-statuses =====
      const { data: allAns, error: allAnsErr } = await sb
        .from("answers")
        .select("question_id, status, draft_text, submitted_text")
        .eq("student_user_id", session.user.id)
        .eq("test_id", testId);

      if (!allAnsErr) {
        const statusMap: Record<string, "not_started" | "draft" | "submitted"> =
          {};
        const textMap: Record<string, string> = {};

        for (const r of allAns ?? []) {
          const qid = String((r as any).question_id ?? "");
          const st = (r as any).status as any;

          if (qid) {
            statusMap[qid] = st;

            const txt =
              st === "submitted"
                ? String((r as any).submitted_text ?? "")
                : String((r as any).draft_text ?? "");
            textMap[qid] = txt;
          }
        }

        setStatusByQuestionId(statusMap);
        setAnswerTextByQuestionId(textMap);
      } else {
        // keep empty maps if error
        setStatusByQuestionId({});
        setAnswerTextByQuestionId({});
      }

      // 2) Load current test mapping (sort_order -> question_id), then load this question
      const { data: settingsData, error: settingsErr } = await sb
        .from("app_settings")
        .select("current_test_id")
        .eq("id", 1)
        .maybeSingle();

      if (settingsErr) {
        setErrorMsg(`Could not load app settings: ${settingsErr.message}`);
        setLoading(false);
        return;
      }

      const currentTestId = String(
        (settingsData as any)?.current_test_id ?? "",
      );

      // Build navigation map from current test
      let qidForThisPage = "";

      if (currentTestId) {
        const { data: tqData, error: tqErr } = await sb
          .from("test_questions")
          .select("question_id, sort_order")
          .eq("test_id", currentTestId)
          .order("sort_order", { ascending: true });

        if (!tqErr && tqData?.length) {
          const nums = (tqData ?? [])
            .map((r: any) => Number(r?.sort_order))
            .filter((n) => Number.isFinite(n));
          setAllQuestionNumbers(nums);

          const map: Record<number, string> = {};
          for (const r of tqData ?? []) {
            const n = Number((r as any)?.sort_order);
            const id = String((r as any)?.question_id ?? "");
            if (Number.isFinite(n) && id) map[n] = id;
          }
          setQuestionsIdByNumber(map);

          // Load sub-question labels for ALL questions in this test (for tile logic)
          const allQids = Object.values(map).filter(Boolean);

          if (allQids.length > 0) {
            const { data: partsAll, error: partsAllErr } = await sb
              .from("question_parts")
              .select("question_id, part_label, sort_order")
              .in("question_id", allQids);

            if (!partsAllErr) {
              const byQid: Record<string, { label: string; sort: number }[]> =
                {};

              for (const p of partsAll ?? []) {
                const qid = String((p as any).question_id ?? "");
                const label = String((p as any).part_label ?? "").trim();
                const sort = Number((p as any).sort_order ?? 0);

                if (!qid || !label) continue;
                if (!byQid[qid]) byQid[qid] = [];
                byQid[qid].push({ label, sort });
              }

              const labelsOnly: Record<string, string[]> = {};
              for (const qid of Object.keys(byQid)) {
                labelsOnly[qid] = byQid[qid]
                  .sort((a, b) => a.sort - b.sort)
                  .map((x) => x.label);
              }

              setPartLabelsByQuestionId(labelsOnly);
            } else {
              setPartLabelsByQuestionId({});
            }
          } else {
            setPartLabelsByQuestionId({});
          }

          qidForThisPage = map[questionNumber] ?? "";
        }
      }

      // Fallback: if no current test (or missing mapping), use old behavior
      if (!qidForThisPage) {
        const { data: qIndex, error: qIndexErr } = await sb
          .from("questions")
          .select("id, question_number")
          .order("question_number", { ascending: true });

        if (!qIndexErr) {
          const nums = (qIndex ?? [])
            .map((r: any) => Number(r?.question_number))
            .filter((n) => Number.isFinite(n));
          setAllQuestionNumbers(nums);

          const map: Record<number, string> = {};
          for (const r of qIndex ?? []) {
            const n = Number((r as any).question_number);
            const id = String((r as any).id ?? "");
            if (Number.isFinite(n) && id) map[n] = id;
          }
          setQuestionsIdByNumber(map);

          qidForThisPage = map[questionNumber] ?? "";
        }
      }

      if (!qidForThisPage) {
        setErrorMsg("Question not found in current test.");
        setLoading(false);
        return;
      }

      // Load the question by ID (works for both modes)
      const { data: qData, error: qErr } = await sb
        .from("questions")
        .select("id, question_number, title, prompt, marks, section")
        .eq("id", qidForThisPage)
        .single();

      if (qErr || !qData) {
        setErrorMsg(`Question not found: ${qErr?.message ?? "Unknown error"}`);
        setLoading(false);
        return;
      }

      const q = qData as QuestionRow;

      // Load sub-questions (a/b/c…) if any
      const { data: partsData, error: pErr2 } = await sb
        .from("question_parts")
        .select("id, question_id, part_label, prompt, marks, sort_order")
        .eq("question_id", q.id)
        .order("sort_order", { ascending: true });

      if (!pErr2) {
        setParts((partsData ?? []) as any);
      } else {
        setParts([]);
      }

      // ===== ANCHOR: question-page-load-media =====
      const { data: mData, error: mErr } = await sb
        .from("question_media")
        .select("id, kind, bucket, path, caption, sort_order")
        .eq("question_id", q.id)
        .order("sort_order", { ascending: true });

      if (!mErr) {
        const items: MediaItem[] = (mData ?? []).map((m: any) => {
          const bucket = String(m?.bucket ?? "question-media");
          const path = String(m?.path ?? "");
          const pub = sb.storage.from(bucket).getPublicUrl(path);
          const url = String(pub?.data?.publicUrl ?? "");

          return {
            id: String(m?.id ?? ""),
            kind: (m?.kind as "image" | "video") ?? "image",
            url,
            caption: String(m?.caption ?? ""),
            sort_order: Number(m?.sort_order ?? 0),
          };
        });

        setMediaItems(items.filter((x) => x.id && x.url));
      }

      // 3) Load this student's answer row (if any)
      const { data: aData, error: aErr } = await sb
        .from("answers")
        .select(
          "id, question_id, student_user_id, status, draft_text, submitted_text",
        )
        .eq("test_id", testId)
        .eq("question_id", q.id)
        .eq("student_user_id", session.user.id)
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
          ? ((aData as any)?.submitted_text ?? "")
          : ((aData as any)?.draft_text ?? "");

      setDraft(startingDraft);
      setPartAnswers(parsePartAnswers(startingDraft));
      lastSavedDraftRef.current = startingDraft;
      setLastSavedDraft(startingDraft);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [router, questionNumber]);

  // ===== ANCHOR: question-page-save-draft-returns-boolean =====
  async function saveDraft(opts?: {
    silent?: boolean;
    overrideText?: string;
  }): Promise<boolean> {
    if (!supabase) return false;
    if (!question) return false;
    if (isFinalized) {
      setStatusText(
        "❌ This test has been finalized. You can’t submit changes.",
      );
      return false;
    }
    if (!userId) {
      if (!opts?.silent) {
        setStatusText("Still loading your account. Try again in a moment.");
      }
      return false;
    }

    const textToSave = opts?.overrideText ?? draft;

    if (!opts?.silent) {
      setStatusText("Saving draft...");
    }

    // ===== ANCHOR: question-page-save-draft-payload-with-user =====
    if (!currentTestId) {
      if (!opts?.silent) setStatusText("Still loading test info. Try again.");
      return false;
    }

    const payload = {
      test_id: currentTestId,
      question_id: question.id,
      student_user_id: userId,
      status: "draft",
      draft_text: textToSave,
      draft_updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("answers")
      .upsert(payload, { onConflict: "test_id,question_id,student_user_id" })
      .select(
        "id, question_id, student_user_id, status, draft_text, submitted_text",
      )
      .single();

    if (error) {
      if (!opts?.silent) {
        setStatusText(`❌ Could not save: ${error.message}`);
      }
      return false;
    }

    setAnswerRow(data as any);
    lastSavedDraftRef.current = textToSave;
    setLastSavedDraft(textToSave);

    setStatusByQuestionId((prev) => ({
      ...prev,
      [question.id]: textToSave.trim() ? "draft" : "not_started",
    }));

    // keep the map used for tile completeness checks in sync for the current question
    setAnswerTextByQuestionId((prev) => ({
      ...prev,
      [question.id]: textToSave,
    }));

    if (!opts?.silent) {
      setStatusText("✅ Draft saved");
    }

    return true;
  }

  // ===== ANCHOR: question-page-save-and-next =====
  async function saveAndNext() {
    const ok = await saveDraft();
    if (!ok) return;
    if (nextNum) router.push(`/q/${nextNum}`);
  }

  // ===== ANCHOR: question-page-submit-final =====
  async function submitFinal(opts?: {
    goHomeAfter?: boolean;
  }): Promise<boolean> {
    if (!supabase) return false;
    if (!question) return false;
    if (!userId) return false;

    if (!currentTestId) {
      setStatusText("Still loading test info. Try again.");
      return false;
    }

    const payload = {
      test_id: currentTestId,
      question_id: question.id,
      student_user_id: userId,
      status: "submitted",
      submitted_text: draft,
      submitted_at: new Date().toISOString(),
      draft_text: draft,
      draft_updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("answers")
      .upsert(payload, { onConflict: "test_id,question_id,student_user_id" })
      .select(
        "id, question_id, student_user_id, status, draft_text, submitted_text",
      )
      .single();

    if (error) {
      setStatusText(`❌ Could not submit: ${error.message}`);
      return false;
    }

    setAnswerRow(data as any);
    lastSavedDraftRef.current = draft;
    setLastSavedDraft(draft);

    setStatusByQuestionId((prev) => ({
      ...prev,
      [question.id]: "submitted",
    }));

    // keep the map used for tile completeness checks in sync for the current question
    setAnswerTextByQuestionId((prev) => ({
      ...prev,
      [question.id]: draft,
    }));

    setStatusText("✅ Submitted");

    if (opts?.goHomeAfter) {
      router.push("/");
    }

    return true;
  }

  // ===== ANCHOR: question-page-finish-with-confirmation =====
  async function finishWithConfirmation() {
    const confirmed = window.confirm(
      "Are you sure you want to finish? This will submit your final answer and return you to Home.",
    );
    if (isFinalized) {
      setStatusText(
        "❌ This test has been finalized. Your last saved work was submitted.",
      );
      router.push("/");
      return;
    }
    if (!confirmed) return;
    await submitFinal({ goHomeAfter: true });
  }

  // ===== ANCHOR: question-page-auto-save-draft =====
  useEffect(() => {
    if (loading) return;
    if (!question) return;
    if (!userId) return;
    if (isSubmitted) return;

    if (!hasTypedContent) {
      setStatusByQuestionId((prev) => ({
        ...prev,
        [question.id]: "not_started",
      }));
      return;
    }

    if (draft === lastSavedDraftRef.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      if (isAutoSavingRef.current) return;
      isAutoSavingRef.current = true;
      await saveDraft({ silent: true });
      isAutoSavingRef.current = false;
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [draft, loading, question, userId, isSubmitted, hasTypedContent]);

  // ===== ANCHOR: question-page-status-preview-sync =====
  useEffect(() => {
    if (!question) return;

    setStatusByQuestionId((prev) => {
      const currentSaved = prev[question.id];

      if (isSubmitted) {
        if (currentSaved === "submitted") return prev;
        return { ...prev, [question.id]: "submitted" };
      }

      const previewStatus = draft.trim() ? "draft" : "not_started";
      if (currentSaved === previewStatus) return prev;
      return { ...prev, [question.id]: previewStatus };
    });
  }, [draft, question, isSubmitted]);

  function getTileState(n: number): "submitted" | "draft" | "not_started" {
    const qidForN = questionsIdByNumber[n];
    return qidForN && statusByQuestionId[qidForN]
      ? statusByQuestionId[qidForN]
      : "not_started";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#d9d9d9",
        color: "#111",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <header
        style={{
          height: 28,
          position: "relative",
          background: "linear-gradient(180deg, #33c2cd 0%, #2eb8c2 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 112,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -12,
              top: 0,
              width: 36,
              height: "100%",
              background: "#8cc63f",
              transform: "skewX(-35deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 17,
              top: 0,
              width: 22,
              height: "100%",
              background: "#f3e32a",
              transform: "skewX(-35deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 34,
              top: 0,
              width: 22,
              height: "100%",
              background: "#7b4fa3",
              transform: "skewX(-35deg)",
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "repeating-linear-gradient(60deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 22px)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            maxWidth: 1400,
            height: "100%",
            margin: "0 auto",
            padding: "0 10px 0 0",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            color: "#fff",
            fontSize: 11,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              paddingLeft: 86,
              fontSize: 11,
              whiteSpace: "nowrap",
            }}
          >
            Moving Image Arts
          </div>

          <div
            style={{
              justifySelf: "center",
              fontSize: 11,
              whiteSpace: "nowrap",
            }}
          >
            Exam Simulator
          </div>

          <div
            style={{
              justifySelf: "end",
              display: "flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
              fontSize: 10,
            }}
          >
            <span>Candidate: {candidateId || "—"}</span>
            <Link
              href="/"
              style={{
                color: "#fff",
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.45)",
                background: "rgba(0,0,0,0.14)",
                padding: "1px 7px",
                lineHeight: 1.2,
              }}
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 158px",
          gap: 0,
        }}
      >
        {/* ===== ANCHOR: question-page-left-col ===== */}
        <div
          style={{
            minHeight: "calc(100vh - 28px)",
            borderRight: "1px solid #bababa",
            padding: "14px 14px 0 14px",
            position: "relative",
            background: "#d9d9d9",
          }}
        >
          {loading ? (
            <p style={{ marginTop: 18, fontSize: 13 }}>Loading…</p>
          ) : errorMsg ? (
            <p style={{ marginTop: 18, color: "crimson", fontSize: 13 }}>
              {errorMsg}
            </p>
          ) : question ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    background: "#35c0cd",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 400,
                    flexShrink: 0,
                  }}
                >
                  {questionNumber}
                </div>

                <div
                  style={{
                    fontSize: 19,
                    lineHeight: 1.3,
                    paddingTop: 5,
                    color: "#202020",
                    maxWidth: 980,
                  }}
                >
                  {question.prompt ? (
                    <span style={{ fontWeight: 400 }}>{question.prompt}</span>
                  ) : null}
                  <span
                    style={{
                      marginLeft: 16,
                      fontWeight: 700,
                      color: "#111",
                      whiteSpace: "nowrap",
                    }}
                  >
                    [{question.marks}]
                  </span>
                </div>
              </div>

              {/* ===== ANCHOR: question-page-media-render ===== */}
              {mediaItems.length === 0 ? (
                <div
                  style={{
                    width: "min(780px, 100%)",
                    marginBottom: 14,
                    padding: 10,
                    border: "1px dashed #b8b8b8",
                    background: "#ececec",
                    fontSize: 12,
                    color: "#555",
                  }}
                >
                  No media attached to this question.
                </div>
              ) : (
                <div
                  style={{
                    width: "min(820px, 100%)",
                    display: "grid",
                    gridTemplateColumns:
                      mediaItems.length >= 2 ? "1fr 1fr" : "1fr",
                    gap: 18,
                    marginBottom: 16,
                    alignItems: "start",
                  }}
                >
                  {mediaItems.map((m) => (
                    <div key={m.id}>
                      <div
                        style={{
                          background: "#000",
                          display: "inline-block",
                          maxWidth: "100%",
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
                        }}
                      >
                        {m.kind === "image" ? (
                          <img
                            src={m.url}
                            alt={m.caption || "Question media"}
                            style={{
                              display: "block",
                              width: "100%",
                              maxHeight: 350,
                              objectFit: "contain",
                              background: "#000",
                            }}
                          />
                        ) : (
                          <video
                            src={m.url}
                            controls
                            style={{
                              display: "block",
                              width: "100%",
                              maxHeight: 350,
                              background: "#000",
                            }}
                          />
                        )}
                      </div>

                      {m.caption ? (
                        <div
                          style={{
                            marginTop: 5,
                            fontSize: 12,
                            color: "#474747",
                            lineHeight: 1.35,
                          }}
                        >
                          {m.caption}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {isFinalized ? (
                <div
                  style={{
                    width: "min(820px, 100%)",
                    marginBottom: 12,
                    padding: 10,
                    border: "1px solid #b91c1c",
                    background: "#fee2e2",
                    color: "#7f1d1d",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  TEST FINALISED: You can no longer edit. Your last saved work
                  was submitted.
                </div>
              ) : null}

              <div
                style={{
                  width: "100%",
                  maxWidth: 1020,
                  background: "#efefef",
                  border: "1px solid #d4d4d4",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      background: "#dddddd",
                      border: "1px solid #e7e7e7",
                      color: "#fff",
                      fontSize: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      userSelect: "none",
                    }}
                  >
                    +
                  </div>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      background: "#dddddd",
                      border: "1px solid #e7e7e7",
                      color: "#fff",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      userSelect: "none",
                      lineHeight: 1,
                    }}
                  >
                    −
                  </div>
                </div>

                {parts.length > 0 ? (
                  <div style={{ padding: "12px 42px 12px 14px" }}>
                    {parts.map((p) => (
                      <div key={p.id} style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              background: "#35c0cd",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 18,
                              fontWeight: 400,
                              flexShrink: 0,
                            }}
                          >
                            {p.part_label}
                          </div>

                          <div
                            style={{
                              flex: 1,
                              background: "#e9e9e9",
                              border: "1px solid #d4d4d4",
                              padding: "10px 12px",
                              fontSize: 16,
                              color: "#202020",
                            }}
                          >
                            {p.prompt}
                            <span
                              style={{
                                marginLeft: 10,
                                fontWeight: 700,
                                color: "#111",
                                whiteSpace: "nowrap",
                              }}
                            >
                              [{p.marks}]
                            </span>
                          </div>
                        </div>

                        <textarea
                          value={partAnswers[p.part_label] ?? ""}
                          onChange={(e) => {
                            const next = {
                              ...partAnswers,
                              [p.part_label]: e.target.value,
                            };
                            setPartAnswers(next);
                            setDraft(serializePartAnswers(next));
                          }}
                          disabled={isSubmitted || isFinalized}
                          rows={6}
                          style={{
                            width: "100%",
                            resize: "vertical",
                            border: "1px solid #d1d5db",
                            outline: "none",
                            background: "#ffffff",
                            fontFamily: "Arial, Helvetica, sans-serif",
                            fontSize: 16,
                            lineHeight: 1.45,
                            color: "#222",
                            padding: "10px 12px",
                            boxSizing: "border-box",
                            borderRadius: 10,
                          }}
                          placeholder={`Type your answer for part ${p.part_label}...`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={isSubmitted || isFinalized}
                    rows={12}
                    style={{
                      width: "100%",
                      minHeight: 96,
                      resize: "vertical",
                      border: "none",
                      outline: "none",
                      background: "#efefef",
                      fontFamily: "Arial, Helvetica, sans-serif",
                      fontSize: 17,
                      lineHeight: 1.45,
                      color: "#222",
                      padding: "12px 42px 12px 14px",
                      boxSizing: "border-box",
                    }}
                    placeholder="Type your answer here..."
                  />
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 4,
                  marginTop: 6,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    background: "#7c7c7c",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    border: "1px solid #989898",
                    userSelect: "none",
                  }}
                >
                  ⤢
                </div>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    background: "#7c7c7c",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    border: "1px solid #989898",
                    userSelect: "none",
                  }}
                >
                  ↺
                </div>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    background: "#7c7c7c",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    border: "1px solid #989898",
                    userSelect: "none",
                  }}
                >
                  ↻
                </div>
              </div>

              {statusText ? (
                <div
                  style={{
                    marginBottom: 12,
                    fontSize: 12,
                    color: "#333",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {statusText}
                </div>
              ) : null}

              <div
                style={{
                  position: "sticky",
                  bottom: 0,
                  background: "#d9d9d9",
                  paddingTop: 4,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "112px 1fr 202px",
                    alignItems: "end",
                    gap: 0,
                    minHeight: 40,
                  }}
                >
                  <button
                    onClick={() => prevNum && router.push(`/q/${prevNum}`)}
                    disabled={!prevNum}
                    style={{
                      height: 30,
                      border: "1px solid #8ab63f",
                      background: prevNum ? "#7fb43d" : "#a7bf82",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 400,
                      cursor: prevNum ? "pointer" : "not-allowed",
                      opacity: prevNum ? 1 : 0.78,
                      justifySelf: "start",
                      width: 105,
                    }}
                  >
                    ◀ Previous
                  </button>

                  <div
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "#666",
                      paddingBottom: 6,
                    }}
                  >
                    Status:{" "}
                    <b>
                      {answerRow?.status ? answerRow.status : "not_started"}
                    </b>
                    {email ? (
                      <span style={{ marginLeft: 10 }}>{email}</span>
                    ) : null}
                  </div>

                  <button
                    onClick={async () => {
                      const ok = await submitFinal();
                      if (!ok) return;
                      if (nextNum) router.push(`/q/${nextNum}`);
                    }}
                    disabled={
                      isSubmitted ||
                      isFinalized ||
                      draft.trim().length === 0 ||
                      draft === lastSavedDraft
                    }
                    style={{
                      height: 30,
                      border: "1px solid #8ab63f",
                      background:
                        isSubmitted ||
                        isFinalized ||
                        draft.trim().length === 0 ||
                        draft === lastSavedDraft
                          ? "#a7bf82"
                          : "#7fb43d",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 400,
                      cursor:
                        isSubmitted ||
                        isFinalized ||
                        draft.trim().length === 0 ||
                        draft === lastSavedDraft
                          ? "not-allowed"
                          : "pointer",
                      width: 198,
                      justifySelf: "end",
                    }}
                  >
                    {nextNum ? "Save & Next" : "Save"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ===== ANCHOR: question-page-right-guidance ===== */}
        <aside
          style={{
            minHeight: "calc(100vh - 28px)",
            background: "#1f1f1f",
            color: "#fff",
            padding: "8px 8px 12px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "#343434",
              border: "1px solid #3e3e3e",
              padding: "6px 11px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            Guidance
          </div>

          <div
            style={{
              borderTop: "1px solid #454545",
              paddingTop: 10,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 15,
                marginBottom: 8,
              }}
            >
              Questions
            </div>

            <div style={{ marginBottom: 10, fontSize: 14 }}>
              Section {question?.section ?? "A"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 28px)",
                gap: 4,
                marginBottom: 12,
              }}
            >
              {(allQuestionNumbers.length
                ? allQuestionNumbers
                : [questionNumber]
              ).map((n) => {
                const isCurrent = n === questionNumber;
                const st = getTileState(n);
                const qidForN = questionsIdByNumber[n] ?? "";

                const partLabels = qidForN
                  ? (partLabelsByQuestionId[qidForN] ?? [])
                  : [];

                const hasParts = partLabels.length > 0;
                const savedText = qidForN
                  ? (answerTextByQuestionId[qidForN] ?? "")
                  : "";

                // Option A: submitted tile only when ALL parts have content
                const partsComplete = hasParts
                  ? allPartsAnswered(savedText, partLabels)
                  : true;

                const isSubmittedTile = st === "submitted" && partsComplete;
                const isCurrentTile = isCurrent;
                const isDraftLike =
                  st === "draft" || (st === "submitted" && !partsComplete);

                let tileBg = "#6a6a6a";
                if (isCurrentTile) tileBg = "#35c0cd";
                else if (isSubmittedTile) tileBg = "#79bb3b";

                return (
                  <button
                    key={n}
                    onClick={() => router.push(`/q/${n}`)}
                    style={{
                      position: "relative",
                      width: 28,
                      height: 28,
                      border: isCurrent
                        ? "2px solid #fff"
                        : "1px solid #4a4a4a",
                      background: tileBg,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 400,
                      cursor: "pointer",
                      padding: 0,
                      overflow: "hidden",
                    }}
                    title={isCurrent ? "Current question" : `Go to Q${n}`}
                  >
                    {isDraftLike && !isCurrentTile ? (
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          width: 0,
                          height: 0,
                          borderTop: "11px solid #cf2d2d",
                          borderLeft: "11px solid transparent",
                        }}
                      />
                    ) : null}
                    <span style={{ position: "relative", zIndex: 1 }}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: 200,
              fontSize: 12,
              lineHeight: 1.75,
              color: "#ececec",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  display: "inline-block",
                  background: "#35c0cd",
                }}
              />
              Current question
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  display: "inline-block",
                  background: "#79bb3b",
                }}
              />
              Submitted
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  display: "inline-block",
                  background: "#6a6a6a",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 0,
                    height: 0,
                    borderTop: "8px solid #cf2d2d",
                    borderLeft: "8px solid transparent",
                  }}
                />
              </span>
              Draft / Not submitted
            </div>

            <div style={{ marginTop: 18, color: "#b9f06a" }}>
              Saving online &amp; offline
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => saveDraft()}
              disabled={isSubmitted || isFinalized}
              style={{
                width: "100%",
                height: 34,
                border: "1px solid #5f5f5f",
                background: isSubmitted ? "#666" : "#6f6f6f",
                color: "#fff",
                fontSize: 15,
                cursor: isSubmitted || isFinalized ? "not-allowed" : "pointer",
                marginBottom: 9,
              }}
            >
              Save
            </button>

            <button
              onClick={finishWithConfirmation}
              style={{
                width: "100%",
                height: 42,
                border: "1px solid #111",
                background: "#000",
                color: "#fff",
                fontSize: 18,
                cursor: "pointer",
                fontWeight: 400,
              }}
            >
              Finish
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
