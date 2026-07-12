import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getTeamColor } from "../../constants/f1Colors";

/**
 * ChampionshipChart
 * Round-by-round cumulative points flow for a single, pre-filtered season.
 * Pass the already-filtered array for one season (from `getChampionshipStandings(season)`).
 *
 * Expected input prop `data`:
 * [{ round, driver, team, cumulative_points }]
 */
export default function ChampionshipChart({ data, highlightDrivers = null }) {
  const [hiddenDrivers, setHiddenDrivers] = useState(new Set());

  const { pivoted, drivers, driverConstructor } = useMemo(() => {
    const driverConstructor = new Map();
    const driverSet = new Set();
    for (const row of data) {
      driverSet.add(row.driver);
      if (!driverConstructor.has(row.driver)) {
        driverConstructor.set(row.driver, row.team || row.constructor);
      }
    }
    const drivers = Array.from(driverSet);

    const byRound = new Map();
    for (const row of data) {
      if (!byRound.has(row.round)) byRound.set(row.round, { round: row.round });
      byRound.get(row.round)[row.driver] = row.cumulative_points;
    }
    const pivoted = Array.from(byRound.values()).sort((a, b) => a.round - b.round);

    return { pivoted, drivers, driverConstructor };
  }, [data]);

  function toggleDriver(driver) {
    setHiddenDrivers((prev) => {
      const next = new Set(prev);
      next.has(driver) ? next.delete(driver) : next.add(driver);
      return next;
    });
  }

  function formatLabel(driver) {
    return driver
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  return (
    <div className="bg-[#111111] border border-zinc-800 rounded-lg p-4 w-full text-white">
      <h3 className="text-sm font-semibold text-gray-300 mb-3 tracking-wide uppercase">
        Championship Progression
      </h3>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={pivoted} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-800" />
          <XAxis
            dataKey="round"
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            label={{ value: "Round", position: "insideBottom", offset: -3, fill: "#71717a" }}
          />
          <YAxis
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            label={{ value: "Cumulative Points", angle: -90, position: "insideLeft", fill: "#71717a" }}
          />
          <Tooltip content={<ChampionshipTooltip formatLabel={formatLabel} />} />
          {drivers.map((driver) => {
            const dimmed = highlightDrivers && !highlightDrivers.includes(driver);
            const color = getTeamColor(driverConstructor.get(driver));
            return (
              <Line
                key={driver}
                type="monotone"
                dataKey={driver}
                name={driver}
                stroke={color}
                strokeWidth={dimmed ? 1 : 2.5}
                strokeOpacity={dimmed ? 0.2 : 1}
                dot={false}
                activeDot={{ r: 4 }}
                hide={hiddenDrivers.has(driver)}
                connectNulls={false}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Clickable legend */}
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-800">
        {drivers.map((driver) => {
          const isHidden = hiddenDrivers.has(driver);
          const color = getTeamColor(driverConstructor.get(driver));
          return (
            <button
              key={driver}
              onClick={() => toggleDriver(driver)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-opacity cursor-pointer ${
                isHidden
                  ? "opacity-30 border-zinc-800 text-gray-500"
                  : "opacity-100 border-zinc-700 text-gray-200"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: color }}
              />
              {formatLabel(driver)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChampionshipTooltip({ active, payload, label, formatLabel }) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.value != null)
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;

  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-md px-3 py-2 shadow-xl max-h-64 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-300 mb-1">Round {label}</div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.dataKey} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: row.stroke }}
            />
            <span className="text-gray-200">{formatLabel(row.dataKey)}</span>
            <span className="text-gray-500 ml-auto tabular-nums">{row.value} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}
