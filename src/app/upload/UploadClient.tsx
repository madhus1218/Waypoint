"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileImage,
  ImagePlus,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

type UploadState =
  | "idle"
  | "uploading"
  | "processing"
  | "complete"
  | "error";

type ProcessedPhoto = {
  id: string;
  filename: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  hasGps: boolean;
  hasTimestamp: boolean;
  warning: string | null;
};

type UploadResponse = {
  batch: {
    id: string;
    status: string;
    originalCount: number;
    processedCount: number;
    warningCount: number;
    photos: ProcessedPhoto[];
  };
  duplicateCount: number;
  usablePhotoCount: number;
};

type UploadedBlob = {
  url: string;
  downloadUrl?: string;
  pathname: string;
  contentType?: string;
  contentDisposition?: string;
  originalName: string;
  size: number;
};

type BlobUploadResponse = {
  blob?: {
    url: string;
    downloadUrl?: string;
    pathname: string;
    contentType?: string;
    contentDisposition?: string;
  };
  error?: string;
};

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 100;
const UPLOAD_TIMEOUT_MS = 180_000;
const PROCESSING_TIMEOUT_MS = 180_000;

function isAcceptedPhoto(file: File) {
  const extension = file.name
    .split(".")
    .pop()
    ?.toLowerCase();

  return (
    ACCEPTED_TYPES.includes(file.type) ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "png" ||
    extension === "heic" ||
    extension === "heif" ||
    extension === "webp"
  );
}

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

function formatMegabytes(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1);
}

async function readJsonResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    throw new Error(
      `${fallbackMessage} The server returned an empty response.`
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    const preview = responseText
      .replace(/\s+/g, " ")
      .slice(0, 200);

    throw new Error(
      `${fallbackMessage} Server returned ${response.status}: ${preview}`
    );
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function UploadClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, isLoaded, isSignedIn } = useUser();

  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] =
    useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] =
    useState<UploadResponse | null>(null);

  const isBusy =
    state === "uploading" ||
    state === "processing";

  const totalSize = useMemo(
    () =>
      files.reduce(
        (sum, file) => sum + file.size,
        0
      ),
    [files]
  );

  function addFiles(incomingFiles: File[]) {
    setMessage("");
    setResult(null);
    setState("idle");

    const unsupportedFiles =
      incomingFiles.filter(
        (file) => !isAcceptedPhoto(file)
      );

    const oversizedFiles =
      incomingFiles.filter(
        (file) =>
          isAcceptedPhoto(file) &&
          file.size > MAX_FILE_SIZE
      );

    const validFiles =
      incomingFiles.filter(
        (file) =>
          isAcceptedPhoto(file) &&
          file.size <= MAX_FILE_SIZE
      );

    const uniqueFiles = [
      ...files,
      ...validFiles,
    ].filter((file, index, allFiles) => {
      return (
        allFiles.findIndex(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified ===
              file.lastModified
        ) === index
      );
    });

    if (uniqueFiles.length > MAX_FILES) {
      setFiles(
        uniqueFiles.slice(0, MAX_FILES)
      );
      setState("error");
      setMessage(
        `You can upload up to ${MAX_FILES} photos at a time.`
      );
      return;
    }

    setFiles(uniqueFiles);

    const warnings: string[] = [];

    if (unsupportedFiles.length > 0) {
      warnings.push(
        `${unsupportedFiles.length} unsupported file${
          unsupportedFiles.length === 1
            ? " was"
            : "s were"
        } skipped`
      );
    }

    if (oversizedFiles.length > 0) {
      warnings.push(
        `${oversizedFiles.length} file${
          oversizedFiles.length === 1
            ? " was"
            : "s were"
        } skipped because the current upload limit is 25 MB per photo`
      );
    }

    if (warnings.length > 0) {
      setState("error");
      setMessage(`${warnings.join(". ")}.`);
    }
  }

  function handleFileInput(
    event: ChangeEvent<HTMLInputElement>
  ) {
    addFiles(
      Array.from(event.target.files ?? [])
    );

    event.target.value = "";
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    addFiles(
      Array.from(event.dataTransfer.files)
    );
  }

  function removeFile(index: number) {
    setFiles((currentFiles) =>
      currentFiles.filter(
        (_, currentIndex) =>
          currentIndex !== index
      )
    );
  }

  async function handleUpload() {
    if (!isLoaded) {
      setState("error");
      setMessage("Authentication is still loading. Try again in a second.");
      return;
    }

    if (!isSignedIn || !user?.id) {
      setState("error");
      setMessage("You must be signed in to upload photos.");
      return;
    }

    if (files.length === 0) {
      setState("error");
      setMessage("Select at least one photo.");
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > MAX_FILE_SIZE
    );

    if (oversizedFile) {
      setState("error");
      setMessage(
        `${oversizedFile.name} is larger than the current 25 MB upload limit.`
      );
      return;
    }

    try {
      setState("uploading");
      setProgress(10);
      setResult(null);
      setMessage(
        `Uploading and reading metadata from ${files.length} photo${
          files.length === 1 ? "" : "s"
        }...`
      );

      const formData = new FormData();

      for (const file of files) {
        formData.append("files", file, file.name);
      }

      const response = await fetchWithTimeout(
        "/api/uploads",
        {
          method: "POST",
          body: formData,
        },
        PROCESSING_TIMEOUT_MS,
        "Photo upload and metadata extraction timed out. Try uploading fewer photos at once."
      );

      setProgress(65);

      const data = await readJsonResponse<
        | UploadResponse
        | { error?: string }
      >(
        response,
        "Photo upload failed."
      );

      if (!response.ok || !("batch" in data)) {
        const errorMessage =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Photo upload failed.";

        throw new Error(errorMessage);
      }

      setResult(data);

      if (data.usablePhotoCount < 2) {
        setState("complete");
        setProgress(100);
        setMessage(
          `${data.batch.processedCount} photo${
            data.batch.processedCount === 1 ? " was" : "s were"
          } saved, but at least 2 photos with both GPS coordinates and timestamps are needed to detect trips.`
        );
        return;
      }

      setState("processing");
      setProgress(80);
      setMessage("Running DBSCAN trip detection...");

      const processingResponse = await fetchWithTimeout(
        `/api/uploads/${data.batch.id}/process`,
        {
          method: "POST",
        },
        PROCESSING_TIMEOUT_MS,
        "Trip detection timed out. Try processing fewer photos at once."
      );

      const processingData = await readJsonResponse<{
        tripCount?: number;
        error?: string;
      }>(
        processingResponse,
        "Server-side trip processing failed."
      );

      if (!processingResponse.ok) {
        throw new Error(
          processingData.error || "Server-side trip processing failed."
        );
      }

      const tripCount = processingData.tripCount ?? 0;

      setState("complete");
      setProgress(100);
      setMessage(
        `Created ${tripCount} proposed trip${
          tripCount === 1 ? "" : "s"
        }. Opening trip review...`
      );

      router.push(`/review/${data.batch.id}`);
    } catch (error) {
      console.error("Photo upload failed:", error);

      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Could not upload photos."
      );
    }
  }

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] text-white">
        <LoaderCircle className="h-8 w-8 animate-spin text-emerald-400" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07130f] px-5 py-8 text-white sm:px-6">
      <section className="mx-auto max-w-6xl">
        <nav className="mb-12 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <p className="text-sm text-slate-400">
            Signed in as{" "}
            <span className="text-slate-200">
              {
                user
                  ?.primaryEmailAddress
                  ?.emailAddress
              }
            </span>
          </p>
        </nav>

        <header className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-300">
            <ImagePlus className="h-7 w-7" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Upload your travel photos.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Waypoint securely reads each
            photo&apos;s GPS coordinates and
            capture time to reconstruct your
            travel history.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div
              onDragOver={(event) =>
                event.preventDefault()
              }
              onDrop={handleDrop}
              onClick={() => {
                if (!isBusy) {
                  inputRef.current?.click();
                }
              }}
              className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-emerald-400/30 bg-emerald-400/5 p-8 text-center transition hover:border-emerald-300 hover:bg-emerald-400/10"
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp"
                onChange={handleFileInput}
                disabled={isBusy}
                className="hidden"
              />

              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500 text-white">
                <Upload className="h-8 w-8" />
              </div>

              <h2 className="text-2xl font-bold">
                Drop photos here
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                Select up to {MAX_FILES} JPEG,
                PNG, HEIC, or WebP photos. The
                current server-upload limit is
                4 MB per photo.
              </p>

              <span className="mt-7 rounded-full bg-emerald-500 px-7 py-3 font-semibold text-white">
                Choose photos
              </span>
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">
                      Selected photos
                    </h2>

                    <p className="mt-1 text-sm text-slate-400">
                      {files.length} photo
                      {files.length === 1
                        ? ""
                        : "s"}{" "}
                      ·{" "}
                      {formatMegabytes(
                        totalSize
                      )}{" "}
                      MB
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setMessage("");
                      setResult(null);
                      setState("idle");
                      setProgress(0);
                    }}
                    disabled={isBusy}
                    className="text-sm font-medium text-slate-400 hover:text-white disabled:opacity-50"
                  >
                    Clear all
                  </button>
                </div>

                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {files.map(
                    (file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
                      >
                        <FileImage className="h-5 w-5 shrink-0 text-emerald-300" />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-200">
                            {file.name}
                          </p>

                          <p className="text-xs text-slate-500">
                            {formatMegabytes(
                              file.size
                            )}{" "}
                            MB
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeFile(index)
                          }
                          disabled={isBusy}
                          className="rounded-full p-1 text-slate-500 hover:bg-white/10 hover:text-white disabled:opacity-50"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isBusy}
                  className="mt-6 w-full rounded-full bg-emerald-500 px-6 py-3.5 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {state === "uploading"
                    ? `Uploading ${progress}%`
                    : state === "processing"
                      ? "Processing photos..."
                      : "Upload and process photos"}
                </button>
              </div>
            )}

            {message && (
              <div
                className={`mt-6 rounded-2xl border p-4 text-sm ${
                  state === "error"
                    ? "border-red-300/20 bg-red-400/10 text-red-200"
                    : state === "complete"
                      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                      : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  {state === "error" ? (
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : state ===
                    "complete" ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : (
                    <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                  )}

                  <p>{message}</p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <InfoCard
              icon={
                <ShieldCheck className="h-5 w-5" />
              }
              title="Private by default"
              description="Your photos are stored privately and associated with your signed-in account."
            />

            <InfoCard
              icon={
                <MapPin className="h-5 w-5" />
              }
              title="Automatic metadata"
              description="Waypoint extracts GPS coordinates, capture dates, image dimensions, and available camera details."
            />

            <InfoCard
              icon={
                <FileImage className="h-5 w-5" />
              }
              title="Missing metadata"
              description="Photos without GPS coordinates or timestamps remain saved and appear in the review workflow."
            />
          </aside>
        </div>

        {result && (
          <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm font-medium text-emerald-200">
              Upload complete
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Photo processing summary
            </h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Selected"
                value={
                  result.batch.originalCount
                }
              />

              <Stat
                label="Saved"
                value={
                  result.batch.processedCount
                }
              />

              <Stat
                label="Ready for trips"
                value={
                  result.usablePhotoCount
                }
              />

              <Stat
                label="Duplicates"
                value={
                  result.duplicateCount
                }
              />
            </div>

            {result.batch.warningCount >
              0 && (
              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                {result.batch.warningCount}{" "}
                photo
                {result.batch.warningCount ===
                1
                  ? ""
                  : "s"}{" "}
                need review because GPS
                coordinates or timestamps are
                missing.
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold">
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

      <h3 className="font-bold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}