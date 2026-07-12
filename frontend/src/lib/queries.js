import { query } from "./duckdb.js";

// ============================================================
// SEASON OVERVIEW PAGE
// ============================================================

/**
 * Championship standings progression for a season.
 * Returns: [{ driver, round, cumulative_points }, ...]
 * One row per driver per round, sorted by round ascending.
 */
export async function getChampionshipStandings(season) {
  return query(`
    SELECT driver, constructor AS team, round, cumulative_points
    FROM standings
    WHERE season = ${season}
    ORDER BY round ASC, cumulative_points DESC
  `);
}

/**
 * End-of-season championship positions for all drivers across all seasons (2000-2024).
 * Used by EraBumpChart for the "Over the Years" modal.
 * Returns: [{ season, driver, team, position }, ...]
 */
export async function getEraStandings() {
  return query(`
    SELECT s.season, s.driver, s.constructor AS team, s.position
    FROM standings s
    INNER JOIN (
      SELECT season, MAX(round) AS max_round
      FROM standings
      GROUP BY season
    ) last ON s.season = last.season AND s.round = last.max_round
    ORDER BY s.season, s.position
  `);
}

/**
 * Constructor points heatmap — points scored per round (not cumulative).
 * Returns: [{ constructor, round, points }, ...]
 * One row per constructor per round.
 */
export async function getConstructorHeatmap(season) {
  return query(`
    SELECT constructor, round, SUM(points) AS points
    FROM results
    WHERE season = ${season}
    GROUP BY constructor, round
    ORDER BY constructor, round
  `);
}

/**
 * Race outcomes grid — top 10 finishers + DNFs per round.
 * Returns: [{ round, position, driver, team, dnf }, ...]
 * One row per driver who finished P1-P10 that round, plus DNF entries.
 */
export async function getRaceOutcomesGrid(season) {
  return query(`
    SELECT
      round,
      finish_position AS position,
      driver,
      constructor AS team,
      CASE WHEN status != 'Finished' THEN true ELSE false END AS dnf
    FROM results
    WHERE season = ${season}
      AND (finish_position <= 10 OR status != 'Finished')
    ORDER BY round, finish_position
  `);
}

/**
 * Season summary stat cards.
 * Returns: { champion, race_count, constructor_champion, fastest_lap_holder }
 */
export async function getSeasonStatCards(season) {
  const [champion] = await query(`
    SELECT driver FROM standings
    WHERE season = ${season}
    ORDER BY round DESC, position ASC
    LIMIT 1
  `);

  const [raceCount] = await query(`
    SELECT MAX(round) AS race_count FROM results WHERE season = ${season}
  `);

  const [constructorChamp] = await query(`
    SELECT constructor, SUM(points) AS total_points
    FROM results
    WHERE season = ${season}
    GROUP BY constructor
    ORDER BY total_points DESC
    LIMIT 1
  `);

  const [fastestLap] = await query(`
    SELECT driver FROM results
    WHERE season = ${season} AND fastest_lap_rank = 1
    GROUP BY driver
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `);

  return {
    champion: champion?.driver ?? null,
    race_count: raceCount?.race_count ?? null,
    constructor_champion: constructorChamp?.constructor ?? null,
    fastest_lap_holder: fastestLap?.driver ?? null,
  };
}

/**
 * List of races in a season (for dropdowns).
 * Returns: [{ round, race_name, circuit_name, country, date }, ...]
 */
export async function getRaceList(season) {
  return query(`
    SELECT DISTINCT round, race_name, circuit_name, country, date
    FROM results
    WHERE season = ${season}
    ORDER BY round
  `);
}

// ============================================================
// RACE DEEP-DIVE PAGE (requires laps.parquet, 2022-2024 only)
// ============================================================

/**
 * Position chart — driver positions across laps.
 * Returns: [{ driver, team, lap_number, position, compound, pit_flag }, ...]
 */
export async function getPositionChartData(raceId) {
  return query(`
    SELECT driver, team, lap_number, position, compound,
      (pit_in_flag OR pit_out_flag) AS pit_flag
    FROM laps
    WHERE race_id = '${raceId}'
    ORDER BY lap_number, position
  `);
}

/**
 * Lap time scatter — every lap time plotted, excluding pit in/out laps.
 * Returns: [{ driver, team, lap_number, lap_time_seconds, compound, is_pit_lap }, ...]
 */
export async function getLapTimeScatterData(raceId) {
  return query(`
    SELECT
      driver, team, lap_number, lap_time_seconds, compound,
      (pit_in_flag OR pit_out_flag) AS is_pit_lap
    FROM laps
    WHERE race_id = '${raceId}'
      AND lap_time_seconds IS NOT NULL
    ORDER BY lap_number, driver
  `);
}

/**
 * Gap to leader over laps.
 * Returns: [{ driver, team, lap_number, gap_to_leader_seconds }, ...]
 */
export async function getGapToLeaderData(raceId) {
  return query(`
    SELECT driver, team, lap_number, gap_to_leader_seconds
    FROM laps
    WHERE race_id = '${raceId}'
      AND gap_to_leader_seconds IS NOT NULL
    ORDER BY lap_number, gap_to_leader_seconds
  `);
}

/**
 * Pit stop Gantt chart — tire stints per driver.
 * Returns: [{ driver, stint_number, compound, start_lap, end_lap, stint_length }, ...]
 */
export async function getPitStopGanttData(raceId) {
  return query(`
    SELECT driver, stint_number, compound, start_lap, end_lap, stint_length
    FROM stints
    WHERE race_id = '${raceId}'
    ORDER BY driver, stint_number
  `);
}

/**
 * Per-stint strategy summary for ParallelCoordinates chart.
 * Averages lap time across each stint (excluding pit in/out laps).
 * Returns: [{ stint_id, driver, avg_lap_time, compound, stint_length, tire_age_at_end, starting_position }, ...]
 */
export async function getStintStrategyData(raceId) {
  return query(`
    SELECT
      s.race_id || '_' || s.driver || '_' || s.stint_number AS stint_id,
      s.driver,
      AVG(l.lap_time_seconds) AS avg_lap_time,
      s.compound,
      s.stint_length,
      MAX(l.tire_age_laps) AS tire_age_at_end,
      r.grid_position AS starting_position
    FROM stints s
    JOIN laps l
      ON l.race_id = s.race_id
      AND l.driver = s.driver
      AND l.lap_number BETWEEN s.start_lap AND s.end_lap
      AND NOT l.pit_in_flag AND NOT l.pit_out_flag
    JOIN results r
      ON r.season = l.season AND r.round = l.round AND r.driver = s.driver
    WHERE s.race_id = '${raceId}'
    GROUP BY s.race_id, s.driver, s.stint_number, s.compound, s.stint_length, r.grid_position
    HAVING AVG(l.lap_time_seconds) IS NOT NULL AND r.grid_position IS NOT NULL
    ORDER BY s.driver, s.stint_number
  `);
}

// ============================================================
// DRIVER COMPARISON PAGE
// ============================================================

/**
 * Radar stats comparing two drivers over a season range.
 * Returns: { driver1: { avg_qualifying_position, avg_race_position, win_rate,
 *            podium_rate, points_per_race, fastest_lap_rate },
 *            driver2: { ...same... } }
 */
export async function getDriverRadarStats(driver1, driver2, seasonRange) {
  const { start, end } = seasonRange;

  async function getStats(driver) {
    const [row] = await query(`
      SELECT
        AVG(grid_position) AS avg_qualifying_position,
        AVG(finish_position) AS avg_race_position,
        SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS win_rate,
        SUM(CASE WHEN finish_position <= 3 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS podium_rate,
        AVG(points) AS points_per_race,
        SUM(CASE WHEN fastest_lap_rank = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS fastest_lap_rate
      FROM results
      WHERE driver = '${driver}'
        AND season >= ${start} AND season <= ${end}
        AND finish_position IS NOT NULL
    `);
    return row;
  }

  return {
    driver1: await getStats(driver1),
    driver2: await getStats(driver2),
  };
}

/**
 * Qualifying vs race scatter — one point per driver-season.
 * Returns: [{ driver, season, avg_qualifying_position, avg_race_position, team }, ...]
 */
export async function getQualVsRaceScatter(seasonRange) {
  const { start, end } = seasonRange;
  return query(`
    SELECT
      driver,
      season,
      AVG(grid_position) AS avg_qualifying_position,
      AVG(finish_position) AS avg_race_position,
      MODE(constructor) AS team
    FROM results
    WHERE season >= ${start} AND season <= ${end}
      AND grid_position IS NOT NULL
      AND finish_position IS NOT NULL
    GROUP BY driver, season
    ORDER BY season, avg_race_position
  `);
}

/**
 * Circuit heatmap for a specific driver — avg finish position per circuit per season.
 * Returns: [{ circuit_name, season, avg_finish_position }, ...]
 */
export async function getCircuitHeatmapForDriver(driver) {
  return query(`
    SELECT
      circuit_name,
      season,
      AVG(finish_position) AS avg_finish_position
    FROM results
    WHERE driver = '${driver}'
      AND finish_position IS NOT NULL
    GROUP BY circuit_name, season
    ORDER BY circuit_name, season
  `);
}

/**
 * Teammate battle — head-to-head per round for a team in a season.
 * Returns: [{ round, driver1, driver2, quali_delta, race_position_delta }, ...]
 * quali_delta = driver1 grid - driver2 grid (negative = driver1 qualified better)
 * race_position_delta = driver1 finish - driver2 finish (negative = driver1 finished better)
 */
export async function getTeammateBattle(team, season) {
  return query(`
    WITH team_drivers AS (
      SELECT DISTINCT driver
      FROM results
      WHERE constructor = '${team}' AND season = ${season}
      ORDER BY driver
      LIMIT 2
    ),
    d1 AS (
      SELECT round, grid_position, finish_position, driver
      FROM results
      WHERE constructor = '${team}' AND season = ${season}
        AND driver = (SELECT driver FROM team_drivers LIMIT 1)
    ),
    d2 AS (
      SELECT round, grid_position, finish_position, driver
      FROM results
      WHERE constructor = '${team}' AND season = ${season}
        AND driver = (SELECT driver FROM team_drivers LIMIT 1 OFFSET 1)
    )
    SELECT
      d1.round,
      d1.driver AS driver1,
      d2.driver AS driver2,
      d1.grid_position - d2.grid_position AS quali_delta,
      d1.finish_position - d2.finish_position AS race_position_delta
    FROM d1
    JOIN d2 ON d1.round = d2.round
    ORDER BY d1.round
  `);
}

// ============================================================
// UTILITY / DROPDOWN HELPERS
// ============================================================

/**
 * List of all drivers active in a season range (for dropdowns/selectors).
 * Returns: [{ driver, team }, ...]
 */
export async function getDriverList(seasonRange) {
  const { start, end } = seasonRange;
  return query(`
    SELECT DISTINCT driver, MODE(constructor) AS team
    FROM results
    WHERE season >= ${start} AND season <= ${end}
    GROUP BY driver
    ORDER BY driver
  `);
}

/**
 * List of teams in a season (for dropdowns).
 * Returns: [{ constructor }, ...]
 */
export async function getTeamList(season) {
  return query(`
    SELECT DISTINCT constructor
    FROM results
    WHERE season = ${season}
    ORDER BY constructor
  `);
}

/**
 * Race leaderboard — full classification for a specific race.
 * Returns: [{ position, driver, team, points, status }, ...]
 * Sorted by finish position (DNFs at the bottom).
 */
export async function getRaceLeaderboard(season, round) {
  return query(`
    SELECT
      finish_position AS position,
      driver,
      constructor AS team,
      points,
      status
    FROM results
    WHERE season = ${season} AND round = ${round}
    ORDER BY
      CASE WHEN finish_position IS NULL THEN 1 ELSE 0 END,
      finish_position
  `);
}
