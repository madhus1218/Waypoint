from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

EARTH_RADIUS_KM = 6371.0088


def load_points(points: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(points)

    required_columns = {"id", "latitude", "longitude", "timestamp"}
    missing_columns = required_columns - set(df.columns)

    if missing_columns:
        raise ValueError(f"Missing required columns: {sorted(missing_columns)}")

    df = df.dropna(subset=["latitude", "longitude", "timestamp"]).copy()
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)

    df = df.dropna(subset=["latitude", "longitude", "timestamp"]).copy()
    df = df[
        df["latitude"].between(-90, 90) & df["longitude"].between(-180, 180)
    ].copy()
    df = df.sort_values("timestamp").reset_index(drop=True)

    return df


def run_dbscan(df: pd.DataFrame, radius_km: float, min_samples: int) -> pd.DataFrame:
    coords_radians = np.radians(df[["latitude", "longitude"]].to_numpy())
    epsilon = radius_km / EARTH_RADIUS_KM

    model = DBSCAN(
        eps=epsilon,
        min_samples=min_samples,
        metric="haversine",
        algorithm="ball_tree",
    )

    clustered = df.copy()
    clustered["cluster_id"] = model.fit_predict(coords_radians)
    return clustered


def split_by_time(group: pd.DataFrame, max_time_gap_hours: float) -> list[pd.DataFrame]:
    group = group.sort_values("timestamp").reset_index(drop=True)

    if group.empty:
        return []

    visits: list[list[int]] = [[0]]

    for index in range(1, len(group)):
        previous_time = group.loc[index - 1, "timestamp"]
        current_time = group.loc[index, "timestamp"]
        gap_hours = (current_time - previous_time).total_seconds() / 3600

        if gap_hours > max_time_gap_hours:
            visits.append([index])
        else:
            visits[-1].append(index)

    return [group.iloc[indexes].copy() for indexes in visits]


def build_clusters(df: pd.DataFrame, max_time_gap_hours: float, min_samples: int) -> list[dict[str, Any]]:
    clusters: list[dict[str, Any]] = []
    clustered = df[df["cluster_id"] != -1]

    for _, group in clustered.groupby("cluster_id"):
        for visit in split_by_time(group, max_time_gap_hours):
            if len(visit) < min_samples:
                continue

            visit = visit.sort_values("timestamp")

            clusters.append(
                {
                    "latitude": float(visit["latitude"].mean()),
                    "longitude": float(visit["longitude"].mean()),
                    "startDate": visit["timestamp"].min().isoformat(),
                    "endDate": visit["timestamp"].max().isoformat(),
                    "points": [
                        {
                            "filename": str(row["id"]),
                            "latitude": float(row["latitude"]),
                            "longitude": float(row["longitude"]),
                            "timestamp": row["timestamp"].isoformat(),
                        }
                        for _, row in visit.iterrows()
                    ],
                }
            )

    return sorted(clusters, key=lambda cluster: cluster["startDate"])


def cluster_payload(payload: dict[str, Any]) -> dict[str, Any]:
    radius_km = float(payload.get("radius_km", 80))
    min_samples = int(payload.get("min_samples", 2))
    max_time_gap_hours = float(payload.get("max_time_gap_hours", 72))

    df = load_points(payload.get("points", []))

    if len(df) < min_samples:
        return {"clusters": []}

    clustered = run_dbscan(df, radius_km=radius_km, min_samples=min_samples)
    clusters = build_clusters(clustered, max_time_gap_hours, min_samples)

    return {"clusters": clusters}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdin", action="store_true")
    args = parser.parse_args()

    if not args.stdin:
        raise SystemExit("Use --stdin so Waypoint can pass JSON from the API route.")

    payload = json.loads(sys.stdin.read())
    print(json.dumps(cluster_payload(payload)))


if __name__ == "__main__":
    main()

