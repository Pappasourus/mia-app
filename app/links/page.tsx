// app/links/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LinksPage() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const env = process.env.VERCEL_ENV ?? "unknown";

  const items = [
    { href: "/login", label: "Login" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/questions", label: "Questions list" },
    { href: "/q/1", label: "Question 1" },
    { href: "/admin/questions", label: "Admin: Questions" },
    { href: "/admin/media", label: "Admin: Media" },
    { href: "/admin/answers", label: "Admin: Answers" },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Quick Links</h1>

        <div className="text-sm text-slate-400">
          Environment: <span className="text-slate-200">{env}</span> • Commit:{" "}
          <span className="text-slate-200">{sha}</span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 hover:bg-slate-900"
            >
              {it.label} <span className="text-slate-500">({it.href})</span>
            </Link>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          Tip: bookmark <span className="text-slate-300">/links</span> and start
          every test run from here.
        </p>
      </div>
    </main>
  );
}
