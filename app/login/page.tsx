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

  async function handleSignIn() {
    setStatus("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(`❌ ${error.message}`);
      return;
    }

    setStatus("✅ Signed in! Redirecting...");
    router.push("/dashboard");
  }

  async function handleSignUp() {
    setStatus("Creating account...");
    const { error } = await supabase.auth.signUp({
      email,
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
          Sign Up (temporary)
        </button>
      </div>

      {status ? (
        <p style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>{status}</p>
      ) : null}

      <p style={{ marginTop: 18, opacity: 0.7 }}>
        We’ll remove public sign-up later and switch to CSV-imported students.
      </p>
    </main>
  );
}
