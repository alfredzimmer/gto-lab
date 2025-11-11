'use client';

import type { OddsResult } from '@/lib/types';

interface OddsDisplayProps {
  odds: OddsResult[];
  isCalculating: boolean;
}

export default function OddsDisplay({ odds, isCalculating }: OddsDisplayProps) {
  if (isCalculating) {
    return (
      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-center text-blue-900 dark:text-blue-200">
          Calculating odds...
        </p>
      </div>
    );
  }

  if (odds.length === 0) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-center text-gray-600 dark:text-gray-400">
          Add at least 2 players with complete hands to calculate odds
        </p>
      </div>
    );
  }

  const sortedOdds = [...odds].sort((a, b) => b.winPercentage - a.winPercentage);

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Win Probabilities
      </h3>
      <div className="space-y-2">
        {sortedOdds.map((playerOdds, index) => (
          <div 
            key={playerOdds.playerId}
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gray-900 dark:text-white">
                {index === 0 && '👑 '}{playerOdds.playerName}
              </span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {playerOdds.winPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-linear-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${playerOdds.winPercentage}%` }}
              />
            </div>
            {playerOdds.tiePercentage > 0.1 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Tie: {playerOdds.tiePercentage.toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
