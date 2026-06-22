"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  LoaderCircle,
  MapPin,
  Merge,
  Pencil,
  Scissors,
  TriangleAlert,
} from "lucide-react";

type PhotoAsset = {
  id: string;
  filename: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  warning: string | null;
  tripId: string | null;
};

type Trip = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  startDate: string;
  endDate: string;
  confidence: number | null;
  centerLat: number | null;
  centerLng: number | null;
  status: "PROPOSED" | "CONFIRMED" | "ARCHIVED";
  photos: PhotoAsset[];
};

type UploadBatch = {
  id: string;
  status: string;
  originalCount: number;
  processedCount: number;
  warningCount: number;
  trips: Trip[];
  photos: PhotoAsset[];
};

type ReviewResponse = {
  batch: UploadBatch;
};

type ReviewAction =
  | {
      action: "rename";
      tripId: string;
      title: string;
    }
  | {
      action: "move-photo";
      photoId: string;
      targetTripId: string;
    }
  | {
      action: "merge";
      sourceTripId: string;
      targetTripId: string;
    }
  | {
      action: "split";
      tripId: string;
      splitPhotoId: string;
    }
  | {
      action: "confirm";
    };

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function confidenceLabel(value: number | null) {
  if (value === null) {
    return "Unknown";
  }

  if (value >= 0.85) {
    return "High";
  }

  if (value >= 0.65) {
    return "Medium";
  }

  return "Low";
}

export default function ReviewPage() {
  const params = useParams<{
    id: string;
  }>();

  const router = useRouter();

  const uploadBatchId = params.id;

  const [batch, setBatch] =
    useState<UploadBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] =
    useState<string | null>(null);
  const [error, setError] = useState("");

  const loadReview = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/review/${uploadBatchId}`,
        {
          cache: "no-store",
        }
      );

      const data = (await response.json()) as
        | ReviewResponse
        | { error?: string };

      if (!response.ok || !("batch" in data)) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Could not load trip review."
        );
      }

      setBatch(data.batch);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load trip review."
      );
    } finally {
      setLoading(false);
    }
  }, [uploadBatchId]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  async function performAction(
    action: ReviewAction,
    actionKey: string
  ) {
    try {
      setActiveAction(actionKey);
      setError("");

      const response = await fetch(
        `/api/review/${uploadBatchId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(action),
        }
      );

      const data = (await response.json()) as
        | ReviewResponse
        | { error?: string };

      if (!response.ok || !("batch" in data)) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Could not update the trip."
        );
      }

      setBatch(data.batch);

      if (action.action === "confirm") {
        router.push("/trips");
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update the trip."
      );
    } finally {
      setActiveAction(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] text-white">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
          <p className="mt-4 text-slate-400">
            Loading proposed trips...
          </p>
        </div>
      </main>
    );
  }

  if (!batch) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] px-6 text-white">
        <div className="max-w-md text-center">
          <TriangleAlert className="mx-auto h-10 w-10 text-red-300" />
          <h1 className="mt-4 text-2xl font-bold">
            Review unavailable
          </h1>
          <p className="mt-3 text-slate-400">
            {error || "This upload batch could not be found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07130f] px-5 py-8 text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <nav className="mb-10">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to uploads
          </Link>
        </nav>

        <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-medium text-emerald-300">
              Trip review
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
              Check your detected trips.
            </h1>

            <p className="mt-4 max-w-2xl leading-7 text-slate-300">
              Rename, merge, split, or move photos before
              adding these trips to your private travel history.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              performAction(
                {
                  action: "confirm",
                },
                "confirm"
              )
            }
            disabled={
              activeAction !== null ||
              batch.trips.length === 0
            }
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activeAction === "confirm" ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}

            Confirm trips
          </button>
        </header>

        {error && (
          <div className="mb-8 rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Proposed trips"
            value={batch.trips.length}
          />

          <SummaryCard
            label="Assigned photos"
            value={batch.trips.reduce(
              (sum, trip) => sum + trip.photos.length,
              0
            )}
          />

          <SummaryCard
            label="Unassigned photos"
            value={batch.photos.length}
          />
        </div>

        <div className="space-y-6">
          {batch.trips.map((trip, index) => (
            <TripReviewCard
              key={trip.id}
              trip={trip}
              tripNumber={index + 1}
              allTrips={batch.trips}
              activeAction={activeAction}
              onAction={performAction}
            />
          ))}
        </div>

        {batch.photos.length > 0 && (
          <section className="mt-8 rounded-[2rem] border border-amber-300/20 bg-amber-400/5 p-6">
            <h2 className="text-xl font-bold text-amber-100">
              Unassigned photos
            </h2>

            <p className="mt-2 text-sm text-amber-100/70">
              These photos were saved but were not assigned to
              a detected trip.
            </p>

            <div className="mt-5 space-y-3">
              {batch.photos.map((photo) => (
                <UnassignedPhoto
                  key={photo.id}
                  photo={photo}
                  trips={batch.trips}
                  activeAction={activeAction}
                  onAction={performAction}
                />
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function TripReviewCard({
  trip,
  tripNumber,
  allTrips,
  activeAction,
  onAction,
}: {
  trip: Trip;
  tripNumber: number;
  allTrips: Trip[];
  activeAction: string | null;
  onAction: (
    action: ReviewAction,
    actionKey: string
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState(trip.title);
  const [mergeTarget, setMergeTarget] = useState("");

  useEffect(() => {
    setTitle(trip.title);
  }, [trip.title]);

  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5">
      <div className="border-b border-white/10 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-300">
              Trip {tripNumber}
            </p>

            <div className="mt-2 flex max-w-xl gap-2">
              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xl font-bold outline-none transition focus:border-emerald-400/60"
              />

              <button
                type="button"
                onClick={() =>
                  onAction(
                    {
                      action: "rename",
                      tripId: trip.id,
                      title,
                    },
                    `rename-${trip.id}`
                  )
                }
                disabled={
                  activeAction !== null ||
                  title.trim().length === 0 ||
                  title.trim() === trip.title
                }
                className="rounded-xl border border-white/10 px-4 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label="Save trip name"
              >
                {activeAction ===
                `rename-${trip.id}` ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Pencil className="h-5 w-5" />
                )}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">
              <span>
                {formatDate(trip.startDate)}
              </span>

              <span>→</span>

              <span>
                {formatDate(trip.endDate)}
              </span>

              <span>
                {trip.photos.length} photo
                {trip.photos.length === 1 ? "" : "s"}
              </span>

              <span>
                {confidenceLabel(trip.confidence)} confidence
              </span>
            </div>
          </div>

          {allTrips.length > 1 && (
            <div className="flex min-w-64 gap-2">
              <div className="relative flex-1">
                <select
                  value={mergeTarget}
                  onChange={(event) =>
                    setMergeTarget(event.target.value)
                  }
                  className="w-full appearance-none rounded-xl border border-white/10 bg-[#0b1c16] px-4 py-2.5 pr-9 text-sm text-slate-200 outline-none"
                >
                  <option value="">
                    Merge into...
                  </option>

                  {allTrips
                    .filter(
                      (candidate) =>
                        candidate.id !== trip.id
                    )
                    .map((candidate) => (
                      <option
                        key={candidate.id}
                        value={candidate.id}
                      >
                        {candidate.title}
                      </option>
                    ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
              </div>

              <button
                type="button"
                onClick={() =>
                  onAction(
                    {
                      action: "merge",
                      sourceTripId: trip.id,
                      targetTripId: mergeTarget,
                    },
                    `merge-${trip.id}`
                  )
                }
                disabled={
                  activeAction !== null ||
                  mergeTarget.length === 0
                }
                className="rounded-xl border border-white/10 px-4 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                {activeAction ===
                `merge-${trip.id}` ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Merge className="h-5 w-5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="divide-y divide-white/10">
        {trip.photos.map((photo, index) => (
          <div
            key={photo.id}
            className="grid gap-4 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-200">
                {photo.filename}
              </p>

              <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>
                  {formatDate(photo.takenAt)}
                </span>

                {photo.latitude !== null &&
                  photo.longitude !== null && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {photo.latitude.toFixed(4)},{" "}
                      {photo.longitude.toFixed(4)}
                    </span>
                  )}
              </div>
            </div>

            {index > 0 && (
              <button
                type="button"
                onClick={() =>
                  onAction(
                    {
                      action: "split",
                      tripId: trip.id,
                      splitPhotoId: photo.id,
                    },
                    `split-${photo.id}`
                  )
                }
                disabled={activeAction !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                {activeAction ===
                `split-${photo.id}` ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Scissors className="h-4 w-4" />
                )}

                Split here
              </button>
            )}

            <MovePhotoSelect
              photo={photo}
              currentTripId={trip.id}
              trips={allTrips}
              activeAction={activeAction}
              onAction={onAction}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function MovePhotoSelect({
  photo,
  currentTripId,
  trips,
  activeAction,
  onAction,
}: {
  photo: PhotoAsset;
  currentTripId: string;
  trips: Trip[];
  activeAction: string | null;
  onAction: (
    action: ReviewAction,
    actionKey: string
  ) => Promise<void>;
}) {
  return (
    <select
      value={currentTripId}
      disabled={
        activeAction !== null || trips.length < 2
      }
      onChange={(event) =>
        onAction(
          {
            action: "move-photo",
            photoId: photo.id,
            targetTripId: event.target.value,
          },
          `move-${photo.id}`
        )
      }
      className="rounded-xl border border-white/10 bg-[#0b1c16] px-3 py-2 text-xs text-slate-200 outline-none disabled:opacity-40"
    >
      {trips.map((trip) => (
        <option key={trip.id} value={trip.id}>
          {trip.title}
        </option>
      ))}
    </select>
  );
}

function UnassignedPhoto({
  photo,
  trips,
  activeAction,
  onAction,
}: {
  photo: PhotoAsset;
  trips: Trip[];
  activeAction: string | null;
  onAction: (
    action: ReviewAction,
    actionKey: string
  ) => Promise<void>;
}) {
  const [targetTripId, setTargetTripId] = useState(
    trips[0]?.id ?? ""
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {photo.filename}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {photo.warning || "Not assigned by DBSCAN"}
        </p>
      </div>

      <select
        value={targetTripId}
        onChange={(event) =>
          setTargetTripId(event.target.value)
        }
        className="rounded-xl border border-white/10 bg-[#0b1c16] px-3 py-2 text-sm text-slate-200"
      >
        {trips.map((trip) => (
          <option key={trip.id} value={trip.id}>
            {trip.title}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={
          activeAction !== null ||
          targetTripId.length === 0
        }
        onClick={() =>
          onAction(
            {
              action: "move-photo",
              photoId: photo.id,
              targetTripId,
            },
            `move-${photo.id}`
          )
        }
        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-400 disabled:opacity-40"
      >
        Add to trip
      </button>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>
    </div>
  );
}