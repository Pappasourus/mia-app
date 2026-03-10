"use client";

// app/admin/page.tsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AdminHomePage() {
  const router = useRouter();
  const [status, setStatus] = useState("Checking admin access…");
  const [isFinalized, setIsFinalized] = useState<boolean | null>(null);
  const [finalizeMsg, setFinalizeMsg] = useState<string>("");
  const [currentTestName, setCurrentTestName] = useState<string>("");
  const [canManageAdmins, setCanManageAdmins] = useState(false);

  useEffect(() => {
    async function check() {
      if (!supabase) {
        setStatus("Supabase not configured (missing env vars).");
        return;
      }

      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user) {
        router.replace("/login?next=/admin");
        return;
      }
            setCanManageAdmins((user.email ?? "").toLowerCase() === "riegardts@gmail.com");

      // Admin check via allowlist table (RPC)
      const { data: isAdmin, error: adminErr } = await supabase.rpc(
        "is_current_user_admin",
      );

      if (adminErr) {
        setStatus(`Admin check failed: ${adminErr.message}`);
        return;
      }

      if (!isAdmin) {
        router.replace("/");
        return;
      }

      setStatus("✅ Admin access confirmed.");
      // Load current test + finalized status
      const { data: settings } = await supabase
        .from("app_settings")
        .select("current_test_id")
        .eq("id", 1)
        .maybeSingle();

      const testId = String((settings as any)?.current_test_id ?? "");

      if (!testId) {
        setCurrentTestName("");
        setIsFinalized(false);
      } else {
        const { data: t } = await supabase
          .from("tests")
          .select("name, is_finalized")
          .eq("id", testId)
          .maybeSingle();

        setCurrentTestName(String((t as any)?.name ?? ""));
        setIsFinalized(Boolean((t as any)?.is_finalized));
      }
    }

    check();
  }, [router]);
  async function finalizeTest() {
    if (!supabase) return;

    const ok = window.confirm(
      "Finalize the test? This will lock students out and submit any drafts.",
    );
    if (!ok) return;

    setFinalizeMsg("Finalizing…");

    const { error } = await supabase.rpc("finalize_test");
    if (error) {
      setFinalizeMsg(`❌ Finalize failed: ${error.message}`);
      return;
    }

    setFinalizeMsg("✅ Test finalized.");
    setIsFinalized(true);
  }
      const items = [
    { href: "/admin/questions", label: "Question Builder" },
    { href: "/admin/media", label: "Media" },
    { href: "/admin/tests", label: "Test Builder" },
    { href: "/admin/answers", label: "Answers" },
    { href: "/admin/students", label: "Students" },
    ...(canManageAdmins
      ? [{ href: "/admin/admins", label: "Admins" }]
      : []),
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <Link
            href="/"
            className="text-sm rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-900"
          >
            Home
          </Link>
        </div>

        <div className="text-xs text-slate-400">{status}</div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              Test status{" "}
              {currentTestName ? (
                <span className="text-slate-400">({currentTestName})</span>
              ) : null}
              :{" "}
              {isFinalized === null ? (
                <span className="text-slate-400">loading…</span>
              ) : isFinalized ? (
                <span className="text-red-300">FINALIZED (locked)</span>
              ) : (
                <span className="text-green-300">OPEN</span>
              )}
            </div>

            <button
              onClick={finalizeTest}
              disabled={isFinalized === true}
              className="text-sm rounded-md border border-slate-700 px-3 py-2 hover:bg-slate-900 disabled:opacity-50"
            >
              Finalize Test
            </button>
          </div>

          {finalizeMsg ? (
            <div className="text-xs text-slate-400">{finalizeMsg}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {items.map((it) => (
            <a
              key={it.href}
              href={it.href}
              className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 hover:bg-slate-900"
            >
              {it.label}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
