"use client";

import Link from "next/link";
import GitHubLink from "./GitHubLink";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0a0a]">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-lg font-semibold text-slate-900 dark:text-white">
            Poker Equity Calculator
          </span>
        </Link>

        <GitHubLink />
      </div>
    </header>
  );
}
