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
      </div>
    </main>
  );
}