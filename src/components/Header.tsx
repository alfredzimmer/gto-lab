'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import GitHubLink from './GitHubLink';

export default function Header() {
  const pathname = usePathname();
  
  const isStudy = pathname === '/';
  const isPlay = pathname === '/play';

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0a0a]">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-2xl">♠️</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white">
            Poker Odds
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              isStudy
                ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Study
          </Link>
          <Link
            href="/play"
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              isPlay
                ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Play
          </Link>
        </nav>

        <GitHubLink />
      </div>
    </header>
  );
}
