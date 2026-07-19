import Link from "next/link";
import HeroRangeGrid from "@/components/landing/HeroRangeGrid";
import Footer from "@/components/layout/Footer";

const STEPS = [
  {
    n: "01",
    title: "Solve",
    body: "A neural network approximates Nash equilibrium via Deep CFR self-play over the full heads-up game — 100 BB stacks, bets discretized to ½ pot, pot, and all-in.",
  },
  {
    n: "02",
    title: "Validate",
    body: "The pipeline is checked against exactly solvable games (Kuhn, Leduc) and probed with local best response. Cross-language parity vectors pin the browser engine to the trainer, bit for bit.",
  },
  {
    n: "03",
    title: "Run locally",
    body: "The strategy network ships as ONNX and runs in your browser via WebAssembly. No account, no API, nothing leaves your machine.",
  },
];

const TOOLS = [
  {
    href: "/ranges",
    name: "Range Explorer",
    tagline: "See the whole strategy",
    body: "Walk any betting line, deal any board, and see the solved action mix for all 169 starting hands — 1,326 combos scored at every node.",
    cta: "Open the explorer",
  },
  {
    href: "/trainer",
    name: "GTO Trainer",
    tagline: "Test yourself against it",
    body: "Get dealt real spots, make your decision, and get graded against the equilibrium mix — then see exactly how the solver plays the hand.",
    cta: "Start training",
  },
];

export default function HomePage() {
  return (
    <>
      <div className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-[#0a0a0a]">
        {/* Hero */}
        <section className="container mx-auto px-4 sm:px-6 max-w-6xl pt-14 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 mb-4">
                Deep CFR · Heads-up No-Limit Hold&apos;em
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                Play the equilibrium.
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-400 max-w-xl">
                GTO Lab is a study tool built on a Deep CFR solver. Every chart
                you explore and every grade you receive is the output of a
                trained equilibrium approximation — reproducible math, not
                someone&apos;s opinion of good poker.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/ranges"
                  className="inline-flex items-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                >
                  Explore ranges
                </Link>
                <Link
                  href="/trainer"
                  className="inline-flex items-center px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Train against it
                </Link>
              </div>

              <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-slate-200 dark:border-slate-800 pt-6 max-w-xl">
                <div className="flex flex-col-reverse gap-1">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    combos scored per node
                  </dt>
                  <dd className="font-mono text-2xl font-semibold text-slate-900 dark:text-white">
                    1,326
                  </dd>
                </div>
                <div className="flex flex-col-reverse gap-1">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    effective stacks solved
                  </dt>
                  <dd className="font-mono text-2xl font-semibold text-slate-900 dark:text-white">
                    100 BB
                  </dd>
                </div>
                <div className="flex flex-col-reverse gap-1">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    servers involved
                  </dt>
                  <dd className="font-mono text-2xl font-semibold text-slate-900 dark:text-white">
                    0
                  </dd>
                </div>
              </dl>
            </div>

            <div className="max-w-lg w-full mx-auto lg:mx-0">
              <HeroRangeGrid />
            </div>
          </div>
        </section>
      </div>

      {/* Methodology */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
        <div className="container mx-auto px-4 sm:px-6 max-w-6xl py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            From self-play to your browser
          </h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400 max-w-2xl">
            Nothing here is hand-tuned or generated by a language model. The
            strategy is trained, verified, and then frozen — what you study is
            what the solver actually converged to.
          </p>
          <div className="mt-10 grid md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="font-mono text-sm text-blue-600 dark:text-blue-400">
                  {s.n}
                </div>
                <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="container mx-auto px-4 sm:px-6 max-w-6xl py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Two ways to study
        </h2>
        <div className="mt-8 grid sm:grid-cols-2 gap-6">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 hover:border-blue-500/60 dark:hover:border-blue-500/60 hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-black/40 transition-all"
            >
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t.tagline}
              </div>
              <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                {t.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {t.body}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                {t.cta}
                <span className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
