"use client";
// ===== ANCHOR: admin-media-page =====
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

type QuestionRow = {
  id: string;
  question_number: number;
  title: string;
};

type MediaRow = {
  id: string;
  question_id: string;
  kind: "image" | "video";
  bucket: string;
  path: string;
  caption: string;
  sort_order: number;
};

function safeFileName(name: string) {
  // keep letters, numbers, dot, dash, underscore
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export default function AdminMediaPage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");

  const [status, setStatus] = useState("");

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selectedQid, setSelectedQid] = useState<string>("");

  const [kind, setKind] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);

  const [media, setMedia] = useState<MediaRow[]>([]);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedQid) ?? null,
    [questions, selectedQid],
  );

  useEffect(() => {
    // ===== ANCHOR: admin-media-boot =====
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

      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        router.push("/login");
        return;
      }

      if (cancelled) return;

      setEmail(session.user.email ?? "");

      // admin check via allowlist table (RPC)
      const { data: isAdmin, error: adminErr } = await sb.rpc(
        "is_current_user_admin",
      );

      if (adminErr) {
        setStatus(`Admin check failed: ${adminErr.message}`);
        setLoading(false);
        return;
      }

      setIsAdmin(Boolean(isAdmin));

      if (!isAdmin) {
        setStatus("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      // load questions for dropdown
      const { data: qData, error: qErr } = await sb
        .from("questions")
        .select("id, question_number, title")
        .order("question_number", { ascending: true });

      if (qErr) {
        setStatus(`Could not load questions: ${qErr.message}`);
        setLoading(false);
        return;
      }

      const qRows = (qData ?? []) as any as QuestionRow[];
      setQuestions(qRows);

      // pick first question by default
      const firstId = qRows[0]?.id ?? "";
      setSelectedQid(firstId);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sb]);

  // ===== ANCHOR: admin-media-load-list =====
  async function loadMedia(qid: string) {
    if (!sb || !qid) return;

    const { data, error } = await sb
      .from("question_media")
      .select("id, question_id, kind, bucket, path, caption, sort_order")
      .eq("question_id", qid)
      .order("sort_order", { ascending: true });

    if (error) {
      setStatus(`Could not load media: ${error.message}`);
      return;
    }

    setMedia((data ?? []) as any);
  }

  // When selected question changes, load its media
  useEffect(() => {
    if (!selectedQid) return;
    loadMedia(selectedQid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQid]);

  // ===== ANCHOR: admin-media-upload-and-attach =====
  async function uploadAndAttach() {
    if (!sb) return;
    if (!isAdmin) return;
    if (!selectedQuestion) {
      setStatus("Please select a question.");
      return;
    }
    if (!file) {
      setStatus("Please choose a file to upload.");
      return;
    }

    setStatus("Uploading...");

    const bucket = "question-media";
    const qNum = selectedQuestion.question_number;
    const safeName = safeFileName(file.name);
    const path = `q${qNum}/${Date.now()}-${safeName}`;

    // 1) upload file to Storage
    const { error: upErr } = await sb.storage
      .from(bucket)
      .upload(path, file, { upsert: false });

    if (upErr) {
      setStatus(`❌ Upload failed: ${upErr.message}`);
      return;
    }

    // 2) create DB row
    const { error: insErr } = await sb.from("question_media").insert({
      question_id: selectedQuestion.id,
      kind,
      bucket,
      path,
      caption,
      sort_order: sortOrder,
    });

    if (insErr) {
      setStatus(`❌ Saved file but DB insert failed: ${insErr.message}`);
      return;
    }

    setStatus("✅ Uploaded and attached");
    setCaption("");
    setSortOrder(sortOrder + 1);
    setFile(null);

    await loadMedia(selectedQuestion.id);
  }

  // ===== ANCHOR: admin-media-delete =====
  async function deleteMedia(m: MediaRow) {
    if (!sb) return;
    if (!isAdmin) return;

    const ok = window.confirm("Delete this media item?");
    if (!ok) return;

    setStatus("Deleting...");

    // delete DB row first
    const { error: delErr } = await sb
      .from("question_media")
      .delete()
      .eq("id", m.id);
    if (delErr) {
      setStatus(`❌ Could not delete row: ${delErr.message}`);
      return;
    }

    // try remove file too (if it fails, the row is still removed which is fine)
    const { error: rmErr } = await sb.storage.from(m.bucket).remove([m.path]);
    if (rmErr) {
      setStatus(`✅ Row deleted. (File remove warning: ${rmErr.message})`);
    } else {
      setStatus("✅ Deleted");
    }

    await loadMedia(m.question_id);
  }

  function publicUrl(m: MediaRow) {
    if (!sb) return "";
    const pub = sb.storage.from(m.bucket).getPublicUrl(m.path);
    return String(pub?.data?.publicUrl ?? "");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
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
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>Admin: Media</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{email || "…"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin/questions" style={{ textDecoration: "none" }}>
            Admin: Questions
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
          {/* ===== ANCHOR: admin-media-form ===== */}
          <div
            style={{
              marginTop: 18,
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>
              Upload and attach media
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                gap: 10,
              }}
            >
              <label style={{ fontWeight: 700 }}>Question</label>
              <select
                value={selectedQid}
                onChange={(e) => setSelectedQid(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              >
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    Q{q.question_number}: {q.title}
                  </option>
                ))}
              </select>

              <label style={{ fontWeight: 700 }}>Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              >
                <option value="image">image</option>
                <option value="video">video</option>
              </select>

              <label style={{ fontWeight: 700 }}>File</label>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />

              <label style={{ fontWeight: 700 }}>Caption (optional)</label>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
                placeholder="e.g. Diagram for part (a)"
              />

              <label style={{ fontWeight: 700 }}>Sort order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
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
                onClick={uploadAndAttach}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #333",
                  cursor: "pointer",
                }}
              >
                Upload & Attach
              </button>

              {status ? (
                <div style={{ marginLeft: "auto", opacity: 0.85 }}>
                  {status}
                </div>
              ) : null}
            </div>
          </div>

          {/* ===== ANCHOR: admin-media-list ===== */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Attached media for this question
            </div>

            {media.length === 0 ? (
              <p>No media attached yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {media.map((m) => {
                  const url = publicUrl(m);
                  return (
                    <div
                      key={m.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 12,
                        display: "grid",
                        gridTemplateColumns: "260px 1fr auto",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <div>
                        {m.kind === "image" ? (
                          <img
                            src={url}
                            alt={m.caption || "media"}
                            style={{
                              width: "100%",
                              borderRadius: 10,
                              display: "block",
                            }}
                          />
                        ) : (
                          <video
                            src={url}
                            controls
                            style={{
                              width: "100%",
                              borderRadius: 10,
                              display: "block",
                            }}
                          />
                        )}
                      </div>

                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {m.kind} (order {m.sort_order})
                        </div>
                        <div
                          style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}
                        >
                          {m.caption || "(no caption)"}
                        </div>
                        <div
                          style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}
                        >
                          Path: <code>{m.path}</code>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => deleteMedia(m)}
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
