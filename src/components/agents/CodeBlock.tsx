"use client";

import { useState } from "react";

/**
 * A copyable code/command block for the Agents setup page. Non-coders can
 * one-click copy the exact URL or config without worrying about selecting text.
 */
export default function CodeBlock({
  code,
  label,
}: {
  code: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permissions) — selecting still works.
    }
  };

  return (
    <div className="relative group">
      {label && (
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 pr-12 text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-200">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        aria-label="Copy to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
