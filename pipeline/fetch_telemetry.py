"""
Fetch telemetry + track status + circuit geometry from FastF1 (2018-2024).
Produces 3 parquet files:
  - telemetry.parquet: X, Y, distance, speed per driver per lap (downsampled to ~100 pts/lap)
  - track_status.parquet: safety car, VSC, red flag events with timestamps
  - circuits.parquet: track shape polyline per circuit (from fastest lap)

Run: python pipeline/fetch_telemetry.py
Takes ~2-4 hours on first run (FastF1 downloads telemetry per session).
Subsequent runs use cache and skip completed sessions.
"""
import sys
import warnings
import time
import fastf1
import numpy as np
import pandas as pd
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

CACHE_DIR = Path(__file__).parent.parent / "cache" / "fastf1"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))

OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SEASONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024]
TELEMETRY_POINTS_PER_LAP = 100  # Downsample to this many points per lap


def progress_bar(current, total, prefix="", width=40):
    """Print a progress bar to terminal."""
    pct = current / total if total > 0 else 0
    filled = int(width * pct)
    bar = "█" * filled + "░" * (width - filled)
    sys.stdout.write(f"\r  {prefix} [{bar}] {pct*100:5.1f}% ({current}/{total})")
    sys.stdout.flush()


def downsample_telemetry(tel_df, n_points=TELEMETRY_POINTS_PER_LAP):
    """
    Downsample telemetry to n_points evenly spaced by distance.
    Keeps X, Y, Distance, Speed columns.
    Returns a DataFrame with exactly n_points rows (or fewer if lap is short).
    """
    if tel_df is None or tel_df.empty:
        return None

    # Sort by distance
    tel_df = tel_df.sort_values("Distance").reset_index(drop=True)

    # If fewer points than target, return as-is
    if len(tel_df) <= n_points:
        return tel_df[["X", "Y", "Distance", "Speed"]].copy()

    # Evenly space by index (simpler and robust)
    indices = np.linspace(0, len(tel_df) - 1, n_points, dtype=int)
    sampled = tel_df.iloc[indices][["X", "Y", "Distance", "Speed"]].reset_index(drop=True)
    return sampled


def fetch_session_safe(season, round_num):
    """Load a FastF1 session with telemetry. Returns session or None on failure."""
    try:
        session = fastf1.get_session(season, round_num, "R")
        session.load(telemetry=True, weather=True, messages=True)
        return session
    except Exception as e:
        return None


def extract_telemetry(session, race_id, driver_mapping):
    """Extract downsampled telemetry for all drivers in a session."""
    rows = []
    try:
        laps = session.laps
    except Exception:
        return rows
    if laps is None or laps.empty:
        return rows

    drivers = laps["Driver"].unique()

    for driver in drivers:
        driver_laps = laps.pick_drivers(driver)
        if driver_laps.empty:
            continue

        driver_id = driver_mapping.get(driver, driver.lower())

        for _, lap in driver_laps.iterrows():
            lap_num = int(lap["LapNumber"])
            try:
                tel = lap.get_telemetry()
                if tel is None or tel.empty:
                    continue

                sampled = downsample_telemetry(tel)
                if sampled is None or sampled.empty:
                    continue

                for i, row in sampled.iterrows():
                    rows.append({
                        "race_id": race_id,
                        "driver": driver_id,
                        "lap_number": lap_num,
                        "sample_index": i,
                        "x": round(float(row["X"]), 1),
                        "y": round(float(row["Y"]), 1),
                        "distance": round(float(row["Distance"]), 1),
                        "speed": round(float(row["Speed"]), 1),
                    })
            except Exception:
                continue

    return rows


def extract_track_status(session, race_id):
    """Extract track status events (safety car, VSC, red flags)."""
    rows = []
    try:
        status = session.track_status
        if status is None or status.empty:
            return rows

        for _, event in status.iterrows():
            status_code = str(event.get("Status", ""))
            time_val = event.get("Time")

            # Convert time to seconds from race start
            if pd.isna(time_val):
                time_sec = None
            else:
                try:
                    time_sec = round(time_val.total_seconds(), 2)
                except (AttributeError, TypeError):
                    time_sec = None

            # Status codes: 1=Green, 2=Yellow, 4=SC, 5=Red, 6=VSC, 7=VSC Ending
            status_label = {
                "1": "Green", "2": "Yellow", "4": "SafetyCar",
                "5": "Red", "6": "VSC", "7": "VSCEnding"
            }.get(status_code, f"Unknown({status_code})")

            rows.append({
                "race_id": race_id,
                "time_seconds": time_sec,
                "status_code": status_code,
                "status": status_label,
            })
    except Exception:
        pass

    return rows


def extract_circuit_geometry(session, race_id, circuit_name):
    """Extract track shape from the fastest lap's telemetry."""
    try:
        fastest = session.laps.pick_fastest()
        if fastest is None:
            return None

        tel = fastest.get_telemetry()
        if tel is None or tel.empty:
            return None

        # Get circuit info for rotation
        try:
            circuit_info = session.get_circuit_info()
            rotation = float(circuit_info.rotation) if circuit_info else 0.0
        except Exception:
            rotation = 0.0

        # Downsample track shape to 200 points (more than car telemetry for smooth track drawing)
        tel = tel.sort_values("Distance").reset_index(drop=True)
        n_points = min(200, len(tel))
        indices = np.linspace(0, len(tel) - 1, n_points, dtype=int)
        sampled = tel.iloc[indices]

        rows = []
        for i, row in sampled.iterrows():
            rows.append({
                "race_id": race_id,
                "circuit_name": circuit_name,
                "rotation": rotation,
                "point_index": len(rows),
                "x": round(float(row["X"]), 1),
                "y": round(float(row["Y"]), 1),
                "distance": round(float(row["Distance"]), 1),
            })
        return rows
    except Exception:
        return None


def build_driver_mapping():
    """Load driver mapping from Jolpica cache (3-letter code -> driver_id)."""
    import json
    jolpica_cache = Path(__file__).parent.parent / "cache" / "jolpica"
    mapping = {}

    for season in SEASONS:
        path = jolpica_cache / f"results_{season}.json"
        if not path.exists():
            continue
        with open(path) as f:
            data = json.load(f)
        races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
        for race in races:
            for result in race.get("Results", []):
                driver = result["Driver"]
                code = driver.get("code", "")
                driver_id = driver["driverId"]
                if code:
                    mapping[code] = driver_id

    return mapping


def main():
    print("=" * 60)
    print("TELEMETRY PIPELINE: Fetching race replay data (2018-2024)")
    print("=" * 60)
    print(f"  Output: {OUTPUT_DIR}")
    print(f"  Cache:  {CACHE_DIR}")
    print(f"  Points per lap: {TELEMETRY_POINTS_PER_LAP}")
    print()

    # Build driver mapping
    print("Loading driver mapping...", flush=True)
    driver_mapping = build_driver_mapping()
    print(f"  Mapped {len(driver_mapping)} driver codes", flush=True)
    print()

    # Count total races for overall progress
    all_events = []
    for season in SEASONS:
        schedule = fastf1.get_event_schedule(season, include_testing=False)
        races = schedule[schedule["EventFormat"] != "testing"]
        for _, event in races.iterrows():
            all_events.append((season, int(event["RoundNumber"]), event["EventName"],
                              event.get("OfficialEventName", event["EventName"])))

    total_races = len(all_events)
    print(f"Total races to process: {total_races}")
    print()

    all_telemetry = []
    all_track_status = []
    all_circuits = {}  # race_id -> circuit rows (deduplicate by circuit)
    errors = []
    start_time = time.time()

    for i, (season, round_num, event_name, _) in enumerate(all_events):
        race_id = f"{season}_{round_num}"

        # Progress bar
        elapsed = time.time() - start_time
        if i > 0:
            eta = elapsed / i * (total_races - i)
            eta_str = f"ETA: {int(eta//60)}m{int(eta%60)}s"
        else:
            eta_str = "ETA: calculating..."

        progress_bar(i, total_races, prefix=f"{season} R{round_num:02d} {event_name[:20]:<20}")
        sys.stdout.write(f" | {eta_str}")
        sys.stdout.flush()

        # Load session
        session = fetch_session_safe(season, round_num)
        if session is None:
            errors.append(f"{race_id}: Failed to load session")
            continue

        # Extract telemetry
        tel_rows = extract_telemetry(session, race_id, driver_mapping)
        if tel_rows:
            all_telemetry.extend(tel_rows)

        # Extract track status
        status_rows = extract_track_status(session, race_id)
        if status_rows:
            all_track_status.extend(status_rows)

        # Extract circuit geometry (one per circuit)
        circuit_name = ""
        try:
            circuit_name = session.event["OfficialEventName"]
        except Exception:
            circuit_name = event_name

        if race_id not in all_circuits:
            circuit_rows = extract_circuit_geometry(session, race_id, circuit_name)
            if circuit_rows:
                all_circuits[race_id] = circuit_rows

        # Print count periodically
        if (i + 1) % 10 == 0:
            print(f"\n    [{i+1}/{total_races}] Telemetry rows so far: {len(all_telemetry):,}", flush=True)

    # Final progress
    progress_bar(total_races, total_races, prefix="DONE" + " " * 30)
    print()
    print()

    elapsed_total = time.time() - start_time
    print(f"Fetching complete in {int(elapsed_total//60)}m {int(elapsed_total%60)}s")
    print()

    # === Save telemetry.parquet ===
    print("Saving telemetry.parquet...", flush=True)
    if all_telemetry:
        tel_df = pd.DataFrame(all_telemetry)
        tel_df = tel_df.astype({
            "lap_number": "int16",
            "sample_index": "int8",
            "x": "float32",
            "y": "float32",
            "distance": "float32",
            "speed": "float32",
        })
        tel_df.to_parquet(OUTPUT_DIR / "telemetry.parquet", index=False)
        print(f"  telemetry.parquet: {len(tel_df):,} rows ({(OUTPUT_DIR / 'telemetry.parquet').stat().st_size / 1024 / 1024:.1f} MB)")
    else:
        print("  WARNING: No telemetry data collected!")

    # === Save track_status.parquet ===
    print("Saving track_status.parquet...", flush=True)
    if all_track_status:
        ts_df = pd.DataFrame(all_track_status)
        ts_df.to_parquet(OUTPUT_DIR / "track_status.parquet", index=False)
        print(f"  track_status.parquet: {len(ts_df):,} rows")
    else:
        print("  WARNING: No track status data collected!")

    # === Save circuits.parquet ===
    print("Saving circuits.parquet...", flush=True)
    circuit_rows_all = []
    for rows in all_circuits.values():
        circuit_rows_all.extend(rows)
    if circuit_rows_all:
        circ_df = pd.DataFrame(circuit_rows_all)
        circ_df = circ_df.astype({
            "rotation": "float32",
            "point_index": "int16",
            "x": "float32",
            "y": "float32",
            "distance": "float32",
        })
        circ_df.to_parquet(OUTPUT_DIR / "circuits.parquet", index=False)
        print(f"  circuits.parquet: {len(circ_df):,} rows ({len(all_circuits)} circuits)")
    else:
        print("  WARNING: No circuit geometry collected!")

    # Summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Races processed: {total_races - len(errors)}/{total_races}")
    if errors:
        print(f"  Errors ({len(errors)}):")
        for e in errors[:15]:
            print(f"    - {e}")
        if len(errors) > 15:
            print(f"    ... and {len(errors) - 15} more")
    print()
    print("Output files:")
    for f in ["telemetry.parquet", "track_status.parquet", "circuits.parquet"]:
        p = OUTPUT_DIR / f
        if p.exists():
            size_mb = p.stat().st_size / 1024 / 1024
            print(f"  {f}: {size_mb:.1f} MB")
    print()
    print("Next step: Upload these to HuggingFace alongside existing parquet files.")


if __name__ == "__main__":
    main()
