import json
import math
from http.server import BaseHTTPRequestHandler

import numpy as np
from sklearn.cluster import DBSCAN

EARTH_RADIUS_MILES = 3958.7613


def haversine_miles(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(value))


def cluster_points(points, epsilon_miles=75.0, min_points=2, max_gap_hours=168.0):
    ordered = sorted(points, key=lambda p: p["timestamp"])
    coordinates = np.array([[p["latitude"], p["longitude"]] for p in ordered], dtype=float)
    radians = np.radians(coordinates)
    labels = DBSCAN(
        eps=epsilon_miles / EARTH_RADIUS_MILES,
        min_samples=min_points,
        metric="haversine",
        algorithm="ball_tree",
    ).fit_predict(radians)

    raw = {}
    for point, label in zip(ordered, labels.tolist()):
        if label >= 0:
            raw.setdefault(label, []).append(point)

    clusters = []
    cluster_number = 0
    for label in sorted(raw):
        group = sorted(raw[label], key=lambda p: p["timestamp"])
        segments = [[group[0]]]
        for point in group[1:]:
            previous = segments[-1][-1]
            from datetime import datetime
            gap = abs((datetime.fromisoformat(point["timestamp"].replace("Z", "+00:00")) - datetime.fromisoformat(previous["timestamp"].replace("Z", "+00:00"))).total_seconds()) / 3600
            if gap > max_gap_hours:
                segments.append([point])
            else:
                segments[-1].append(point)

        for segment in segments:
            if len(segment) < min_points:
                continue
            cluster_number += 1
            clusters.append({
                "clusterId": f"cluster-{cluster_number}",
                "points": segment,
                "centerLat": sum(p["latitude"] for p in segment) / len(segment),
                "centerLng": sum(p["longitude"] for p in segment) / len(segment),
                "startTimestamp": segment[0]["timestamp"],
                "endTimestamp": segment[-1]["timestamp"],
            })
    return clusters


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            points = payload.get("points", [])
            if len(points) < 2:
                return self._json(400, {"error": "At least two points are required."})
            clusters = cluster_points(
                points,
                float(payload.get("epsilonMiles", 75)),
                int(payload.get("minPoints", 2)),
                float(payload.get("maxGapHours", 168)),
            )
            return self._json(200, {"clusters": clusters, "engine": "python-scikit-learn"})
        except Exception as exc:
            return self._json(500, {"error": str(exc)})
