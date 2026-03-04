// app/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-3xl font-semibold">
          Moving Images Art Exam Simulator
        </h1>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div className="text-sm text-slate-300">Choose a mode:</div>

          <div className="grid grid-cols-1 gap-3">
            <Link
              href="/login?next=/q/1"
              className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-4 hover:bg-slate-900"
            >
              <div className="text-lg font-semibold">Student</div>
              <div className="text-xs text-slate-400">
                Start the exam at Question 1
              </div>
            </Link>

            <Link
              href="/login?next=/admin"
              className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-4 hover:bg-slate-900"
            >
              <div className="text-lg font-semibold">Admin</div>
              <div className="text-xs text-slate-400">
                Question Builder • Media • Answers
              </div>
            </Link>
          </div>

          <div className="pt-2 text-xs text-slate-400">
            Need to sign in?{" "}
            <Link href="/login?next=/" className="underline hover:text-slate-200">
              Go to Login
            </Link>
          </div>
        </div>
                {process.env.NODE_ENV === "development" ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-900/10 p-4 space-y-3">
            <div className="text-sm font-semibold text-amber-200">
              Dev Quick Links (localhost only)
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Link
                href="/q/1"
                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 hover:bg-slate-900"
              >
                Student: /q/1 (skip login if already signed in)
              </Link>

              <Link
                href="/admin"
                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 hover:bg-slate-900"
              >
                Admin Hub: /admin
              </Link>

              <Link
                href="/admin/tests"
                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 hover:bg-slate-900"
              >
                Test Builder: /admin/tests
              </Link>

              <Link
                href="/admin/questions"
                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 hover:bg-slate-900"
              >
                Questions: /admin/questions
              </Link>

              <Link
                href="/admin/media"
                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 hover:bg-slate-900"
              >
                Media: /admin/media
              </Link>

              <Link
                href="/admin/answers"
                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-3 hover:bg-slate-900"
              >
                Answers: /admin/answers
              </Link>
            </div>

            <div className="text-xs text-amber-200/80">
              Tip: If you’re already logged in, these take you straight there.
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}