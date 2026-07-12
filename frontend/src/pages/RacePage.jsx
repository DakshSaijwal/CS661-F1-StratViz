import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getChampionshipStandings, getRaceLeaderboard } from "../lib/queries";
import ChampionshipChart from "../components/charts/ChampionshipChart";
import PositionChart from "../components/charts/PositionChart";
import PitStopGantt from "../components/charts/PitStopGantt";
import ParallelCoordinates from "../components/charts/ParallelCoordinates";
import LoadingSkeleton from "../components/layout/LoadingSkeleton";
import raceData from "../constants/raceLocations.json";

/**
 * Race Detail Page — /race/:season/:raceId
 * 3 regions: Left leaderboard, Center simulator placeholder, Bottom toggle panels
 */
export default function RacePage() {
  const { season, raceId } = useParams();
  const navigate = useNavigate();
  const seasonNum = Number(season);

  // Find race info from static data
  const raceInfo = useMemo(() => {
    const races = raceData.racesByYear[season] || [];
    return races.find((r) => r.race_id === raceId) || { race_name: "Race" };
  }, [season, raceId]);

  // Leaderboard placeholder data (will be replaced with real query)
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeToggle, setActiveToggle] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Fetch real leaderboard from HF via DuckDB
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  useEffect(() => {
    setLeaderboardLoading(true);
    const round = raceId.split("_")[1];
    getRaceLeaderboard(seasonNum, Number(round)).then((data) => {
      setLeaderboard(data);
      setLeaderboardLoading(false);
    });
  }, [raceId, seasonNum]);

  // Load championship chart data when that toggle is active
  useEffect(() => {
    if (activeToggle === "championship") {
      setChartLoading(true);
      getChampionshipStandings(seasonNum).then((d) => {
        setChartData(d);
        setChartLoading(false);
      });
    }
  }, [activeToggle, seasonNum]);

  function formatDriverName(driver) {
    return driver
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  function handleToggle(id) {
    setActiveToggle((prev) => (prev === id ? null : id));
  }

  return (
    <div className="h-screen bg-[#0a0e14] flex overflow-hidden">
      {/* LEFT PANEL — Leaderboard */}
      <aside className="w-[300px] flex-shrink-0 bg-[#121822] border-r border-[#26303f] flex flex-col overflow-y-auto">
        {/* Back button */}
        <button
          onClick={() => navigate("/")}
          className="text-left text-sm text-gray-400 hover:text-white px-4 py-3 border-b border-[#26303f] cursor-pointer"
        >
          ← Back to map
        </button>

        {/* Race title */}
        <div className="px-4 py-4 border-b border-[#26303f]">
          <h2 className="text-lg font-bold text-white">{raceInfo.race_name}</h2>
          <p className="text-xs text-gray-500">Season {season} · Round {raceInfo.round}</p>
        </div>

        {/* Classification */}
        <div className="flex-1 px-2 py-2">
          {leaderboardLoading && (
            <div className="text-center text-gray-500 text-sm py-8">Loading results...</div>
          )}
          {!leaderboardLoading && leaderboard.map((entry, i) => (
            <div
              key={i}
              onClick={() => console.log("Driver clicked:", entry.driver)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-[#1b2431] transition-colors"
            >
              <span className={`w-6 text-center text-sm font-bold ${
                entry.status === "DNF" ? "text-red-500" : "text-gray-300"
              }`}>
                {entry.position ?? "DNF"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">
                  {formatDriverName(entry.driver)}
                </div>
                <div className="text-xs text-gray-500">{entry.team}</div>
              </div>
              <span className="text-xs text-gray-400">{entry.points} pts</span>
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* CENTER — Race Simulator Placeholder */}
        <div className="flex-1 flex items-center justify-center p-6 min-h-[300px]">
          <div className="w-full h-full max-w-4xl border-2 border-dashed border-[#26303f] rounded-xl flex flex-col items-center justify-center gap-4">
            <h3 className="text-xl font-semibold text-gray-400">Race Simulator</h3>
            <div className="flex items-center gap-4">
              <button
                disabled
                className="w-12 h-12 rounded-full bg-[#1b2431] border border-[#26303f] flex items-center justify-center opacity-50"
              >
                <span className="text-gray-500 text-lg">▶</span>
              </button>
              <span className="text-gray-500 text-sm">Lap 0 / 57</span>
            </div>
            <p className="text-xs text-gray-600 max-w-sm text-center">
              Animated race replay using real driver lap times — coming soon.
            </p>
          </div>
        </div>

        {/* BOTTOM — Toggle buttons + panel */}
        <div className="border-t border-[#26303f]">
          {/* Toggle buttons */}
          <div className="flex gap-2 px-6 py-3 bg-[#121822]">
            {[
              { id: "tire", label: "Tire Strategy" },
              { id: "position", label: "Lap-by-Lap Position" },
              { id: "strategy", label: "Strategic Archetypes" },
              { id: "championship", label: "Championship Standings" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleToggle(id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                  activeToggle === id
                    ? "border-[#e10600] text-[#e10600] bg-[#e10600]/10"
                    : "border-[#26303f] text-gray-400 hover:text-white hover:border-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Toggle panel content */}
          {activeToggle && (
            <div className="px-6 py-4 bg-[#0a0e14] max-h-[85vh] overflow-y-auto">
              {activeToggle === "tire" && (
                <PitStopGantt raceId={raceId} />
              )}
              {activeToggle === "position" && (
                <PositionChart raceId={raceId} />
              )}
              {activeToggle === "strategy" && (
                <ParallelCoordinates raceId={raceId} />
              )}
              {activeToggle === "championship" && (
                chartLoading ? (
                  <LoadingSkeleton height="350px" />
                ) : (
                  <ChampionshipChart data={chartData} />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
