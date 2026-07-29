import type { Metadata } from "next";
import CodeBlock from "@/components/agents/CodeBlock";

export const metadata: Metadata = {
  title: "AI Agents",
  description:
    "Connect GTO Lab to Claude, Cursor, and other AI assistants over MCP and ask poker questions in plain English — answered straight from the solver.",
};

const HOSTED_URL = "https://gto-thingy.vercel.app/api/mcp";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400">
        {children}
      </div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 sm:p-5">
      {children}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24">
      <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        New — connect your AI
      </span>

      <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
        Use GTO Lab from your AI assistant
      </h1>

      <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-400">
        GTO Lab plugs into AI assistants like Claude and Cursor, so you can ask
        poker questions in plain English and get answers straight from the
        solver — the same Deep&nbsp;CFR strategy that powers this site. No
        coding required: paste one link into your app and you&apos;re connected.
      </p>

      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
        It works through{" "}
        <a
          href="https://modelcontextprotocol.io"
          className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
        >
          MCP
        </a>{" "}
        (Model Context Protocol), the standard way AI apps connect to outside
        tools.
      </p>

      <Section title="What you can ask">
        <p>
          Once connected, your assistant can answer questions like these by
          calling the solver directly:
        </p>
        <ul className="space-y-2">
          {[
            "“I have As Ks in the small blind — what's the GTO play?”",
            "“On J♥ 7♣ 2♠ after I raise and get called, how often should I c-bet?”",
            "“Show me the big blind's calling range facing a small-blind open.”",
          ].map((q) => (
            <li
              key={q}
              className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-slate-700 dark:text-slate-300"
            >
              {q}
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Under the hood it exposes two tools —{" "}
          <span className="font-mono text-slate-700 dark:text-slate-300">
            get_gto_strategy
          </span>{" "}
          (the best action mix at one decision) and{" "}
          <span className="font-mono text-slate-700 dark:text-slate-300">
            get_range_grid
          </span>{" "}
          (the full 13×13 starting-hand chart). Your assistant picks the right
          one automatically.
        </p>
      </Section>

      <Section title="Quick connect">
        <p>
          The address of the GTO Lab server is a single link. Copy it —
          you&apos;ll paste it into your AI app below.
        </p>
        <CodeBlock code={HOSTED_URL} label="GTO Lab MCP server URL" />

        <div className="space-y-5 mt-2">
          <Card>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Claude Desktop
            </h3>
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-sm">
              <li>
                Open <strong>Settings → Connectors</strong> (or{" "}
                <strong>Developer</strong>).
              </li>
              <li>
                Choose <strong>Add custom connector</strong> and paste the URL
                above.
              </li>
              <li>Save, then start a new chat and ask a poker question.</li>
            </ol>
          </Card>

          <Card>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Cursor, Windsurf, and other config-file apps
            </h3>
            <p className="mt-2 text-sm">
              Add GTO Lab to the app&apos;s MCP config (in Cursor:{" "}
              <strong>Settings → MCP → Add new server</strong>):
            </p>
            <div className="mt-3">
              <CodeBlock
                code={`{
  "mcpServers": {
    "gto-lab": {
      "url": "${HOSTED_URL}"
    }
  }
}`}
              />
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Claude Code (terminal)
            </h3>
            <p className="mt-2 text-sm">Run one command:</p>
            <div className="mt-3">
              <CodeBlock
                code={`claude mcp add --transport http gto-lab ${HOSTED_URL}`}
              />
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              App only supports “command” servers?
            </h3>
            <p className="mt-2 text-sm">
              Some older apps can&apos;t take a URL directly. Use this bridge
              config instead — it needs{" "}
              <a
                href="https://nodejs.org"
                className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Node.js
              </a>{" "}
              installed:
            </p>
            <div className="mt-3">
              <CodeBlock
                code={`{
  "mcpServers": {
    "gto-lab": {
      "command": "npx",
      "args": ["mcp-remote", "${HOSTED_URL}"]
    }
  }
}`}
              />
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Good to know">
        <ul className="space-y-2 list-disc ml-4">
          <li>
            <strong>It&apos;s free.</strong> The hosted server is shared and
            rate-limited (about 30 requests per minute) so everyone gets a turn.
          </li>
          <li>
            <strong>Heads-up, 100&nbsp;big&nbsp;blinds.</strong> The solver
            covers 1-v-1 No-Limit Hold&apos;em with ½-pot, pot, 2×-pot and
            all-in bet sizes — the same model as the rest of this site.
          </li>
          <li>
            <strong>Your prompts aren&apos;t stored.</strong> Each request is
            answered and forgotten.
          </li>
        </ul>
      </Section>

      <Section title="Run your own (developers)">
        <p>
          Want higher limits or to run it locally? The server is open source —
          host your own on Vercel, or run it over stdio from a clone. Full
          instructions, including the two tools&apos; exact inputs:
        </p>
        <p className="text-sm">
          <a
            href="https://github.com/alfredzimmer/gto-lab/blob/main/mcp/README.md"
            className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
          >
            MCP server docs on GitHub →
          </a>
        </p>
      </Section>
    </main>
  );
}
