import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800">
      <div className="container mx-auto px-4 sm:px-6 py-10 max-w-6xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            GTO Lab
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Heads-up No-Limit Hold&apos;em solved with Deep CFR. Every number on
            this site is computed, not curated.
          </p>
        </div>
        <nav className="flex gap-6 text-sm">
          <Link
            href="/ranges"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Range Explorer
          </Link>
          <Link
            href="/trainer"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Trainer
          </Link>
          <a
            href="https://github.com/alfredzimmer/gto-lab"
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
