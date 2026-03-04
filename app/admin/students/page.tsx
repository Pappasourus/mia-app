"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type InviteRow = {
  id: string;
  email: string;
  created_at: string;
};

export default function AdminStudentsPage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  async function loadInvites() {
    if (!sb) return;

    const { data, error } = await sb
      .from("invited_students")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Could not load invited students: ${error.message}`);
      setInvites([]);
      return;
    }

    setInvites((data ?? []) as any);
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
        router.replace("/login?next=/admin/students");
        return;
      }

      if (cancelled) return;

      const emailLower = (session.user.email ?? "").toLowerCase().trim();
      setAdminEmail(emailLower);

      // TEMP: admin allowlist
      if (emailLower !== "riegardts@gmail.com") {
        setStatus("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      await loadInvites();
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sb]);

  async function addInvite() {
    if (!sb) return;

    const e = newEmail.toLowerCase().trim();
    if (!e) {
      setStatus("Please enter an email.");
      return;
    }

    setStatus("Adding…");

    const { error } = await sb.from("invited_students").insert({ email: e });

    if (error) {
      setStatus(`❌ Could not add: ${error.message}`);
      return;
    }

    setNewEmail("");
    setStatus("✅ Added");
    await loadInvites();
  }

  async function removeInvite(id: string) {
    if (!sb) return;

    const ok = window.confirm("Remove this invited student?");
    if (!ok) return;

    setStatus("Removing…");

    const { error } = await sb.from("invited_students").delete().eq("id", id);

    if (error) {
      setStatus(`❌ Could not remove: ${error.message}`);
      return;
    }

    setStatus("✅ Removed");
    await loadInvites();
  }

  function downloadTemplateCsv() {
    const header = "full_name,candidate_id,email\n";
    const example = "Jane Doe,12345,jane.doe@example.com\n";
    const csv = header + example;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async function importCsv() {
    if (!sb) return;
    if (!csvFile) {
      setStatus("Please choose a CSV file first.");
      return;
    }

    setStatus("Importing…");

    const text = await csvFile.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setStatus("CSV has no data rows.");
      return;
    }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idxName = header.indexOf("full_name");
    const idxCid = header.indexOf("candidate_id");
    const idxEmail = header.indexOf("email");

    if (idxEmail === -1) {
      setStatus("CSV must include an 'email' column.");
      return;
    }

    let added = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const email = String(cols[idxEmail] ?? "")
        .toLowerCase()
        .trim();
      if (!email) {
        skipped++;
        continue;
      }

      const fullName = idxName >= 0 ? String(cols[idxName] ?? "").trim() : "";
      const candidateId = idxCid >= 0 ? String(cols[idxCid] ?? "").trim() : "";

      // 1) Invite
      await sb
        .from("invited_students")
        .upsert({ email }, { onConflict: "email" });

      // 2) Store profile info (best-effort; table may differ between setups)
      // We only save if profiles table has these columns. If not, it will error and we ignore.
      const profilePayload: any = { email };
      if (fullName) profilePayload.full_name = fullName;
      if (candidateId) profilePayload.candidate_id = candidateId;
      await sb.from("profiles").upsert(profilePayload, { onConflict: "email" });

      added++;
    }

    setStatus(`✅ Imported ${added} row(s). Skipped ${skipped}.`);
    setCsvFile(null);
    await loadInvites();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
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
            Admin: Students (Invites)
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
            Removing an invite prevents future sign-in. It does not delete
            existing answers (yet).
          </div>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{adminEmail || "…"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            Admin Hub
          </Link>
          <Link href="/admin/questions" style={{ textDecoration: "none" }}>
            Admin: Questions
          </Link>
          <Link href="/admin/media" style={{ textDecoration: "none" }}>
            Admin: Media
          </Link>
          <Link href="/admin/answers" style={{ textDecoration: "none" }}>
            Admin: Answers
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
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 900 }}>Invite student email</div>
            <button
              onClick={downloadTemplateCsv}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
              }}
            >
              Download CSV template
            </button>
            <label
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
                display: "inline-block",
              }}
            >
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                style={{ display: "none" }}
              />
            </label>

            <span style={{ fontSize: 13, opacity: 0.85 }}>
              {csvFile ? csvFile.name : "No file chosen"}
            </span>

            <button
              onClick={importCsv}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
              }}
            >
              Import CSV
            </button>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="student@example.com"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                minWidth: 280,
              }}
            />
            <button
              onClick={addInvite}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
              }}
            >
              Add invite
            </button>

            <div style={{ marginLeft: "auto", opacity: 0.85, fontSize: 13 }}>
              {status}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              Invited students
            </div>

            {invites.length === 0 ? (
              <p>No invited students yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {invites.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 12,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{r.email}</div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                        Added:{" "}
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : ""}
                      </div>
                    </div>

                    <button
                      onClick={() => removeInvite(r.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
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
