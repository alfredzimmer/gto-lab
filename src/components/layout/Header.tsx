"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GitHubLink from "./GitHubLink";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/app/(auth)/login/actions";

interface HeaderProps {
  user: User | null;
}

export default function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  const navItems = [
    { name: "Calculator", href: "/" },
    { name: "Practice", href: "/practice" },
    { name: "Dashboard", href: "/dashboard", protected: true },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0a0a]">
      <div className="container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-lg font-semibold text-slate-900 dark:text-white hidden sm:inline">
              Poker Equity Playground
            </span>
            <span className="text-lg font-semibold text-slate-900 dark:text-white inline sm:hidden">
              PEP
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const href = item.protected && !user ? "/login" : item.href;

              return (
                <Link
                  key={item.name}
                  href={href}
                  className={`sm:w-24 w-auto flex justify-center px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {user ? (
            <div className="relative group">
              <button
                type="button"
                className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-default max-w-20 sm:max-w-none truncate block"
              >
                {user.email}
              </button>
              <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="bg-white dark:bg-slate-900 rounded-md shadow-lg border border-slate-200 dark:border-slate-800 p-1 min-w-[120px]">
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white hover:underline whitespace-nowrap"
            >
              Sign In
            </Link>
          )}
          <GitHubLink />
        </div>
      </div>
    </header>
  );
}
