import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import CardDisplay from "@/components/cards/CardDisplay";
import type { Card } from "@/lib/types";

const PAGE_SIZE = 10;

interface DashboardPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const supabase = await createClient();
  const { page: pageParam } = await searchParams;
  const page = Number(pageParam) || 1;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: allStats, error: statsError } = await supabase
    .from("practice_logs")
    .select("ev, user_decision, is_correct")
    .eq("user_id", user.id);

  if (statsError) {
    console.error("Error fetching stats:", statsError);
    return <div>Error loading dashboard data.</div>;
  }

  const totalHands = allStats?.length || 0;
  const correctDecisions =
    allStats?.filter((log) => log.is_correct).length || 0;
  const accuracy = totalHands > 0 ? (correctDecisions / totalHands) * 100 : 0;
  const totalEV =
    allStats?.reduce((acc, log) => {
      const handEV = Number(log.ev) || 0;
      return acc + (log.user_decision === "call" ? handEV : 0);
    }, 0) || 0;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: logs, error: logsError } = await supabase
    .from("practice_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (logsError) {
    console.error("Error fetching logs:", logsError);
    return <div>Error loading dashboard data.</div>;
  }

  const totalPages = Math.ceil(totalHands / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-4 sm:px-6 py-8 max-w-[1400px]">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track your progress and analyze your decision making.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Total Hands Played
            </h3>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {totalHands}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Overall Accuracy
            </h3>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {accuracy.toFixed(1)}%
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Net PnL (EV)
            </h3>
            <div
              className={`text-3xl font-bold ${
                totalEV >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {totalEV >= 0 ? "+" : ""}
              {totalEV.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Recent Hands
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Hand</th>
                  <th className="px-6 py-4 font-medium">Board</th>
                  <th className="px-6 py-4 font-medium">Decision</th>
                  <th className="px-6 py-4 font-medium">Result</th>
                  <th className="px-6 py-4 font-medium">EV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {logs?.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 scale-75 origin-left">
                        {(log.hero_cards as Card[]).map((card) => (
                          <CardDisplay
                            key={`${card.rank}-${card.suit}`}
                            card={card}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 scale-75 origin-left">
                        {(log.board_cards as Card[]).map((card) => (
                          <CardDisplay
                            key={`${card.rank}-${card.suit}`}
                            card={card}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          log.user_decision === "call"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {log.user_decision}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.is_correct
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        }`}
                      >
                        {log.is_correct ? "Correct" : "Incorrect"}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono">
                      <span
                        className={
                          Number(log.ev) > 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }
                      >
                        {Number(log.ev) > 0 ? "+" : ""}
                        {Number(log.ev).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!logs || logs.length === 0) && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-slate-500 dark:text-slate-400"
                    >
                      No practice history yet. Go play some hands!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-center items-center gap-4 mt-6">
          {page > 1 && (
            <Link
              href={`/dashboard?page=${page - 1}`}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Page {page} of {totalPages || 1}
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard?page=${page + 1}`}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
            >
              Next
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
