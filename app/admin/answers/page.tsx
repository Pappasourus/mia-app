"use client";
// ===== ANCHOR: admin-answers-page =====
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type StudentRow = {
  user_id: string;
  email: string;
  role: "student" | "admin";
};

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
  marks: number;
  prompt: string;
};

type AnswerRow = {
  question_id: string;
  status: "not_started" | "draft" | "submitted";
  draft_text: string;
  submitted_text: string;
};

function labelStatus(s: AnswerRow["status"] | "not_started") {
  if (s === "submitted") return "Submitted";
  if (s === "draft") return "Saved draft";
  return "Not started";
}

export default function AdminAnswersPage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [openQuestionId, setOpenQuestionId] = useState<string>("");

  const answerByQid = useMemo(() => {
    const m = new Map<string, AnswerRow>();
    for (const a of answers) m.set(a.question_id, a);
    return m;
  }, [answers]);

  useEffect(() => {
    // ===== ANCHOR: admin-answers-boot =====
    if (!sb) {
      setStatusMsg(
        "Supabase is not configured. Check Vercel → Settings → Environment Variables.",
      );
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setStatusMsg("");

      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (cancelled) return;

      setAdminEmail(session.user.email ?? "");

      // Admin check
      const { data: prof, error: profErr } = await sb
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (profErr) {
        setStatusMsg(`Could not load profile: ${profErr.message}`);
        setLoading(false);
        return;
      }

      const admin = String((prof as any)?.role) === "admin";
      setIsAdmin(admin);

      if (!admin) {
        setStatusMsg("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      // Load students
      const { data: stuData, error: stuErr } = await sb
  .from("profiles")
  .select("user_id, email, role")
  // ===== ANCHOR: admin-answers-include-admins-in-picker =====
  .in("role", ["student", "admin"])
  .order("email", { ascending: true });

      if (stuErr) {
        setStatusMsg(`Could not load students: ${stuErr.message}`);
        setLoading(false);
        return;
      }

      const stuRows = (stuData ?? []) as any as StudentRow[];
      setStudents(stuRows);
      setSelectedStudentId(stuRows[0]?.user_id ?? "");

      // Load questions
      const { data: qData, error: qErr } = await sb
        .from("questions")
        .select("id, question_number, title, marks, prompt")
        .order("question_number", { ascending: true });

      if (qErr) {
        setStatusMsg(`Could not load questions: ${qErr.message}`);
        setLoading(false);
        return;
      }

      setQuestions((qData ?? []) as any);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sb]);

  // Load answers for selected student
  useEffect(() => {
    // ===== ANCHOR: admin-answers-load-for-student =====
    if (!sb) return;
    if (!isAdmin) return;
    if (!selectedStudentId) {
      setAnswers([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setStatusMsg("Loading answers...");
      const { data, error } = await sb
        .from("answers")
        .select("question_id, status, draft_text, submitted_text")
        .eq("student_user_id", selectedStudentId);

      if (cancelled) return;

      if (error) {
        setStatusMsg(`Could not load answers: ${error.message}`);
        setAnswers([]);
        return;
      }

      setAnswers((data ?? []) as any);
      setStatusMsg("");
    })();

    return () => {
      cancelled = true;
    };
  }, [sb, isAdmin, selectedStudentId]);

  const selectedStudentEmail =
    students.find((s) => s.user_id === selectedStudentId)?.email ?? "";
// ===== ANCHOR: admin-answers-export-pdf =====
function safePdfName(s: string) {
  return (s || "student").replace(/[^a-z0-9]+/gi, "_").slice(0, 50);
}
// ===== ANCHOR: admin-answers-export-all-pdfs =====
async function exportAllStudentsPdfs() {
  if (students.length === 0) {
    setStatusMsg("No students found.");
    return;
  }

  const ok = window.confirm(
    `Export PDFs for ${students.length} users? This will download multiple files.`,
  );
  if (!ok) return;

  // Reuse the same library import once
  const { jsPDF } = await import("jspdf");

  for (const s of students) {
    // Temporarily switch the selected student so existing data structures work
    setSelectedStudentId(s.user_id);

    // Give React a moment to apply state
    await new Promise((r) => setTimeout(r, 250));

    // Build a PDF with the answers currently loaded for this student
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const margin = 40;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = pageW - margin * 2;
    let y = margin;

    doc.setFontSize(16);
    doc.text("Student Answers", margin, y);
    y += 22;

    doc.setFontSize(11);
    doc.text(`Student: ${s.email}`, margin, y);
    y += 16;

    doc.setFontSize(10);
    doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
    y += 18;

    const lineGap = 12;

    for (const q of questions) {
      // NOTE: answers state will be for the currently selected student
      const a = answerByQid.get(q.id);
      const st = a?.status ?? "not_started";
      const answerText =
        st === "submitted" ? a?.submitted_text ?? "" : a?.draft_text ?? "";

      if (y > pageH - margin - 40) {
        doc.addPage();
        y = margin;
      }

      doc.setFontSize(12);
      doc.text(`Q${q.question_number}: ${q.title || ""} [${q.marks}]`, margin, y);
      y += 14;

      doc.setFontSize(10);
      doc.text(`Status: ${labelStatus(st)}`, margin, y);
      y += 14;

      const body = answerText.trim() ? answerText : "(empty)";
      const lines = doc.splitTextToSize(body, maxW);

      doc.setFontSize(10);
      for (const line of lines) {
        if (y > pageH - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(String(line), margin, y);
        y += lineGap;
      }

      y += 10;
    }

    const filename = `answers-${safePdfName(s.email)}.pdf`;
    doc.save(filename);

    // Small pause so downloads don't collide
    await new Promise((r) => setTimeout(r, 400));
  }

  setStatusMsg("✅ Exported PDFs for all users.");
}
async function exportSelectedStudentPdf() {
  if (!selectedStudentId) {
    setStatusMsg("Please select a student first.");
    return;
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;

  let y = margin;

  doc.setFontSize(16);
  doc.text("Student Answers", margin, y);
  y += 22;

  doc.setFontSize(11);
  doc.text(`Student: ${selectedStudentEmail || selectedStudentId}`, margin, y);
  y += 16;

  doc.setFontSize(10);
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
  y += 18;

  const lineGap = 12;

  for (const q of questions) {
    const a = answerByQid.get(q.id);
    const st = a?.status ?? "not_started";
    const answerText =
      st === "submitted" ? a?.submitted_text ?? "" : a?.draft_text ?? "";

    // Page break if needed
    if (y > pageH - margin - 40) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(12);
    doc.text(`Q${q.question_number}: ${q.title || ""} [${q.marks}]`, margin, y);
    y += 14;

    doc.setFontSize(10);
    doc.text(`Status: ${labelStatus(st)}`, margin, y);
    y += 14;

    const body = answerText.trim() ? answerText : "(empty)";
    const lines = doc.splitTextToSize(body, maxW);

    doc.setFontSize(10);
    for (const line of lines) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(String(line), margin, y);
      y += lineGap;
    }

    y += 10; // extra space between questions
  }

  doc.save(`answers-${safePdfName(selectedStudentEmail)}.pdf`);
}
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>Admin: Student Answers</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{adminEmail || "…"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin/questions" style={{ textDecoration: "none" }}>
            Admin: Questions
          </Link>
          <Link href="/admin/media" style={{ textDecoration: "none" }}>
            Admin: Media
          </Link>
          <Link href="/questions" style={{ textDecoration: "none" }}>
            Student view
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : !isAdmin ? (
        <p style={{ marginTop: 18, color: "crimson" }}>{statusMsg || "Admin only."}</p>
      ) : (
        <>
          {/* ===== ANCHOR: admin-answers-student-picker ===== */}
          <div
            style={{
              marginTop: 18,
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900 }}>Student</div>
            <select
              value={selectedStudentId}
              onChange={(e) => {
                setSelectedStudentId(e.target.value);
                setOpenQuestionId("");
              }}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            >
              {students.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.email}
                </option>
              ))}
            </select>
            <button
  onClick={exportSelectedStudentPdf}
  disabled={!selectedStudentId}
  style={{
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    cursor: selectedStudentId ? "pointer" : "not-allowed",
    opacity: selectedStudentId ? 1 : 0.5,
  }}
>
  Export PDF
</button>
            <button
  onClick={exportAllStudentsPdfs}
  style={{
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    cursor: "pointer",
  }}
>
  Export ALL PDFs
</button>

            <div style={{ marginLeft: "auto", opacity: 0.8, fontSize: 13 }}>
              {statusMsg}
            </div>
          </div>

          {/* ===== ANCHOR: admin-answers-list ===== */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Answers for: <span style={{ fontWeight: 700 }}>{selectedStudentEmail}</span>
            </div>

            {questions.length === 0 ? (
              <p>No questions found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {questions.map((q) => {
                  const a = answerByQid.get(q.id);
                  const st = a?.status ?? "not_started";
                  const isOpen = openQuestionId === q.id;
                  const text =
                    st === "submitted" ? a?.submitted_text ?? "" : a?.draft_text ?? "";

                  return (
                    <div
                      key={q.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 900 }}>
                            Q{q.question_number}: {q.title}{" "}
                            <span style={{ opacity: 0.7 }}>[{q.marks}]</span>
                          </div>
                          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
                            Status: <b>{labelStatus(st)}</b>
                          </div>
                        </div>

                        <button
                          onClick={() => setOpenQuestionId(isOpen ? "" : q.id)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #333",
                            cursor: "pointer",
                          }}
                        >
                          {isOpen ? "Hide" : "View"}
                        </button>
                      </div>

                      {isOpen ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            <b>Question prompt:</b>
                          </div>
                          <div style={{ marginTop: 6, lineHeight: 1.5 }}>{q.prompt}</div>

                          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
                            <b>Student answer ({labelStatus(st)}):</b>
                          </div>
                          <pre
                            style={{
                              marginTop: 6,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid #eee",
                              background: "#fafafa",
                              color: "#111",
                              fontFamily: "inherit",
                            }}
                          >
                            {text || "(empty)"}
                          </pre>
                        </div>
                      ) : null}
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
