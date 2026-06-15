"use client";

import Link from "next/link";
import { getAnonymousOwnerId } from "@/lib/anonymousUser";
import RouteMapPreview from "@/components/RouteMapPreview";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Camera,
  MapPin,
  RefreshCw,
  Route,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

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

function formatDateTime(timestamp: string) {
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

function formatDateRange(startDate: string, endDate: string) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  return start === end ? start : `${start} – ${end}`;
}

function formatCoordinate(value: number, directionPositive: string, directionNegative: string) {
  return `${Math.abs(value).toFixed(4)}° ${
    value >= 0 ? directionPositive : directionNegative
  }`;
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

export default function TripDetailPage() {
  const params = useParams();
  const tripId = params.id as string;
  const router = useRouter();

    const [trip, setTrip] = useState<SavedTrip | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState("");
    const [editedNotes, setEditedNotes] = useState("");
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function fetchTrip() {
    try {
      setIsLoading(true);
      setError("");

    const ownerId = getAnonymousOwnerId();

    const response = await fetch(`/api/trips/${tripId}?ownerId=${ownerId}`, {
        cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Failed to fetch trip");
    }

    setTrip(data.trip);
    setEditedTitle(data.trip.title);
    setEditedNotes(data.trip.notes || "");

    } catch (err) {
      console.error("Failed to fetch trip:", err);
      setError("Could not load this trip.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteTrip() {
    const confirmed = window.confirm(
        "Are you sure you want to delete this trip? This cannot be undone."
    );

    if (!confirmed) {
        return;
    }

    try {
        const ownerId = getAnonymousOwnerId();

        const response = await fetch(`/api/trips/${tripId}?ownerId=${ownerId}`, {
            method: "DELETE",
        });

        const data = await response.json();

        if (!response.ok) {
        throw new Error(data.error || "Failed to delete trip");
        }

        router.push("/trips");
    } catch (err) {
        console.error("Failed to delete trip:", err);
        setError("Could not delete this trip.");
        }
    }

    async function handleSaveTripEdits() {
        if (!trip) {
            return;
        }

        try {
            setSaveStatus("saving");

            const ownerId = getAnonymousOwnerId();

            const response = await fetch(`/api/trips/${tripId}?ownerId=${ownerId}`, {
                method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: editedTitle,
              city: trip.city,
              country: trip.country,
              notes: editedNotes,
            }),
            });

            const data = await response.json();

            if (!response.ok) {
            throw new Error(data.error || "Failed to update trip");
            }

            setTrip(data.trip);
            setEditedTitle(data.trip.title);
            setEditedNotes(data.trip.notes || "");
            setIsEditing(false);
            setSaveStatus("saved");
        } catch (err) {
            console.error("Failed to save trip edits:", err);
            setSaveStatus("error");
        }
    }

  useEffect(() => {
    fetchTrip();
  }, [tripId]);

  const averageCoordinate = useMemo(() => {
    if (!trip) {
      return null;
    }

    return getAverageCoordinate(trip.photoPoints);
  }, [trip]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-white">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-500/20 text-blue-300">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>

          <h1 className="text-3xl font-bold">Loading trip...</h1>

          <p className="mt-4 text-slate-300">
            Waypoint is loading this saved trip from your database.
          </p>
        </section>
      </main>
    );
  }

  if (error || !trip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-white">
        <section className="max-w-xl rounded-[2rem] border border-red-300/20 bg-red-400/10 p-8 text-center">
          <h1 className="text-3xl font-bold">Trip not found.</h1>

          <p className="mt-4 leading-7 text-red-100">{error}</p>

          <Link
            href="/trips"
            className="mt-7 inline-flex rounded-full bg-blue-500 px-7 py-3 font-semibold text-white transition hover:bg-blue-400"
          >
            Back to trips
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <nav className="mb-12 flex items-center justify-between">
            <Link
                href="/trips"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to trips
            </Link>

            <div className="flex items-center gap-3">
                <button
                onClick={handleDeleteTrip}
                className="rounded-full border border-red-300/20 px-4 py-2 text-sm font-medium text-red-200 transition hover:border-red-300/40 hover:bg-red-400/10"
                >
                Delete trip
                </button>

                <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
                Trip Detail
                </div>
            </div>
            </nav>

        <div className="mb-10 rounded-[2rem] border border-white/10 bg-white/5 p-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="flex-1">
                    <p className="text-sm text-blue-200">Saved Waypoint trip</p>

                    {isEditing ? (
                    <div className="mt-3 space-y-4">
                        <input
                        value={editedTitle}
                        onChange={(event) => setEditedTitle(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-3xl font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-blue-300/50 focus:bg-white/10 md:text-5xl"
                        placeholder="Trip title"
                        />

                        <textarea
                        value={editedNotes}
                        onChange={(event) => setEditedNotes(event.target.value)}
                        className="min-h-32 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base leading-7 text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-blue-300/50 focus:bg-white/10"
                        placeholder="Add notes about this trip..."
                        />
                    </div>
                    ) : (
                    <>
                        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
                        {trip.title}
                        </h1>

                        {trip.notes ? (
                        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
                            {trip.notes}
                        </p>
                        ) : (
                        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-500">
                            No notes yet.
                        </p>
                        )}
                    </>
                    )}
                </div>

                <div className="flex gap-3">
                    {isEditing ? (
                    <>
                        <button
                        onClick={() => {
                            setIsEditing(false);
                            setEditedTitle(trip.title);
                            setEditedNotes(trip.notes || "");
                            setSaveStatus("idle");
                        }}
                        className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-white/40 hover:bg-white/5"
                        >
                        Cancel
                        </button>

                        <button
                        onClick={handleSaveTripEdits}
                        disabled={saveStatus === "saving"}
                        className="rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                        {saveStatus === "saving" ? "Saving..." : "Save"}
                        </button>
                    </>
                    ) : (
                    <button
                        onClick={() => {
                        setIsEditing(true);
                        setSaveStatus("idle");
                        }}
                        className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/90 transition hover:border-blue-300/50 hover:bg-blue-400/10"
                    >
                        Edit trip
                    </button>
                    )}
                </div>
                </div>

                {saveStatus === "saved" && (
                <div className="mt-5 rounded-2xl border border-blue-300/30 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">
                    Trip updated successfully.
                </div>
                )}

                {saveStatus === "error" && (
                <div className="mt-5 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                    Could not update this trip.
                </div>
                )}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard
              icon={<Calendar className="h-5 w-5" />}
              label="Date range"
              value={formatDateRange(trip.startDate, trip.endDate)}
            />

            <StatCard
              icon={<Camera className="h-5 w-5" />}
              label="Photo points"
              value={`${trip.photoPoints.length}`}
            />

            <StatCard
              icon={<MapPin className="h-5 w-5" />}
              label="Average location"
              value={
                averageCoordinate
                  ? `${formatCoordinate(
                      averageCoordinate.latitude,
                      "N",
                      "S"
                    )}, ${formatCoordinate(
                      averageCoordinate.longitude,
                      "E",
                      "W"
                    )}`
                  : "No coordinates"
              }
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex items-center gap-2">
              <Route className="h-5 w-5 text-blue-300" />
              <h2 className="text-2xl font-bold">Timeline points</h2>
            </div>

            <div className="space-y-3">
              {trip.photoPoints.map((point, index) => (
                <div
                  key={point.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="text-sm text-blue-200">Point {index + 1}</p>

                  <h3 className="mt-1 font-semibold text-white">
                    {point.filename || "Untitled photo"}
                  </h3>

                  <p className="mt-2 text-sm text-slate-300">
                    {formatDateTime(point.takenAt)}
                  </p>

                  <p className="mt-1 text-sm text-slate-400">
                    {point.latitude}, {point.longitude}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div className="mb-5">
                <p className="text-sm text-slate-400">Route preview</p>
                <h2 className="text-2xl font-bold">Saved trip visualization</h2>
            </div>

            <RouteMapPreview points={trip.photoPoints} />
          </section>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300">
        {icon}
      </div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-white">{value}</p>
    </div>
  );
}