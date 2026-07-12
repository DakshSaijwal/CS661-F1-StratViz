import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import WorldMap from "../components/WorldMap";
import ChampionshipChart from "../components/charts/ChampionshipChart";
import EraBumpChart from "../components/charts/EraBumpChart";
import LoadingSkeleton from "../components/layout/LoadingSkeleton";
import { getChampionshipStandings, getEraStandings } from "../lib/queries";
import raceData from "../constants/raceLocations.json";

const ALL_YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i); // 2000-2024
const WINDOW_SIZE = 7;

export default function LandingPage() {
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState(2024);
  const [windowStart, setWindowStart] = useState(ALL_YEARS.length - WINDOW_SIZE);
  const [showOverYears, setShowOverYears] = useState(false);

  // Championship Progress data (bottom-right panel)
  const [champData, setChampData] = useState([]);
  const [champLoading, setChampLoading] = useState(true);

  // Era Bump Chart data (Over the Years modal)
  const [eraData, setEraData] = useState([]);
  const [eraLoading, setEraLoading] = useState(false);

  const visibleYears = ALL_YEARS.slice(windowStart, windowStart + WINDOW_SIZE);

  const races = useMemo(() => {
    return raceData.racesByYear[selectedYear] || [];
  }, [selectedYear]);

  // Fetch championship standings when year changes
  useEffect(() => {
    setChampLoading(true);
    getChampionshipStandings(selectedYear).then((d) => {
      setChampData(d);
      setChampLoading(false);
    });
  }, [selectedYear]);

  // Fetch era data when modal opens (only once)
  useEffect(() => {
    if (showOverYears && eraData.length === 0) {
      setEraLoading(true);
      getEraStandings().then((d) => {
        setEraData(d);
        setEraLoading(false);
      });
    }
  }, [showOverYears]);

  function handlePrev() {
    setWindowStart((s) => Math.max(0, s - 1));
  }

  function handleNext() {
    setWindowStart((s) => Math.min(ALL_YEARS.length - WINDOW_SIZE, s + 1));
  }

  function handleRaceClick(race) {
    navigate(`/race/${selectedYear}/${race.race_id}`);
  }

  return (
    <div className="relative w-full h-screen bg-[#0a0e14] overflow-hidden">
      {/* World Map (full background) */}
      <div className="absolute inset-0">
        <WorldMap races={races} onRaceClick={handleRaceClick} />
      </div>

      {/* Floating year selector + Over the Years button */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[#121822]/90 backdrop-blur-sm border border-[#26303f] rounded-xl px-4 py-3">
        <button
          onClick={handlePrev}
          disabled={windowStart === 0}
          className="text-white/70 hover:text-white disabled:opacity-30 px-2 py-1 text-lg cursor-pointer disabled:cursor-default"
        >
          ←
        </button>

        <div className="flex gap-1">
          {visibleYears.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                year === selectedYear
                  ? "bg-[#e10600] text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#1b2431]"
              }`}
            >
              {year}
            </button>
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={windowStart >= ALL_YEARS.length - WINDOW_SIZE}
          className="text-white/70 hover:text-white disabled:opacity-30 px-2 py-1 text-lg cursor-pointer disabled:cursor-default"
        >
          →
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-[#26303f] mx-1" />

        {/* Over the Years button */}
        <button
          onClick={() => setShowOverYears(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[#26303f] text-gray-300 hover:text-white hover:border-[#e10600] hover:bg-[#e10600]/10 transition-all cursor-pointer whitespace-nowrap"
        >
          Over the Years
        </button>
      </div>

      {/* Championship Progress panel (bottom-right) */}
      <div className="absolute bottom-8 right-6 z-10 w-[420px] h-[280px] bg-[#121822]/90 backdrop-blur-sm border border-[#26303f] rounded-xl overflow-hidden flex flex-col transition-all duration-300 ease-out hover:w-[580px] hover:h-[400px] hover:border-[#e10600]/50 hover:shadow-lg hover:shadow-[#e10600]/10">
        <div className="flex-1 overflow-hidden">
          {champLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSkeleton height="100%" />
            </div>
          ) : (
            <div className="w-full h-full [&_.bg-\\[\\#111111\\]]:bg-transparent [&_.border-zinc-800]:border-transparent [&_h3]:hidden">
              <ChampionshipChart data={champData} />
            </div>
          )}
        </div>
      </div>

      {/* "Over the Years" modal popup */}
      {showOverYears && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowOverYears(false)}
          />
          {/* Modal */}
          <div className="relative w-[90vw] max-w-[1000px] h-[80vh] max-h-[700px] bg-[#121822] border border-[#26303f] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#26303f] flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Over the Years (2000–2024)</h2>
              <button
                onClick={() => setShowOverYears(false)}
                className="text-gray-400 hover:text-white text-xl leading-none cursor-pointer px-2"
              >
                ✕
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {eraLoading ? (
                <LoadingSkeleton height="450px" />
              ) : eraData.length > 0 ? (
                <EraBumpChart data={eraData} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Loading era data...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hint text */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-500 text-sm z-10">
        Select a season, then click a race pin to dive in.
      </p>
    </div>
  );
}
