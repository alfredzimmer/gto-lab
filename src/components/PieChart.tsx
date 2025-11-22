"use client";

import { useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart as RechartsPie,
  ResponsiveContainer,
} from "recharts";
import type { OddsResult, Player } from "@/lib/types";

const PLAYER_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#6366f1",
  "#f43f5e",
  "#14b8a6",
];

interface PieChartProps {
  odds: OddsResult[];
  players: Player[];
  isSingleHandMode: boolean;
}

export default function PieChart({
  odds,
  players,
  isSingleHandMode,
}: PieChartProps) {
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine if we should display in single hand mode based on props AND data
  // This prevents a flash of incorrect state when transitioning from 1 -> 2 valid players
  // because odds update is delayed by 100ms
  const displayAsSingleHand =
    isSingleHandMode ||
    (odds.length === 1 && odds[0].playerName.includes(" vs "));

  const data =
    odds.length === 0
      ? [{ label: "Tie", value: 100, color: "#64748B" }]
      : displayAsSingleHand
        ? [
            {
              label: odds[0].playerName.split(" vs ")[0],
              value: odds[0].winPercentage,
              color: "#3b82f6",
            },
            ...(odds[0].tiePercentage > 0.1
              ? [
                  {
                    label: "Tie",
                    value: odds[0].tiePercentage,
                    color: "#64748B",
                  },
                ]
              : []),
            {
              label: "Others",
              value: 100 - odds[0].winPercentage - odds[0].tiePercentage,
              color: "#94a3b8",
            },
          ]
        : [
            ...odds.map((playerOdds) => ({
              label: playerOdds.playerName,
              value: playerOdds.winPercentage,
              color:
                PLAYER_COLORS[
                  players.findIndex((p) => p.id === playerOdds.playerId) % 9
                ],
            })),
            ...(odds.length > 0 && odds[0].tiePercentage > 0.1
              ? [
                  {
                    label: "Tie",
                    value: odds[0].tiePercentage,
                    color: "#64748B",
                  },
                ]
              : []),
          ];

  const chartData = data.map((item) => ({
    name: item.label,
    value: item.value,
    color: item.color,
  }));

  const hasFullCircle =
    chartData.length === 1 || chartData.some((item) => item.value >= 99.9);

  const renderLegend = (props: {
    payload?: Array<{ value: string; color: string }>;
  }) => {
    const { payload } = props;
    if (!payload || payload.length === 0) return null;

    return (
      <div className="flex flex-col gap-1.5">
        {payload.map((entry, index) => {
          const dataItem = chartData.find((d) => d.name === entry.value);
          if (!dataItem) return null;

          const isActive = activeIndex === index;

          return (
            <button
              key={`legend-${dataItem.name}-${index}`}
              type="button"
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                isActive
                  ? "bg-slate-100 dark:bg-slate-800"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-slate-900 dark:text-white">
                  {entry.value}
                </span>
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 ml-2 shrink-0">
                {dataItem.value.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
      {!mounted ? (
        <div className="flex items-center justify-center h-[140px]">
          <div className="text-slate-400 text-sm">Loading...</div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-[140px] h-[140px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={hasFullCircle ? 0 : 1}
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={600}
                  animationEasing="ease-out"
                  stroke="none"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {chartData.map((entry, index) => {
                    const isActive = activeIndex === index;
                    return (
                      <Cell
                        key={`cell-${entry.name}-${entry.value}`}
                        fill={entry.color}
                        stroke="none"
                        opacity={activeIndex === null ? 1 : isActive ? 1 : 0.5}
                      />
                    );
                  })}
                </Pie>
              </RechartsPie>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 min-w-32">
            {renderLegend({
              payload: chartData.map((d) => ({
                value: d.name,
                color: d.color,
              })),
            })}
          </div>
        </div>
      )}
    </div>
  );
}
