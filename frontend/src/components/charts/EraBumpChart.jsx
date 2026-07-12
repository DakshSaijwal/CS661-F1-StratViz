import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getTeamColor } from "../../constants/f1Colors";

/**
 * EraBumpChart
 * Historical progression of end-of-season championship rank, 2000-2024.
 * Toggles between driver-level and constructor-level rank, with a
 * multi-select focus+context filter.
 *
 * Props: { data: [{ season, driver, team, position }] }
 */
export default function EraBumpChart({ data, constructorData = null }) {
  const [viewMode, setViewMode] = useState("drivers");
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const seasons = useMemo(() => {
    return Array.from(new Set(data.map((d) => d.season))).sort((a, b) => a - b);
  }, [data]);

  const driverLatestTeam = useMemo(() => {
    const map = new Map();
    for (const row of [...data].sort((a, b) => a.season - b.season)) {
      map.set(row.driver, row.team);
    }
    return map;
  }, [data]);

  const derivedConstructorRanks = useMemo(() => {
    if (constructorData) return constructorData;
    const bySeasonTeam = new Map();
    for (const row of data) {
      const key = `${row.season}__${row.team}`;
      if (!bySeasonTeam.has(key)) {
        bySeasonTeam.set(key, { season: row.season, team: row.team, positions: [] });
      }
      bySeasonTeam.get(key).positions.push(row.position);
    }
    const bySeason = new Map();
    for (const entry of bySeasonTeam.values()) {
      const avg = entry.positions.reduce((a, b) => a + b, 0) / entry.positions.length;
      if (!bySeason.has(entry.season)) bySeason.set(entry.season, []);
      bySeason.get(entry.season).push({ team: entry.team, avg });
    }
    const rows = [];
    for (const [season, teams] of bySeason.entries()) {
      const ranked = [...teams].sort((a, b) => a.avg - b.avg);
      ranked.forEach((t, idx) => {
        rows.push({ season, team: t.team, position: idx + 1 });
      });
    }
    return rows;
  }, [data, constructorData]);

  const activeRows = viewMode === "drivers" ? data : derivedConstructorRanks;
  const entityField = viewMode === "drivers" ? "driver" : "team";

  const entities = useMemo(
    () => Array.from(new Set(activeRows.map((r) => r[entityField]))).sort(),
    [activeRows, entityField]
  );

  const pivoted = useMemo(() => {
    const bySeason = new Map();
    for (const season of seasons) bySeason.set(season, { season });
    for (const row of activeRows) {
      bySeason.get(row.season)[row[entityField]] = row.position;
    }
    return Array.from(bySeason.values());
  }, [activeRows, seasons, entityField]);

  const maxPosition = useMemo(
    () => Math.max(...activeRows.map((r) => r.position), 10),
    [activeRows]
  );

  function toggleEntity(entity) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(entity) ? next.delete(entity) : next.add(entity);
      return next;
    });
  }

  function switchMode(mode) {
    setViewMode(mode);
    setSelected(new Set());
    setSearch("");
  }

  function formatLabel(entity) {
    if (viewMode === "constructors") return entity;
    return entity
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  function entityColor(entity) {
    const team = viewMode === "drivers" ? driverLatestTeam.get(entity) : entity;
    return getTeamColor(team);
  }

  const filteredEntities = entities.filter((e) =>
    formatLabel(e).toLowerCase().includes(search.toLowerCase())
  );

  const hasSelection = selected.size > 0;

  return (
    <div className="bg-[#111111] border border-zinc-800 rounded-lg p-4 w-full text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-300 tracking-wide uppercase">
          Era Progression · {seasons[0]}–{seasons[seasons.length - 1]}
        </h3>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-zinc-800 overflow-hidden">
            <button
              onClick={() => switchMode("drivers")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "drivers"
                  ? "bg-[#e10600] text-white"
                  : "bg-[#0a0a0a] text-gray-400 hover:text-white"
              }`}
            >
              View Drivers
            </button>
            <button
              onClick={() => switchMode("constructors")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-zinc-800 cursor-pointer ${
                viewMode === "constructors"
                  ? "bg-[#e10600] text-white"
                  : "bg-[#0a0a0a] text-gray-400 hover:text-white"
              }`}
            >
              View Constructors
            </button>
          </div>

          {/* Multi-select filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-800 bg-[#0a0a0a] text-gray-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
            >
              {hasSelection ? `${selected.size} selected` : "Select entities"} ▾
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-[#0a0a0a] border border-zinc-800 rounded-md shadow-xl z-20 p-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${viewMode}...`}
                  className="w-full mb-2 px-2 py-1.5 text-xs bg-[#111111] border border-zinc-800 rounded text-white placeholder-gray-500 focus:outline-none focus:border-zinc-600"
                />
                <div className="flex justify-between mb-2 px-1">
                  <button
                    onClick={() => setSelected(new Set(entities))}
                    className="text-[11px] text-gray-400 hover:text-white cursor-pointer"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-[11px] text-gray-400 hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                {filteredEntities.map((entity) => (
                  <label
                    key={entity}
                    className="flex items-center gap-2 px-1 py-1 text-xs text-gray-200 hover:bg-zinc-900 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(entity)}
                      onChange={() => toggleEntity(entity)}
                      className="accent-[#e10600]"
                    />
                    <span
                      className="w-2 h-2 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: entityColor(entity) }}
                    />
                    {formatLabel(entity)}
                  </label>
                ))}
                {filteredEntities.length === 0 && (
                  <div className="text-xs text-gray-500 px-1 py-2">No matches</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={440}>
        <LineChart data={pivoted} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-800" />
          <XAxis
            dataKey="season"
            type="number"
            domain={[seasons[0], seasons[seasons.length - 1]]}
            ticks={seasons}
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            label={{ value: "Season", position: "insideBottom", offset: -3, fill: "#71717a" }}
          />
          <YAxis
            reversed
            type="number"
            domain={[1, maxPosition]}
            allowDecimals={false}
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            label={{ value: "Championship Position", angle: -90, position: "insideLeft", fill: "#71717a" }}
          />
          <Tooltip content={<BumpTooltip formatLabel={formatLabel} />} />
          {entities.map((entity) => {
            const isSelected = !hasSelection || selected.has(entity);
            const color = hasSelection && !selected.has(entity) ? "#3f3f46" : entityColor(entity);
            return (
              <Line
                key={entity}
                type="linear"
                dataKey={entity}
                name={entity}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : 1}
                strokeOpacity={isSelected ? 1 : 0.15}
                dot={isSelected ? { r: 3, fill: color, strokeWidth: 0 } : false}
                activeDot={isSelected ? { r: 5 } : false}
                connectNulls={false}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BumpTooltip({ active, payload, label, formatLabel }) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.value != null)
    .sort((a, b) => a.value - b.value);
  if (rows.length === 0) return null;

  return (
    <div className="bg-[#0a0a0a] border border-zinc-800 rounded-md px-3 py-2 shadow-xl">
      <div className="text-xs font-semibold text-gray-300 mb-1">Season {label}</div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.dataKey} className="flex items-center gap-2 text-[11px]">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: row.stroke }}
            />
            <span className="text-gray-200">{formatLabel(row.dataKey)}</span>
            <span className="text-gray-500 ml-auto">P{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
