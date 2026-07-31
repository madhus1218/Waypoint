"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Camera,
  MapPin,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";

type SavedPhotoPoint = {
  id: string;
  filename: string | null;
  latitude: number;
  longitude: number;
  takenAt: string;
};

type SavedTrip = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  photoPoints: SavedPhotoPoint[];
};

function formatDate(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(startDate: string, endDate: string) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  return start === end ? start : `${start} – ${end}`;
}

function formatCoordinate(value: number, directionPositive: string, directionNegative: string) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? directionPositive : directionNegative}`;
}

function getAverageCoordinate(points: SavedPhotoPoint[]) {
  if (points.length === 0) {
    return null;
  }

  const avgLat =
    points.reduce((sum, point) => sum + point.latitude, 0) / points.length;

  const avgLng =
    points.reduce((sum, point) => sum + point.longitude, 0) / points.length;

  return {
    latitude: avgLat,
    longitude: avgLng,
  };
}

export default function TripsPage() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchTrips() {
    try {
      setIsLoading(true);
      setError("");

      const response = await fetch("/api/trips", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch trips");
      }

      setTrips(data.trips || []);
    } catch (err) {
      console.error("Failed to fetch trips:", err);
      setError("Could not load saved trips. Check your database connection.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchTrips();
  }, []);

  const stats = useMemo(() => {
    const totalPhotoPoints = trips.reduce(
      (sum, trip) => sum + trip.photoPoints.length,
      0
    );

    const uniqueLocations = new Set(
      trips.map((trip) => trip.city || trip.title).filter(Boolean)
    ).size;

    return {
      tripsSaved: trips.length,
      photoPoints: totalPhotoPoints,
      locations: uniqueLocations,
    };
  }, [trips]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] px-6 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-300">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>

          <h1 className="text-3xl font-bold">Loading saved trips...</h1>

          <p className="mt-4 text-slate-300">
            Waypoint is pulling your trip history from the database.
          </p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] px-6 text-white">
        <section className="max-w-xl rounded-[2rem] border border-red-300/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-bold">Could not load trips.</h1>

          <p className="mt-4 leading-7 text-red-100">{error}</p>

          <button
            onClick={fetchTrips}
            className="mt-7 rounded-full bg-emerald-500 px-7 py-3 font-semibold text-white transition hover:bg-emerald-400"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (trips.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] px-6 text-white">
        <section className="max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-300">
            <Upload className="h-7 w-7" />
          </div>

          <h1 className="text-3xl font-bold">No saved trips yet.</h1>

          <p className="mt-4 leading-7 text-slate-300">
            Upload photos, let Waypoint detect your trips, and confirm them to
            build your travel history.
          </p>

          <Link
            href="/upload"
            className="mt-7 inline-flex rounded-full bg-emerald-500 px-7 py-3 font-semibold text-white transition hover:bg-emerald-400"
          >
            Upload Photos
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07130f] px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <nav className="mb-12 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="flex items-center gap-3">

            <Link
              href="/upload"
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              New upload
            </Link>
          </div>
        </nav>

        <div className="mb-10">

          <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
            Your Waypoint travel timeline.
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Review the trips Waypoint detected from your uploaded photo metadata.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="Saved trips" value={stats.tripsSaved} />
            <StatCard label="Photo points" value={stats.photoPoints} />
            <StatCard label="Locations" value={stats.locations} />
          </div>
        </div>

        <div className="grid gap-6">
          {trips.map((trip, index) => {
            const averageCoordinate = getAverageCoordinate(trip.photoPoints);

            return (
              <article
                key={trip.id}
                className="rounded-[2rem] border border-white/10 bg-white/5 p-6 transition hover:border-emerald-400/40 hover:bg-white/[0.07]"
              >
                <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                  <div className="flex-1">
                    <p className="text-sm text-emerald-200">Saved trip {index + 1}</p>

                    <h2 className="mt-2 text-3xl font-bold">{trip.title}</h2>

                    {trip.notes && (
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                        {trip.notes}
                      </p>
                    )}

                    <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-emerald-300" />
                        {formatDateRange(trip.startDate, trip.endDate)}
                      </div>

                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-emerald-300" />
                        {trip.photoPoints.length} photo point
                        {trip.photoPoints.length === 1 ? "" : "s"}
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-300" />
                        {averageCoordinate
                          ? `${formatCoordinate(
                              averageCoordinate.latitude,
                              "N",
                              "S"
                            )}, ${formatCoordinate(
                              averageCoordinate.longitude,
                              "E",
                              "W"
                            )}`
                          : "No coordinates"}
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/trips/${trip.id}`}
                    className="shrink-0 rounded-full bg-emerald-500 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    View trip
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}