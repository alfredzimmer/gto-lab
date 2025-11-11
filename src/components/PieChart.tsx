'use client';

import { useState, useEffect } from 'react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface PieChartProps {
  data: {
    label: string;
    value: number;
    color: string;
  }[];
}

export default function PieChart({ data }: PieChartProps) {
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData = data.map(item => ({
    name: item.label,
    value: item.value,
    color: item.color
  }));

  const hasFullCircle = chartData.length === 1 || chartData.some(item => item.value >= 99.9);

  const renderLegend = (props: any) => {
    const { payload } = props;
    if (!payload || payload.length === 0) return null;
    
    return (
      <div className="flex flex-col gap-1.5">
        {payload.map((entry: any, index: number) => {
          const dataItem = chartData.find(d => d.name === entry.value);
          if (!dataItem) return null;
          
          const isActive = activeIndex === index;
          
          return (
            <div
              key={`legend-${index}`}
              className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                isActive 
                  ? 'bg-slate-100 dark:bg-slate-800' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-slate-900 dark:text-white truncate">
                  {entry.value}
                </span>
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 ml-2">
                {dataItem.value.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {!mounted ? (
        <div className="flex items-center justify-center h-[140px]">
          <div className="text-slate-400 text-sm">Loading...</div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <ResponsiveContainer width="60%" height={140}>
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
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      stroke="none"
                      opacity={activeIndex === null ? 1 : isActive ? 1 : 0.5}
                    />
                  );
                })}
              </Pie>
            </RechartsPie>
          </ResponsiveContainer>
          <div className="flex-1">
            {renderLegend({ payload: chartData.map(d => ({ value: d.name, color: d.color })) })}
          </div>
        </div>
      )}
    </>
  );
}
