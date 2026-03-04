"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type AdminRow = {
  id: string;
  email: string;
  created_at: string;
};

export default function AdminAdminsPage() {
  const router = useRouter();
  const sb = supabase;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [me, setMe] = useState("");

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [newEmail, setNewEmail] = useState("");

  async function loadAdmins() {
    if (!sb) return;

    const { data, error } = await sb
      .from("admin_emails")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Could not load admins: ${error.message}`);
      setAdmins([]);
      return;
    }

    setAdmins((data ?? []) as any);
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
        router.replace("/login?next=/admin/admins");
        return;
      }

      if (cancelled) return;

      const emailLower = (session.user.email ?? "").toLowerCase().trim();
      setMe(emailLower);

      // Must already be an admin to manage admin list
      const { data: isAdmin, error: adminErr } = await sb.rpc(
        "is_current_user_admin",
      );

      if (adminErr) {
        setStatus(`Admin check failed: ${adminErr.message}`);
        setLoading(false);
        return;
      }

      if (!isAdmin) {
        setStatus("Not authorized: admin only.");
        setLoading(false);
        return;
      }

      await loadAdmins();
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sb]);

  async function addAdmin() {
    if (!sb) return;

    const e = newEmail.toLowerCase().trim();
    if (!e) {
      setStatus("Please enter an email.");
      return;
    }

    setStatus("Adding…");

    const { error } = await sb
      .from("admin_emails")
      .upsert({ email: e }, { onConflict: "email" });

    if (error) {
      setStatus(`❌ Could not add: ${error.message}`);
      return;
    }

    setNewEmail("");
    setStatus("✅ Added");
    await loadAdmins();
  }

  async function removeAdmin(id: string, email: string) {
    if (!sb) return;

    if (email.toLowerCase().trim() === me) {
      setStatus("❌ You can't remove yourself while logged in.");
      return;
    }

    const ok = window.confirm("Remove this admin?");
    if (!ok) return;

    setStatus("Removing…");

    const { error } = await sb.from("admin_emails").delete().eq("id", id);

    if (error) {
      setStatus(`❌ Could not remove: ${error.message}`);
      return;
    }

    setStatus("✅ Removed");
    await loadAdmins();
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

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>Admin: Admins</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14 }}>
            Logged in as: <b>{me || "…"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin" style={{ textDecoration: "none" }}>
            Admin Hub
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 18 }}>Loading…</p>
      ) : (
        <>
          {status ? (
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
              {status}
            </div>
          ) : null}

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
            <div style={{ fontWeight: 900 }}>Add admin email</div>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="teacher@example.com"
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                minWidth: 280,
              }}
            />
            <button
              onClick={addAdmin}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #333",
                cursor: "pointer",
              }}
            >
              Add admin
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Admin emails</div>

            {admins.length === 0 ? (
              <p>No admins found.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {admins.map((a) => (
                  <div
                    key={a.id}
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
                      <div style={{ fontWeight: 900 }}>{a.email}</div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                        Added:{" "}
                        {a.created_at
                          ? new Date(a.created_at).toLocaleString()
                          : ""}
                      </div>
                    </div>

                    <button
                      onClick={() => removeAdmin(a.id, a.email)}
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