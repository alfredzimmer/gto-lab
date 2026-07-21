"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HandResult } from "@/lib/play/session";

interface PointDatum {
  hand: number;
  cumBB: number;
  deltaBB?: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PointDatum }>;
  dark: boolean;
}

interface PnlChartProps {
  results: HandResult[];
  pnlBB: number;
}

/** prefers-color-scheme, tracked live so the chart repaints on theme change. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

const fmt = (n: number) =>
  `${n > 0 ? "+" : ""}${Number.isInteger(n) ? n : n.toFixed(1)}`;

function ChartTooltip({ active, payload, dark }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm tabular-nums"
      style={{
        background: dark ? "#0f172a" : "#ffffff",
        borderColor: dark ? "#1e293b" : "#e2e8f0",
        color: dark ? "#e2e8f0" : "#0f172a",
      }}
    >
      <div className="font-medium">
        {p.hand === 0 ? "Start" : `Hand ${p.hand}`}
      </div>
      {p.hand > 0 && typeof p.deltaBB === "number" && (
        <div style={{ color: p.deltaBB >= 0 ? "#10b981" : "#ef4444" }}>
          {fmt(p.deltaBB)} BB this hand
        </div>
      )}
      <div style={{ color: dark ? "#94a3b8" : "#64748b" }}>
        {fmt(p.cumBB)} BB total
      </div>
    </div>
  );
}

export default function PnlChart({ results, pnlBB }: PnlChartProps) {
  const dark = useIsDark();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Recessive slate grid/axes; the curve carries the app's win/loss polarity.
  const grid = dark ? "#1e293b" : "#e2e8f0";
  const axis = dark ? "#475569" : "#94a3b8";
  const tick = dark ? "#94a3b8" : "#64748b";
  const line =
    pnlBB >= 0 ? (dark ? "#34d399" : "#10b981") : dark ? "#f87171" : "#ef4444";

  if (results.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs text-slate-400 dark:text-slate-500">
        Play a hand to start your PnL curve.
      </div>
    );
  }

  // Anchor the curve at the origin so the first hand's swing reads from zero.
  const data = [{ hand: 0, cumBB: 0, deltaBB: 0 }, ...results];

  if (!mounted) return <div className="h-[200px]" />;

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 4, left: -8 }}
        >
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="hand"
            stroke={axis}
            tick={{ fill: tick, fontSize: 11 }}
            tickLine={false}
            allowDecimals={false}
            minTickGap={24}
          />
          <YAxis
            stroke={axis}
            tick={{ fill: tick, fontSize: 11 }}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => fmt(v)}
          />
          <ReferenceLine y={0} stroke={axis} strokeDasharray="4 4" />
          <Tooltip
            content={<ChartTooltip dark={dark} />}
            cursor={{ stroke: axis, strokeDasharray: "3 3" }}
          />
          <Line
            type="monotone"
            dataKey="cumBB"
            stroke={line}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
