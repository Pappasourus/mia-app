"use client";
// ===== ANCHOR: login-page =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");
  // ===== ANCHOR: login-supabase-null-guard =====
  if (!supabase) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Login</h1>
        <p style={{ marginTop: 12 }}>
          Supabase is not configured (missing env vars). Please check Vercel →
          Settings → Environment Variables.
        </p>
      </main>
    );
  }

  // ===== ANCHOR: login-signin-null-guard =====
  async function handleSignIn() {
    if (!supabase) {
      setStatus("Supabase is not configured (missing env vars).");
      return;
    }

    setStatus("Signing in...");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("invalid login credentials")) {
        setStatus(
          "❌ Invalid email/password. If this is your first time, click Create Account first (you must be invited).",
        );
      } else {
        setStatus(`❌ ${error.message}`);
      }
      return;
    }

    setStatus("✅ Signed in! Checking access...");

    // Check admin status first (admins do NOT need invited_students)
    const emailLower = (data?.user?.email ?? email).toLowerCase().trim();

    const { data: isAdmin, error: adminErr } = await supabase.rpc(
      "is_current_user_admin",
    );

    if (adminErr) {
      await supabase.auth.signOut();
      setStatus(`❌ Admin check failed: ${adminErr.message}`);
      return;
    }

    if (!isAdmin) {
      // Students: must be invited
      const { data: invite, error: inviteErr } = await supabase
        .from("invited_students")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();

      if (inviteErr) {
        await supabase.auth.signOut();
        setStatus(`❌ Invite check failed: ${inviteErr.message}`);
        return;
      }

      if (!invite) {
        await supabase.auth.signOut();
        setStatus(
          "❌ This email is not invited yet. Ask your teacher/admin to invite you.",
        );
        return;
      }
    }

    // Respect ?next= if provided, otherwise route by email rule
    const rawNext = new URLSearchParams(window.location.search).get("next");
    let next = rawNext && rawNext.trim() ? rawNext : "";

    if (!next || next === "/") {
      next = isAdmin ? "/admin" : "/q/1";
    }

    setStatus(`✅ Signed in! Redirecting to ${next}...`);
    router.push(next);
    router.refresh();
  }

  // ===== ANCHOR: login-signup-null-guard =====
  async function handleSignUp() {
    if (!supabase) {
      setStatus("Supabase is not configured (missing env vars).");
      return;
    }

    const emailLower = email.toLowerCase().trim();

    if (!emailLower) {
      setStatus("Please enter an email.");
      return;
    }
    if (!password) {
      setStatus("Please enter a password.");
      return;
    }

    // Admins: allowed if email is in admin_emails (via RPC). Students: must be invited.
    setStatus("Checking access…");

    const { data: isAdmin, error: adminErr } = await supabase.rpc(
      "is_current_user_admin_email",
      { p_email: emailLower },
    );

    if (adminErr) {
      setStatus(`❌ Admin check failed: ${adminErr.message}`);
      return;
    }

    if (!isAdmin) {
      const { data: invited, error: inviteErr } = await supabase.rpc(
        "is_email_invited",
        { p_email: emailLower },
      );

      if (inviteErr) {
        setStatus(`❌ Invite check failed: ${inviteErr.message}`);
        return;
      }

      if (!invited) {
        setStatus(
          "❌ This email is not invited yet. Ask your teacher/admin to invite you.",
        );
        return;
      }
    }

    setStatus("Creating account...");
    const { error } = await supabase.auth.signUp({
      email: emailLower,
      password,
    });

    if (error) {
      setStatus(`❌ ${error.message}`);
      return;
    }

    setStatus("✅ Account created! Now click Sign In.");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Login</h1>

      <label style={{ display: "block", marginTop: 16, fontWeight: 600 }}>
        Email
      </label>
      <input
        style={{
          width: "100%",
          padding: 10,
          marginTop: 6,
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="student@example.com"
      />

      <label style={{ display: "block", marginTop: 16, fontWeight: 600 }}>
        Password
      </label>
      <input
        type="password"
        style={{
          width: "100%",
          padding: 10,
          marginTop: 6,
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          onClick={handleSignIn}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            cursor: "pointer",
          }}
        >
          Sign In
        </button>

        <button
          onClick={handleSignUp}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            cursor: "pointer",
          }}
        >
          Create Account
        </button>
      </div>

      {status ? (
        <p style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>{status}</p>
      ) : null}

      <p style={{ marginTop: 18, opacity: 0.7 }}>
        Students must be invited before creating an account. Admins must be on
        the admin allowlist.
      </p>
    </main>
  );
}
