import HeroRangeGrid from "@/components/landing/HeroRangeGrid";

export default function HomePage() {
  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
        Heads-up Poker in Your Browser
      </h1>

      <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-400">
        Game Theory Optimal is the equilibrium strategy of a Texas Hold&apos;em
        Game. A neural network is trained to approximate it for heads-up
        No-Limit Hold&apos;em through Deep CFR self-play.
      </p>

      <div className="mt-10">
        <HeroRangeGrid />
      </div>

      <p className="mt-10 text-xs text-slate-400 dark:text-slate-500">
        <a
          href="https://github.com/alfredzimmer/gto-lab"
          className="underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Source on GitHub
        </a>
        .
      </p>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500 text-balance">
        Your game session is stored locally in your browser.
        This site uses no cookies and no third-party tracking.
      </p>
    </main>
  );
}
