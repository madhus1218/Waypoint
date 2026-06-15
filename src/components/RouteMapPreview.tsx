"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

type RoutePoint = {
  id?: string;
  filename?: string | null;
  latitude: string | number;
  longitude: string | number;
  timestamp?: string;
  takenAt?: string;
};

type RouteMapPreviewProps = {
  points: RoutePoint[];
};

type ValidRoutePoint = RoutePoint & {
  latitudeNumber: number;
  longitudeNumber: number;
};

const numberedMarkerIcons = new Map<string, L.DivIcon>();

function getPointTimestamp(point: RoutePoint) {
  return point.timestamp || point.takenAt || "";
}

function getPointLabel(point: RoutePoint, index: number) {
  return point.filename || `Point ${index + 1}`;
}

function formatTimestamp(timestamp: string) {
  if (!timestamp) {
    return "Unknown time";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMarkerIcon(
  index: number,
  pointCount: number
): L.DivIcon {
  const type =
    index === 0 ? "start" : index === pointCount - 1 ? "end" : "middle";

  const cacheKey = `${type}-${index}`;

  const cachedIcon = numberedMarkerIcons.get(cacheKey);

  if (cachedIcon) {
    return cachedIcon;
  }

  const backgroundClass =
    type === "start"
      ? "background:#22c55e;"
      : type === "end"
        ? "background:#047857;"
        : "background:#34d399;";

  const icon = L.divIcon({
    className: "",
    html: `
      <div
        style="
          ${backgroundClass}
          width:32px;
          height:32px;
          border-radius:9999px;
          border:3px solid white;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#07130f;
          font-size:12px;
          font-weight:800;
          box-shadow:0 4px 14px rgba(0,0,0,0.45);
        "
      >
        ${index + 1}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });

  numberedMarkerIcons.set(cacheKey, icon);

  return icon;
}

function FitMapBounds({ points }: { points: ValidRoutePoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      return;
    }

    const bounds = L.latLngBounds(
      points.map((point) => [
        point.latitudeNumber,
        point.longitudeNumber,
      ])
    );

    if (points.length === 1) {
      map.setView(bounds.getCenter(), 13);
      return;
    }

    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 14,
    });
  }, [map, points]);

  return null;
}

export default function RouteMapPreview({
  points,
}: RouteMapPreviewProps) {
  const validPoints = useMemo<ValidRoutePoint[]>(() => {
    return points
      .map((point) => ({
        ...point,
        latitudeNumber: Number(point.latitude),
        longitudeNumber: Number(point.longitude),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.latitudeNumber) &&
          Number.isFinite(point.longitudeNumber) &&
          point.latitudeNumber >= -90 &&
          point.latitudeNumber <= 90 &&
          point.longitudeNumber >= -180 &&
          point.longitudeNumber <= 180
      )
      .sort((a, b) => {
        const aTime = new Date(getPointTimestamp(a)).getTime();
        const bTime = new Date(getPointTimestamp(b)).getTime();

        if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
          return 0;
        }

        if (Number.isNaN(aTime)) {
          return 1;
        }

        if (Number.isNaN(bTime)) {
          return -1;
        }

        return aTime - bTime;
      });
  }, [points]);

  const routePositions = useMemo<[number, number][]>(
    () =>
      validPoints.map((point) => [
        point.latitudeNumber,
        point.longitudeNumber,
      ]),
    [validPoints]
  );

  if (validPoints.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-3xl border border-white/10 bg-[#0d1b2f] p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-white">
            No valid coordinates
          </p>

          <p className="mt-2 text-sm text-slate-400">
            This trip does not contain enough location data to display a map.
          </p>
        </div>
      </div>
    );
  }

  const firstPoint = validPoints[0];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10">
      <MapContainer
        center={[
          firstPoint.latitudeNumber,
          firstPoint.longitudeNumber,
        ]}
        zoom={12}
        scrollWheelZoom
        className="h-[520px] w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <FitMapBounds points={validPoints} />

        {routePositions.length > 1 && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#10b981",
              weight: 4,
              opacity: 0.9,
            }}
          />
        )}

        {validPoints.map((point, index) => (
          <Marker
            key={
              point.id ||
              `${point.latitudeNumber}-${point.longitudeNumber}-${index}`
            }
            position={[
              point.latitudeNumber,
              point.longitudeNumber,
            ]}
            icon={getMarkerIcon(index, validPoints.length)}
          >
            <Popup>
              <div className="min-w-44">
                <p className="font-semibold">
                  {getPointLabel(point, index)}
                </p>

                <p className="mt-1 text-sm">
                  {formatTimestamp(getPointTimestamp(point))}
                </p>

                <p className="mt-1 text-xs">
                  {point.latitudeNumber.toFixed(5)},{" "}
                  {point.longitudeNumber.toFixed(5)}
                </p>

                {index === 0 && (
                  <p className="mt-2 text-xs font-semibold text-green-700">
                    Trip start
                  </p>
                )}

                {index === validPoints.length - 1 &&
                  validPoints.length > 1 && (
                    <p className="mt-2 text-xs font-semibold text-emerald-800">
                      Trip end
                    </p>
                  )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-5 left-5 z-[500] rounded-2xl border border-white/10 bg-[#07130f]/90 px-4 py-3 text-white shadow-xl backdrop-blur">
        <p className="text-xs text-slate-400">Interactive route map</p>

        <p className="mt-1 text-sm font-semibold">
          {validPoints.length} mapped photo point
          {validPoints.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}