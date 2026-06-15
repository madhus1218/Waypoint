"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload, FileText, MapPin, Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getAnonymousOwnerId } from "@/lib/anonymousUser";

type TravelPoint = {
  filename: string;
  latitude: string;
  longitude: string;
  timestamp: string;
};

type GeneratedTrip = {
  title: string;
  city: string | null;
  country: string | null;
  startTimestamp: string;
  endTimestamp: string;
  insight: string;
  points: TravelPoint[];
};

type ValidationSummary = {
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  duplicateRows: number;
  messages: string[];
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

function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const earthRadiusMiles = 3958.8;

  const latDistance = ((lat2 - lat1) * Math.PI) / 180;
  const lonDistance = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(latDistance / 2) * Math.sin(latDistance / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(lonDistance / 2) *
      Math.sin(lonDistance / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

function getLocationDetails(latitude: number, longitude: number) {
  if (
    latitude >= 48 &&
    latitude <= 49.5 &&
    longitude >= 1.5 &&
    longitude <= 3
  ) {
    return {
      title: "Paris, France",
      city: "Paris",
      country: "France",
    };
  }

  if (
    latitude >= 48.5 &&
    latitude <= 50 &&
    longitude >= 5.5 &&
    longitude <= 7
  ) {
    return {
      title: "Metz, France",
      city: "Metz",
      country: "France",
    };
  }

  if (
    latitude >= 46.5 &&
    latitude <= 48 &&
    longitude >= 7.5 &&
    longitude <= 9.5
  ) {
    return {
      title: "Zurich, Switzerland",
      city: "Zurich",
      country: "Switzerland",
    };
  }

  return {
    title: "Unnamed Travel Stop",
    city: null,
    country: null,
  };
}

function getTripInsight(
  title: string,
  pointCount: number,
  startTimestamp: string,
  endTimestamp: string
) {
  const startDate = new Date(startTimestamp);
  const endDate = new Date(endTimestamp);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${pointCount} photo point${pointCount === 1 ? "" : "s"} grouped near ${title}.`;
  }

  const dayCount =
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  if (pointCount === 1) {
    return `1 photo point detected near ${title}.`;
  }

  return `${pointCount} photo points grouped near ${title} over ${dayCount} day${
    dayCount === 1 ? "" : "s"
  }.`;
}

const REQUIRED_COLUMNS = [
  "filename",
  "latitude",
  "longitude",
  "timestamp",
] as const;

function normalizeRow(row: TravelPoint): TravelPoint {
  return {
    filename: String(row.filename || "").trim(),
    latitude: String(row.latitude || "").trim(),
    longitude: String(row.longitude || "").trim(),
    timestamp: String(row.timestamp || "").trim(),
  };
}

function validateTravelPoint(row: TravelPoint) {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const timestamp = new Date(row.timestamp);

  if (
    !row.filename ||
    !row.latitude ||
    !row.longitude ||
    !row.timestamp
  ) {
    return "Missing a required value";
  }

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return "Latitude must be between -90 and 90";
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return "Longitude must be between -180 and 180";
  }

  if (Number.isNaN(timestamp.getTime())) {
    return "Timestamp is invalid";
  }

  return null;
}

function getDuplicateKey(point: TravelPoint) {
  return [
    point.filename.toLowerCase(),
    Number(point.latitude).toFixed(6),
    Number(point.longitude).toFixed(6),
    new Date(point.timestamp).toISOString(),
  ].join("|");
}

const MAX_DISTANCE_MILES = 75;
const MAX_TIME_GAP_HOURS = 72;

function generateTrips(points: TravelPoint[]): GeneratedTrip[] {
  const sortedPoints = [...points].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() -
      new Date(b.timestamp).getTime()
  );

  const clusters: TravelPoint[][] = [];

  sortedPoints.forEach((point) => {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    const timestamp = new Date(point.timestamp).getTime();

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Number.isNaN(timestamp)
    ) {
      return;
    }

    const matchingCluster = clusters.find((cluster) => {
      const averageLatitude =
        cluster.reduce(
          (sum, item) => sum + Number(item.latitude),
          0
        ) / cluster.length;

      const averageLongitude =
        cluster.reduce(
          (sum, item) => sum + Number(item.longitude),
          0
        ) / cluster.length;

      const distance = calculateDistanceMiles(
        latitude,
        longitude,
        averageLatitude,
        averageLongitude
      );

      const latestTimestamp = Math.max(
        ...cluster.map((item) =>
          new Date(item.timestamp).getTime()
        )
      );

      const timeGapHours =
        Math.abs(timestamp - latestTimestamp) /
        (1000 * 60 * 60);

      return (
        distance <= MAX_DISTANCE_MILES &&
        timeGapHours <= MAX_TIME_GAP_HOURS
      );
    });

    if (matchingCluster) {
      matchingCluster.push(point);
    } else {
      clusters.push([point]);
    }
  });

  return clusters
    .map((tripPoints) => {
      const sortedTripPoints = [...tripPoints].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      );

      const firstPoint = sortedTripPoints[0];
      const lastPoint =
        sortedTripPoints[sortedTripPoints.length - 1];

      const averageLatitude =
        sortedTripPoints.reduce(
          (sum, point) => sum + Number(point.latitude),
          0
        ) / sortedTripPoints.length;

      const averageLongitude =
        sortedTripPoints.reduce(
          (sum, point) => sum + Number(point.longitude),
          0
        ) / sortedTripPoints.length;

      const location = getLocationDetails(
        averageLatitude,
        averageLongitude
      );

      return {
        title: location.title,
        city: location.city,
        country: location.country,
        startTimestamp: firstPoint.timestamp,
        endTimestamp: lastPoint.timestamp,
        insight: getTripInsight(
          location.title,
          sortedTripPoints.length,
          firstPoint.timestamp,
          lastPoint.timestamp
        ),
        points: sortedTripPoints,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.startTimestamp).getTime() -
        new Date(b.startTimestamp).getTime()
    );
}

export default function UploadPage() {
  const router = useRouter();

  const [points, setPoints] = useState<TravelPoint[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  setFileName(file.name);
  setError("");
  setPoints([]);
  setValidationSummary(null);
  setSaveStatus("idle");
  setSaveMessage("");

  Papa.parse<TravelPoint>(file, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
    complete: (results) => {
      const fields = results.meta.fields || [];

      const missingColumns = REQUIRED_COLUMNS.filter(
        (column) => !fields.includes(column)
      );

      if (missingColumns.length > 0) {
        setError(
          `Missing required CSV column${
            missingColumns.length === 1 ? "" : "s"
          }: ${missingColumns.join(", ")}.`
        );
        return;
      }

      if (results.errors.length > 0) {
        console.warn("CSV parsing warnings:", results.errors);
      }

      const normalizedRows = results.data.map(normalizeRow);
      const validRows: TravelPoint[] = [];
      const validationMessages = new Set<string>();
      const seenRows = new Set<string>();

      let rejectedRows = 0;
      let duplicateRows = 0;

      normalizedRows.forEach((row, index) => {
        const validationError = validateTravelPoint(row);

        if (validationError) {
          rejectedRows += 1;
          validationMessages.add(
            `Row ${index + 2}: ${validationError}.`
          );
          return;
        }

        const duplicateKey = getDuplicateKey(row);

        if (seenRows.has(duplicateKey)) {
          duplicateRows += 1;
          return;
        }

        seenRows.add(duplicateKey);
        validRows.push(row);
      });

      const summary: ValidationSummary = {
        totalRows: normalizedRows.length,
        validRows: validRows.length,
        rejectedRows,
        duplicateRows,
        messages: Array.from(validationMessages).slice(0, 6),
      };

      setValidationSummary(summary);

      if (validRows.length === 0) {
        setError(
          "No valid travel points were found. Review the validation details below."
        );
        localStorage.removeItem("waypoint-points");
        return;
      }

      setPoints(validRows);
      localStorage.setItem(
        "waypoint-points",
        JSON.stringify(validRows)
      );
    },
    error: (parseError) => {
      console.error("CSV parsing failed:", parseError);
      setError("Something went wrong while parsing the CSV file.");
      setPoints([]);
      setValidationSummary(null);
      localStorage.removeItem("waypoint-points");
    },
  });
}

  async function handleGenerateAndSaveTrips() {
  if (points.length === 0) {
    const ownerId = getAnonymousOwnerId();
    setSaveStatus("error");
    setSaveMessage("Upload a valid CSV before generating trips.");
    return;
  }

  const ownerId = getAnonymousOwnerId();

  try {
    setSaveStatus("saving");
    setSaveMessage("Generating and saving trips...");

    const generatedTrips = generateTrips(points);

    if (generatedTrips.length === 0) {
      setSaveStatus("error");
      setSaveMessage("No trips could be generated from this CSV.");
      return;
    }

    await Promise.all(
      generatedTrips.map(async (trip) => {
        const response = await fetch("/api/trips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
          ownerId,
          title: trip.title,
          startDate: trip.startTimestamp,
          endDate: trip.endTimestamp,
          city: trip.city,
          country: trip.country,
          notes: trip.insight,
          photoPoints: trip.points.map((point) => ({
            filename: point.filename,
            latitude: Number(point.latitude),
            longitude: Number(point.longitude),
            takenAt: point.timestamp,
          })),
        }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to save trip");
        }

        return data.trip;
      })
    );

    setSaveStatus("saved");
    setSaveMessage(
      `Saved ${generatedTrips.length} trip${generatedTrips.length === 1 ? "" : "s"}. Redirecting...`
    );

    router.push("/trips");
  } catch (err) {
    console.error("Failed to generate and save trips:", err);
    setSaveStatus("error");
    setSaveMessage("Could not save trips. Check your database connection.");
  }
}

  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <nav className="mb-12 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
            Waypoint Upload
          </div>
        </nav>

        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-500/20 text-blue-300">
            <Upload className="h-7 w-7" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Upload your travel metadata.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Start by uploading a CSV export with photo timestamps and GPS
            coordinates. Waypoint will use this data to detect trips and
            generate your travel timeline.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <label className="flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-blue-400/30 bg-blue-400/5 p-8 text-center transition hover:border-blue-300 hover:bg-blue-400/10">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500 text-white">
                <FileText className="h-8 w-8" />
              </div>

              <h2 className="text-2xl font-bold">Choose your CSV file</h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                For the MVP, use a CSV with filename, latitude, longitude, and
                timestamp columns.
              </p>

              <div className="mt-7 rounded-full bg-blue-500 px-7 py-3 font-semibold text-white transition hover:bg-blue-400">
                Upload CSV
              </div>

              {fileName && (
                <p className="mt-4 text-sm text-blue-200">
                  Selected: {fileName}
                </p>
              )}

              {error && (
                <p className="mt-4 max-w-md text-sm text-red-300">{error}</p>
              )}
            </label>
          </div>

          <div className="space-y-4">
            <InfoCard
              icon={<MapPin className="h-5 w-5" />}
              title="Location points"
              description={`${points.length} valid travel point${
                points.length === 1 ? "" : "s"
              } loaded from your CSV.`}
            />

            <InfoCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Trip detection"
              description="Next, Waypoint will cluster nearby points to infer trips, stops, and routes."
            />

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-bold">Expected CSV format</h3>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-300">
{`filename,latitude,longitude,timestamp
photo1.jpg,48.8566,2.3522,2026-01-12T10:00:00
photo2.jpg,49.1193,6.1757,2026-01-14T14:30:00
photo3.jpg,47.3769,8.5417,2026-01-18T09:15:00`}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {validationSummary && (
          <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div>
              <p className="text-sm font-medium text-blue-200">
                CSV validation
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Upload summary
              </h2>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ValidationStat
                label="Total rows"
                value={validationSummary.totalRows}
              />

              <ValidationStat
                label="Valid points"
                value={validationSummary.validRows}
              />

              <ValidationStat
                label="Rejected rows"
                value={validationSummary.rejectedRows}
              />

              <ValidationStat
                label="Duplicates removed"
                value={validationSummary.duplicateRows}
              />
            </div>

            {validationSummary.messages.length > 0 && (
              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
                <p className="font-semibold text-amber-100">
                  Validation warnings
                </p>

                <ul className="mt-3 space-y-2 text-sm text-amber-100/80">
                  {validationSummary.messages.map((message) => (
                    <li key={message}>• {message}</li>
                  ))}
                </ul>

                {validationSummary.rejectedRows >
                  validationSummary.messages.length && (
                  <p className="mt-3 text-xs text-amber-200/70">
                    Only the first few unique validation warnings are shown.
                  </p>
                )}
              </div>
            )}

            {validationSummary.validRows > 0 &&
              validationSummary.rejectedRows === 0 &&
              validationSummary.duplicateRows === 0 && (
                <p className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  Your CSV passed validation and is ready for trip generation.
                </p>
              )}
          </section>
        )}

        {points.length > 0 && (
          <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-bold">Parsed metadata preview</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Showing the first {Math.min(points.length, 8)} rows from your
                  uploaded CSV.
                </p>
              </div>

              <button
                onClick={handleGenerateAndSaveTrips}
                disabled={saveStatus === "saving" || points.length === 0}
                className="rounded-full bg-blue-500 px-6 py-3 text-center font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveStatus === "saving" ? "Saving trips..." : "Generate & save trips"}
              </button>
              {saveMessage && (
                <p
                  className={`mt-3 text-sm ${
                    saveStatus === "error" ? "text-red-300" : "text-blue-200"
                  }`}
                >
                  {saveMessage}
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/10 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Filename</th>
                    <th className="px-4 py-3">Latitude</th>
                    <th className="px-4 py-3">Longitude</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>

                <tbody>
                  {points.slice(0, 8).map((point, index) => (
                    <tr key={index} className="border-t border-white/10">
                      <td className="px-4 py-3 text-slate-200">
                        {point.filename}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {point.latitude}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {point.longitude}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {point.timestamp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ValidationStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300">
        {icon}
      </div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}