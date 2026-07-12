# CS661 F1 Visual Analytics — StratViz

An F1 visual analytics web app built for CS661 (Big Data Visual Analytics). The app runs entirely in the browser — no backend server. Data is queried from Parquet files hosted on HuggingFace using DuckDB-WASM (SQL engine compiled to WebAssembly).

**Live site:** (add Vercel URL here once deployed)
**Data:** https://huggingface.co/datasets/Aman2406/f1-visual-analytics
**Repo:** https://github.com/DakshSaijwal/CS661-F1-StratViz

---

## Quick Start (run locally)

```bash
cd frontend
npm install
npx vite
```

Open http://localhost:5173 in your browser. That's it — data is fetched from HuggingFace automatically.

**Requirements:** Node.js 18+ (check with `node --version`)

---

## App Structure (2 Pages)

### Page 1 — `/` — World Map Landing

Full-screen interactive D3 world map showing race circuit locations as red pins.

- **Year selector** (floating bar at top): Shows 7 years at a time from 2000-2024, arrows to scroll. Clicking a year loads that season's race pins on the map.
- **Magnifying lens**: Follows cursor, magnifies the area under it (focus+context technique).
- **Race pins**: Hovering shows race name tooltip. Clicking navigates to Page 2.
- **Data source**: `src/constants/raceLocations.json` (static, 38 circuits with lat/lng coordinates).

### Page 2 — `/race/:season/:raceId` — Race Detail

Three regions:

1. **Left Panel (Leaderboard)**: Full race classification — position, driver name, team, points, DNF status. Every row is clickable (scaffolded for future driver-detail feature, currently console.log only). Data fetched live via `getRaceLeaderboard()`.

2. **Center (Race Simulator)**: Placeholder area for future animated race replay. Shows disabled play button + lap counter. Do not build simulator logic yet.

3. **Bottom (Toggle Panels)**: Three buttons — only one panel open at a time:
   - **Tire Strategy** — placeholder for PitStopGantt chart (not yet built)
   - **Lap-by-Lap Position** — placeholder for PositionChart (not yet built)
   - **Championship Standings** — WORKING, uses `ChampionshipChart` with real data from HF

---

## Project Structure

```
├── frontend/                        # React + Vite app (deployed to Vercel)
│   ├── index.html                   # HTML entry point
│   ├── vite.config.js               # Vite config (React + Tailwind plugins)
│   ├── package.json                 # Dependencies: react, d3, recharts, duckdb-wasm, etc.
│   └── src/
│       ├── main.jsx                 # React entry — mounts <App /> to #root
│       ├── App.jsx                  # Router: "/" → LandingPage, "/race/:season/:raceId" → RacePage
│       ├── index.css                # Tailwind import + dark theme globals (#0a0a0a bg)
│       │
│       ├── lib/                     # DATA LAYER — the "backend" (runs in browser)
│       │   ├── duckdb.js            # Initializes DuckDB-WASM singleton, fetches 4 parquet
│       │   │                        #   files from HuggingFace, registers as SQL views.
│       │   │                        #   Exports: getConnection(), query(sql)
│       │   └── queries.js           # 16 exported async functions — each runs SQL via
│       │                            #   DuckDB and returns plain JS array of objects.
│       │                            #   This is the "API" all components call.
│       │
│       ├── components/
│       │   ├── WorldMap.jsx         # D3 world map with race pins + magnifying lens
│       │   │                        #   Props: { races: [{race_id, round, race_name, lat, lng}],
│       │   │                        #            onRaceClick: (race) => void }
│       │   │
│       │   ├── charts/              # VISUALIZATION COMPONENTS
│       │   │   └── ChampionshipChart.jsx
│       │   │       # Recharts line chart: cumulative points per driver across rounds
│       │   │       # Props: { data: [{driver, round, cumulative_points, constructor}],
│       │   │       #          highlightDrivers?: string[] }
│       │   │       # NEEDS TO BE BUILT: PositionChart.jsx, PitStopGantt.jsx
│       │   │
│       │   └── layout/              # SHARED UI COMPONENTS
│       │       ├── Navbar.jsx           # Top nav (currently unused in 2-page layout)
│       │       ├── FilterBar.jsx        # Season dropdown, reads/writes Zustand store
│       │       ├── StatCard.jsx         # Animated stat card (label + value + subtext)
│       │       └── LoadingSkeleton.jsx  # Pulsing placeholder while data loads
│       │
│       ├── pages/
│       │   ├── LandingPage.jsx      # "/" — World map + year selector + race pins
│       │   └── RacePage.jsx         # "/race/:season/:raceId" — Leaderboard + simulator
│       │                            #   + toggle panels
│       │
│       ├── store/
│       │   └── filterStore.js       # Zustand store: season, raceId, selectedDrivers,
│       │                            #   seasonRange + setter functions
│       │
│       └── constants/
│           ├── f1Colors.js          # Team color hex codes (Red Bull #3671C6, etc.)
│           │                        #   + compound colors (SOFT #E8002D, etc.)
│           │                        #   Exports: TEAM_COLORS, COMPOUND_COLORS, getTeamColor()
│           └── raceLocations.json   # Static JSON: 38 circuits with lat/lng + races per
│                                    #   year (2000-2024). Used by WorldMap to place pins.
│
├── pipeline/                        # DATA PIPELINE (Python, run separately, not needed for frontend)
│   ├── fetch_jolpica.py             # Fetches from Jolpica API (Ergast replacement), 2000-2024
│   ├── fetch_fastf1.py              # Fetches lap telemetry via FastF1 library, 2018-2024
│   └── build_parquets.py            # Cleans and exports final .parquet files
│
├── run_pipeline.py                  # Entry point for full pipeline
├── generate_placeholder.py          # Generates mock parquet files (not needed anymore)
├── requirements.txt                 # Python deps: pandas, pyarrow, fastf1, requests
└── .gitignore
```

---

## Architecture

```
User's Browser
    │
    ├── React Pages (LandingPage, RacePage)
    │       │
    │       ▼
    ├── queries.js  ← "API layer" — 16 async functions returning JS arrays
    │       │
    │       ▼
    ├── duckdb.js   ← DuckDB-WASM (full SQL engine running in browser)
    │       │
    │       ▼
    └── Fetches 4 .parquet files from HuggingFace on first load (~3MB total)
```

No server. No API calls to a backend. SQL runs client-side in WebAssembly.

---

## Data Layer API (queries.js)

All functions are async and return plain JS arrays/objects. Import what you need:

```js
import { getChampionshipStandings, getRaceLeaderboard } from '../lib/queries';
const standings = await getChampionshipStandings(2023);
const leaderboard = await getRaceLeaderboard(2023, 1);
```

### Function Reference

| Function | Params | Returns |
|---|---|---|
| `getChampionshipStandings(season)` | `2023` | `[{ driver, round, cumulative_points }]` |
| `getConstructorHeatmap(season)` | `2023` | `[{ constructor, round, points }]` |
| `getRaceOutcomesGrid(season)` | `2023` | `[{ round, position, driver, team, dnf }]` |
| `getSeasonStatCards(season)` | `2023` | `{ champion, race_count, constructor_champion, fastest_lap_holder }` |
| `getRaceList(season)` | `2023` | `[{ round, race_name, circuit_name, country, date }]` |
| `getPositionChartData(raceId)` | `"2023_1"` | `[{ driver, team, lap_number, position }]` |
| `getLapTimeScatterData(raceId)` | `"2023_1"` | `[{ driver, team, lap_number, lap_time_seconds, compound, is_pit_lap }]` |
| `getGapToLeaderData(raceId)` | `"2023_1"` | `[{ driver, team, lap_number, gap_to_leader_seconds }]` |
| `getPitStopGanttData(raceId)` | `"2023_1"` | `[{ driver, stint_number, compound, start_lap, end_lap, stint_length }]` |
| `getDriverRadarStats(d1, d2, range)` | `"max_verstappen", "hamilton", {start:2022, end:2024}` | `{ driver1: {avg_qualifying_position, avg_race_position, win_rate, podium_rate, points_per_race, fastest_lap_rate}, driver2: {...} }` |
| `getQualVsRaceScatter(range)` | `{start:2020, end:2024}` | `[{ driver, season, avg_qualifying_position, avg_race_position, team }]` |
| `getCircuitHeatmapForDriver(driver)` | `"max_verstappen"` | `[{ circuit_name, season, avg_finish_position }]` |
| `getTeammateBattle(team, season)` | `"Red Bull", 2023` | `[{ round, driver1, driver2, quali_delta, race_position_delta }]` |
| `getDriverList(range)` | `{start:2022, end:2024}` | `[{ driver, team }]` |
| `getTeamList(season)` | `2023` | `[{ constructor }]` |
| `getRaceLeaderboard(season, round)` | `2023, 1` | `[{ position, driver, team, points, status }]` |

### Key conventions
- **`season`** — integer, e.g. `2023`
- **`raceId`** — string `"YYYY_R"`, e.g. `"2023_1"` (season underscore round)
- **`seasonRange`** — object `{ start: 2020, end: 2024 }` (inclusive both ends)
- **`driver`** — Jolpica-style ID: `max_verstappen`, `hamilton`, `leclerc`
- **`constructor`** — display name: `Red Bull`, `Mercedes`, `Ferrari`, `McLaren`
- **Laps/stints data** — only available for 2018-2024 (FastF1 source)
- **Results/standings** — available for 2000-2024 (Jolpica source)

---

## What Needs to Be Built Next

### Charts needed (in `src/components/charts/`)

1. **PositionChart.jsx** — Lap-by-lap position changes (bump chart / line chart)
   - Data: `getPositionChartData(raceId)` → `[{ driver, team, lap_number, position }]`
   - Shows each driver's track position across all laps of a race
   - Goes in RacePage toggle panel "Lap-by-Lap Position"

2. **PitStopGantt.jsx** — Tire strategy Gantt chart
   - Data: `getPitStopGanttData(raceId)` → `[{ driver, stint_number, compound, start_lap, end_lap, stint_length }]`
   - Horizontal bars per driver showing tire stints, colored by compound (SOFT=red, MEDIUM=yellow, HARD=white)
   - Goes in RacePage toggle panel "Tire Strategy"
   - Use compound colors from `src/constants/f1Colors.js`

3. **Race Simulator** (center of RacePage)
   - Animated replay of all laps using real driver lap times
   - Data: `getPositionChartData(raceId)` or raw laps data
   - Play/pause/scrub controls, lap counter
   - This is the main feature of Page 2

### Other tasks
- Connect Vercel for auto-deploy
- Leaderboard row click → show driver details (future feature)
- Add more race info to RacePage header (circuit name, date, country)

---

## Adding a New Visualization

1. Create chart component in `frontend/src/components/charts/YourChart.jsx`
2. Import the relevant query function from `../../lib/queries`
3. Use this pattern:

```jsx
import { useState, useEffect } from 'react';
import { getSomeData } from '../../lib/queries';
import LoadingSkeleton from '../layout/LoadingSkeleton';

export default function YourChart({ raceId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSomeData(raceId).then(d => { setData(d); setLoading(false); });
  }, [raceId]);

  if (loading) return <LoadingSkeleton />;

  return (
    // Your chart rendering here using `data`
  );
}
```

4. Wire it into `RacePage.jsx` in the appropriate toggle panel (replace the placeholder div)

---

## Available Data (on HuggingFace)

| File | Rows | Years | Source | Key columns |
|------|------|-------|--------|-------------|
| standings.parquet | 11,925 | 2000-2024 | Jolpica API | season, round, driver, constructor, points, cumulative_points, position |
| results.parquet | 10,071 | 2000-2024 | Jolpica API | season, round, race_name, circuit_name, country, date, driver, constructor, grid_position, finish_position, points, status, fastest_lap_rank, num_pit_stops, avg_pit_stop_duration_ms |
| laps.parquet | 161,794 | 2018-2024 | FastF1 | race_id, season, round, driver, team, lap_number, lap_time_seconds, position, compound, tire_age_laps, pit_in_flag, pit_out_flag, gap_to_leader_seconds, sector1_time, sector2_time, sector3_time |
| stints.parquet | 7,101 | 2018-2024 | Derived | race_id, driver, stint_number, compound, start_lap, end_lap, stint_length |

Data URL pattern: `https://huggingface.co/datasets/Aman2406/f1-visual-analytics/resolve/main/data/{filename}.parquet`

---

## F1 Color Constants (`src/constants/f1Colors.js`)

**Team colors:**
Red Bull `#3671C6`, Mercedes `#27F4D2`, Ferrari `#E8002D`, McLaren `#FF8000`,
Aston Martin `#358C75`, Alpine `#FF87BC`, Williams `#64C4FF`, AlphaTauri `#6692FF`,
Alfa Romeo `#C92D4B`, Haas `#B6BABD`

**Tire compounds:**
SOFT `#E8002D`, MEDIUM `#FFF200`, HARD `#FFFFFF`, INTERMEDIATE `#39B54A`, WET `#0067FF`

Usage: `import { getTeamColor, COMPOUND_COLORS } from '../constants/f1Colors'`

---

## Running the Data Pipeline (optional)

Only needed if you want to regenerate or update the parquet data. Not required for frontend work.

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run_pipeline.py
```

Takes ~40 minutes on first run. Subsequent runs use cache and are much faster.

---

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, D3.js, Recharts, Framer Motion, Zustand
- **Data:** DuckDB-WASM (SQL in browser), Parquet files on HuggingFace
- **Map:** D3 + TopoJSON (Natural Earth projection)
- **Pipeline:** Python, pandas, FastF1, requests
- **Deployment:** Vercel (auto-deploys from main branch, root directory: `frontend`)
