"use client";

import { GoogleMap, InfoWindowF, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { useMemo, useState } from "react";

type MapPoint = {
  id?: string;
  filename?: string | null;
  latitude: number;
  longitude: number;
  takenAt?: string | Date;
};

type Props = { points: MapPoint[] };

const containerStyle = { width: "100%", height: "100%" };

export default function RouteMapPreview({ points }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({ id: "waypoint-google-map", googleMapsApiKey: apiKey });

  const validPoints = useMemo(
    () => points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    [points],
  );
  const center = useMemo(() => {
    if (!validPoints.length) return { lat: 33.749, lng: -84.388 };
    return {
      lat: validPoints.reduce((sum, point) => sum + point.latitude, 0) / validPoints.length,
      lng: validPoints.reduce((sum, point) => sum + point.longitude, 0) / validPoints.length,
    };
  }, [validPoints]);
  const path = validPoints.map((point) => ({ lat: point.latitude, lng: point.longitude }));

  if (!apiKey) {
    return <div className="flex h-96 items-center justify-center rounded-[1.5rem] border border-amber-300/20 bg-amber-400/10 p-8 text-center text-amber-100">Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to display the Google Map.</div>;
  }
  if (loadError) {
    return <div className="flex h-96 items-center justify-center rounded-[1.5rem] border border-red-300/20 bg-red-400/10 p-8 text-center text-red-100">Google Maps could not load. Check the API key, Maps JavaScript API, billing, and website restrictions.</div>;
  }
  if (!isLoaded) {
    return <div className="flex h-96 items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/5 text-slate-300">Loading Google Maps…</div>;
  }
  if (!validPoints.length) {
    return <div className="flex h-96 items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/5 text-slate-300">No mapped photo points are available.</div>;
  }

  return (
    <div className="h-[28rem] overflow-hidden rounded-[1.5rem] border border-white/10">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={validPoints.length === 1 ? 11 : 5}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true, gestureHandling: "greedy" }}
        onLoad={(map) => {
          if (validPoints.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            path.forEach((position) => bounds.extend(position));
            map.fitBounds(bounds, 56);
          }
        }}
      >
        {path.length > 1 && <PolylineF path={path} options={{ strokeOpacity: 0.85, strokeWeight: 4 }} />}
        {validPoints.map((point, index) => (
          <MarkerF key={point.id ?? `${point.latitude}-${point.longitude}-${index}`} position={{ lat: point.latitude, lng: point.longitude }} label={`${index + 1}`} onClick={() => setSelectedIndex(index)} />
        ))}
        {selectedIndex !== null && validPoints[selectedIndex] && (
          <InfoWindowF position={{ lat: validPoints[selectedIndex].latitude, lng: validPoints[selectedIndex].longitude }} onCloseClick={() => setSelectedIndex(null)}>
            <div className="max-w-52 text-slate-900">
              <p className="font-semibold">{validPoints[selectedIndex].filename || `Photo ${selectedIndex + 1}`}</p>
              {validPoints[selectedIndex].takenAt && <p className="mt-1 text-xs">{new Date(validPoints[selectedIndex].takenAt!).toLocaleString()}</p>}
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
}
