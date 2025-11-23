import type { PracticeSettings } from "@/app/actions/practice";
import type { Dispatch, SetStateAction } from "react";

interface PracticeSettingsPanelProps {
  settings: PracticeSettings;
  setSettings: Dispatch<SetStateAction<PracticeSettings>>;
  onApply: () => void;
}

export default function PracticeSettingsPanel({
  settings,
  setSettings,
  onApply,
}: PracticeSettingsPanelProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm">
      <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
        Settings
      </h2>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <div className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Opponents Range ({settings.minOpponents} - {settings.maxOpponents})
          </div>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <div className="flex justify-between text-[10px] sm:text-xs text-slate-500 mb-1">
                <span>Min Opponents</span>
                <span>{settings.minOpponents}</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                value={settings.minOpponents}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSettings((s) => ({
                    ...s,
                    minOpponents: val,
                    maxOpponents: Math.max(val, s.maxOpponents),
                  }));
                }}
                className="w-full accent-slate-900 dark:accent-white"
                aria-label="Minimum opponents"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] sm:text-xs text-slate-500 mb-1">
                <span>Max Opponents</span>
                <span>{settings.maxOpponents}</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                value={settings.maxOpponents}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSettings((s) => ({
                    ...s,
                    maxOpponents: val,
                    minOpponents: Math.min(val, s.minOpponents),
                  }));
                }}
                className="w-full accent-slate-900 dark:accent-white"
                aria-label="Maximum opponents"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="block text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Difficulty
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["easy", "medium", "hard"] as const).map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, difficulty: diff }))}
                className={`py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm rounded-lg border transition-colors capitalize ${
                  settings.difficulty === diff
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 mt-2">
            {settings.difficulty === "easy" &&
              "Bets vary widely (+/- 25%). Easier to spot mistakes."}
            {settings.difficulty === "medium" &&
              "Bets vary normally (+/- 15%). Standard play."}
            {settings.difficulty === "hard" &&
              "Bets are very precise (+/- 7.5%). Tough decisions."}
          </p>
        </div>

        <button
          type="button"
          onClick={onApply}
          className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm sm:text-base font-medium rounded-lg transition-colors"
        >
          Apply & Deal New Hand
        </button>
      </div>
    </div>
  );
}
