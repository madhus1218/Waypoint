"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import {
  ArrowLeft,
  Download,
  FileText,
  MapPin,
  Sparkles,
  Upload,
} from "lucide-react";
import { getAnonymousOwnerId } from "@/lib/anonymousUser";
import {
  inferTripsWithDbscan,
  type GeoPoint,
} from "@/lib/dbscan";

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
  confidence: "High" | "Medium" | "Low";
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

const REQUIRED_COLUMNS = [
  "filename",
  "latitude",
  "longitude",
  "timestamp",
] as const;

const DBSCAN_EPSILON_MILES = 75;
const DBSCAN_MIN_POINTS = 2;
const MAX_TIME_GAP_HOURS = 72;

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

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return `${pointCount} photo point${
      pointCount === 1 ? "" : "s"
    } grouped near ${title} using DBSCAN geospatial clustering.`;
  }

  const dayCount =
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  if (pointCount === 1) {
    return `1 photo point detected near ${title}.`;
  }

  return `${pointCount} photo points grouped near ${title} over ${dayCount} day${
    dayCount === 1 ? "" : "s"
  } using DBSCAN geospatial clustering.`;
}

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

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return "Latitude must be between -90 and 90";
  }

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
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

function getTripConfidence(
  pointCount: number
): "High" | "Medium" | "Low" {
  if (pointCount >= 5) {
    return "High";
  }

  if (pointCount >= 3) {
    return "Medium";
  }

  return "Low";
}

function convertToGeoPoints(points: TravelPoint[]): GeoPoint[] {
  return points.map((point) => ({
    filename: point.filename,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    timestamp: point.timestamp,
  }));
}

function convertToTravelPoint(point: GeoPoint): TravelPoint {
  return {
    filename: point.filename || "unknown-photo",
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    timestamp: point.timestamp,
  };
}

function generateTrips(points: TravelPoint[]): GeneratedTrip[] {
  const geoPoints = convertToGeoPoints(points);

  const dbscanClusters = inferTripsWithDbscan(geoPoints, {
    epsilonMiles: DBSCAN_EPSILON_MILES,
    minPoints: DBSCAN_MIN_POINTS,
    maxTimeGapHours: MAX_TIME_GAP_HOURS,
  });

  return dbscanClusters.map((cluster) => {
    const tripPoints = cluster.points.map(convertToTravelPoint);

    const location = getLocationDetails(
      cluster.latitude,
      cluster.longitude
    );

    return {
      title: location.title,
      city: location.city,
      country: location.country,
      confidence: getTripConfidence(tripPoints.length),
      startTimestamp: cluster.startDate,
      endTimestamp: cluster.endDate,
      insight: getTripInsight(
        location.title,
        tripPoints.length,
        cluster.startDate,
        cluster.endDate
      ),
      points: tripPoints,
    };
  });
}

export default function UploadPage() {
  const router = useRouter();

  const [points, setPoints] = useState<TravelPoint[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummary | null>(null);

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
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

          localStorage.removeItem("waypoint-points");
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

        setError(
          "Something went wrong while parsing the CSV file."
        );

        setPoints([]);
        setValidationSummary(null);
        localStorage.removeItem("waypoint-points");
      },
    });
  }

  async function handleGenerateAndSaveTrips() {
    if (points.length === 0) {
      setSaveStatus("error");
      setSaveMessage(
        "Upload a valid CSV before generating trips."
      );
      return;
    }

    const ownerId = getAnonymousOwnerId();

    try {
      setSaveStatus("saving");
      setSaveMessage(
        "Running DBSCAN clustering and saving trips..."
      );

      const generatedTrips = generateTrips(points);

      if (generatedTrips.length === 0) {
        setSaveStatus("error");
        setSaveMessage(
          `No trips could be generated. DBSCAN requires at least ${DBSCAN_MIN_POINTS} nearby photo points within ${DBSCAN_EPSILON_MILES} miles.`
        );
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
              notes: `${trip.insight} Detection confidence: ${trip.confidence}.`,
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
            throw new Error(
              data.error || "Failed to save trip"
            );
          }

          return data.trip;
        })
      );

      setSaveStatus("saved");

      setSaveMessage(
        `Saved ${generatedTrips.length} DBSCAN-detected trip${
          generatedTrips.length === 1 ? "" : "s"
        }. Redirecting...`
      );

      router.push("/trips");
    } catch (saveError) {
      console.error(
        "Failed to generate and save trips:",
        saveError
      );

      setSaveStatus("error");

      setSaveMessage(
        "Could not save trips. Check your database connection."
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#07130f] px-5 py-8 text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <nav className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </nav>

        <header className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-300">
            <Upload className="h-7 w-7" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Upload your travel metadata.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Upload a CSV containing photo timestamps and GPS
            coordinates. Waypoint will validate the file, run
            DBSCAN-based geospatial clustering, separate visits by
            timestamp, and build your travel timeline.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <label className="flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-emerald-400/30 bg-emerald-400/5 p-8 text-center transition hover:border-emerald-300 hover:bg-emerald-400/10">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500 text-white">
                <FileText className="h-8 w-8" />
              </div>

              <h2 className="text-2xl font-bold">
                Choose a CSV file
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                Upload your own metadata or use the full demo CSV
                to test DBSCAN clustering, confidence levels,
                validation, duplicate removal, time-based trip
                separation, and interactive route maps.
              </p>

              <span className="mt-7 rounded-full bg-emerald-500 px-7 py-3 font-semibold text-white transition hover:bg-emerald-400">
                Select CSV
              </span>

              <a
                href="/sample-waypoint-data.csv"
                download
                onClick={(event) => event.stopPropagation()}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-300/50 hover:bg-emerald-400/10 hover:text-white"
              >
                <Download className="h-4 w-4" />
                Download full demo CSV
              </a>

              {fileName && (
                <p className="mt-5 text-sm text-emerald-200">
                  Selected: {fileName}
                </p>
              )}

              {error && (
                <p className="mt-4 max-w-md text-sm text-red-300">
                  {error}
                </p>
              )}
            </label>
          </div>

          <aside className="space-y-4">
            <InfoCard
              icon={<MapPin className="h-5 w-5" />}
              title="Location points"
              description={`${points.length} valid travel point${
                points.length === 1 ? "" : "s"
              } loaded from your CSV.`}
            />

            <InfoCard
              icon={<Sparkles className="h-5 w-5" />}
              title="DBSCAN trip detection"
              description={`Waypoint detects dense groups of at least ${DBSCAN_MIN_POINTS} photo points within ${DBSCAN_EPSILON_MILES} miles, then separates visits more than ${MAX_TIME_GAP_HOURS} hours apart.`}
            />

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-bold">
                Expected CSV format
              </h3>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-300">
{`filename,latitude,longitude,timestamp
photo1.jpg,48.8566,2.3522,2026-01-12T10:00:00
photo2.jpg,49.1193,6.1757,2026-01-14T14:30:00
photo3.jpg,47.3769,8.5417,2026-01-18T09:15:00`}
                </pre>
              </div>
            </div>
          </aside>
        </div>

        {validationSummary && (
          <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm font-medium text-emerald-200">
              CSV validation
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Upload summary
            </h2>

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
                    Only the first few validation warnings are
                    shown.
                  </p>
                )}
              </div>
            )}

            {validationSummary.validRows > 0 &&
              validationSummary.rejectedRows === 0 &&
              validationSummary.duplicateRows === 0 && (
                <p className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  Your CSV passed validation and is ready for
                  DBSCAN trip generation.
                </p>
              )}
          </section>
        )}

        {points.length > 0 && (
          <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Parsed metadata preview
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Showing the first{" "}
                  {Math.min(points.length, 8)} rows from your
                  uploaded CSV.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateAndSaveTrips}
                disabled={saveStatus === "saving"}
                className="rounded-full bg-emerald-500 px-6 py-3 text-center font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveStatus === "saving"
                  ? "Running DBSCAN..."
                  : "Generate trips"}
              </button>
            </div>

            {saveMessage && (
              <p
                className={`mb-5 rounded-2xl border p-4 text-sm ${
                  saveStatus === "error"
                    ? "border-red-300/20 bg-red-400/10 text-red-200"
                    : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                }`}
              >
                {saveMessage}
              </p>
            )}

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/10 text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Filename</th>
                    <th className="px-4 py-3">Latitude</th>
                    <th className="px-4 py-3">
                      Longitude
                    </th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>

                <tbody>
                  {points.slice(0, 8).map((point, index) => (
                    <tr
                      key={`${point.filename}-${point.timestamp}-${index}`}
                      className="border-t border-white/10"
                    >
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
          </section>
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
      <p className="mt-2 text-3xl font-bold text-white">
        {value}
      </p>
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
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
        {icon}
      </div>

      <h3 className="font-bold">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}