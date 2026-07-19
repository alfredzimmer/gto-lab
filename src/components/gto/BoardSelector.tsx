"use client";

import { useEffect, useState } from "react";

/**
 * GTO Wizard-style board card selector: a modal with the full 52-card
 * matrix (suit rows x rank columns), slots showing the picked cards,
 * and Random / Clear / Confirm controls. Cards already on the board are
 * disabled. Confirm is enabled only when exactly `count` cards are
 * picked.
 *
 * Cards are engine ints: rank = c % 13 (0 = deuce .. 12 = ace),
 * suit = floor(c / 13) with 0 = clubs, 1 = diamonds, 2 = hearts,
 * 3 = spades.
 */

const RANK_LABELS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];
// Display order: spades, hearts, diamonds, clubs (suit int in parens).
const SUIT_ROWS: { suit: number; symbol: string; red: boolean }[] = [
  { suit: 3, symbol: "♠", red: false },
  { suit: 2, symbol: "♥", red: true },
  { suit: 1, symbol: "♦", red: true },
  { suit: 0, symbol: "♣", red: false },
];

function cardInt(suit: number, rankLabelIndex: number): number {
  return suit * 13 + (12 - rankLabelIndex);
}

function cardLabel(c: number): { text: string; red: boolean } {
  const rank = RANK_LABELS[12 - (c % 13)];
  const row = SUIT_ROWS.find((r) => r.suit === Math.floor(c / 13));
  return { text: `${rank}${row?.symbol ?? "?"}`, red: row?.red ?? false };
}

interface BoardSelectorProps {
  streetName: string;
  count: number;
  usedCards: number[];
  onConfirm: (cards: number[]) => void;
  onClose: () => void;
}

export default function BoardSelector({
  streetName,
  count,
  usedCards,
  onConfirm,
  onClose,
}: BoardSelectorProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const used = new Set(usedCards);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (c: number) => {
    setSelected((sel) => {
      if (sel.includes(c)) return sel.filter((x) => x !== c);
      if (sel.length >= count) return sel;
      return [...sel, c];
    });
  };

  const randomize = () => {
    const dead = new Set(usedCards);
    const deck: number[] = [];
    for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
    const pick: number[] = [];
    for (let i = 0; i < count; i++) {
      const j = Math.floor(Math.random() * deck.length);
      pick.push(deck.splice(j, 1)[0]);
    }
    setSelected(pick);
  };

  const confirm = () => {
    if (selected.length !== count) return;
    // Present high-to-low, the standard board ordering.
    onConfirm([...selected].sort((a, b) => (b % 13) - (a % 13)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Select ${streetName}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl p-4 sm:p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Select {streetName}
          </h2>
          <div className="flex items-center gap-2">
            {Array.from({ length: count }, (_, i) => {
              const c = selected[i];
              if (c === undefined) {
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size slot row
                    key={`empty-${i}`}
                    className="w-10 h-14 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-600"
                  />
                );
              }
              const { text, red } = cardLabel(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  title="Remove"
                  className={`w-10 h-14 rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold text-sm flex items-center justify-center ${
                    red
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {text}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 mb-4">
          {SUIT_ROWS.map((row) => (
            <div key={row.suit} className="flex gap-1 sm:gap-1.5">
              {RANK_LABELS.map((rank, i) => {
                const c = cardInt(row.suit, i);
                const isUsed = used.has(c);
                const isSelected = selected.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={isUsed}
                    onClick={() => toggle(c)}
                    className={`flex-1 min-w-0 aspect-[3/4] rounded-md text-xs sm:text-sm font-bold flex flex-col items-center justify-center transition-all border ${
                      isUsed
                        ? "opacity-20 cursor-not-allowed bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        : isSelected
                          ? "bg-blue-600 text-white border-blue-600 scale-105 shadow-md"
                          : `bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:scale-105 ${
                              row.red
                                ? "text-red-600 dark:text-red-400"
                                : "text-slate-900 dark:text-white"
                            }`
                    }`}
                  >
                    <span className="leading-none">{rank}</span>
                    <span className="leading-none">{row.symbol}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={randomize}
              className="py-2 px-4 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Random
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              className="py-2 px-4 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={selected.length !== count}
              className="py-2 px-5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
