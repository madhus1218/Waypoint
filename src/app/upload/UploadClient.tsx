"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useUser } from "@clerk/nextjs";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import {
  extractClientPhotoMetadata,
  sha256,
} from "@/lib/clientPhotoMetadata";

type UploadState =
  | "idle"
  | "uploading"
  | "processing"
  | "complete"
  | "error";

type FinalizedPhoto = {
  filename: string;
  pathname: string;
  blobUrl: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  warning: string | null;
};

type UploadResponse = {
  batch: {
    id: string;
    processedCount: number;
    warningCount: number;
  };
  duplicateCount: number;
  usablePhotoCount: number;
};

const MAX_FILE_SIZE =
  25 * 1024 * 1024;

const MAX_FILES = 100;

const ACCEPTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

function isAcceptedPhoto(file: File) {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ?? "";

  return (
    ACCEPTED_EXTENSIONS.has(extension) &&
    (file.type === "" ||
      file.type.startsWith("image/"))
  );
}

function sanitizeFilename(
  filename: string,
) {
  return filename
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "-",
    )
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function formatMegabytes(
  bytes: number,
) {
  return (
    bytes /
    1024 /
    1024
  ).toFixed(1);
}

async function json<T>(
  response: Response,
): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `Server returned an empty response (${response.status}).`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Server returned ${response.status}: ${text
        .replace(/\s+/g, " ")
        .slice(0, 180)}`,
    );
  }
}

export default function UploadClient() {
  const router = useRouter();
  const inputRef =
    useRef<HTMLInputElement>(null);

  const {
    user,
    isLoaded,
    isSignedIn,
  } = useUser();

  const [files, setFiles] =
    useState<File[]>([]);

  const [state, setState] =
    useState<UploadState>("idle");

  const [message, setMessage] =
    useState("");

  const [progress, setProgress] =
    useState(0);

  const isBusy =
    state === "uploading" ||
    state === "processing";

  const totalSize = useMemo(
    () =>
      files.reduce(
        (sum, file) =>
          sum + file.size,
        0,
      ),
    [files],
  );

  function addFiles(
    incoming: File[],
  ) {
    const unsupported =
      incoming.filter(
        (file) =>
          !isAcceptedPhoto(file),
      );

    const oversized =
      incoming.filter(
        (file) =>
          isAcceptedPhoto(file) &&
          file.size >
            MAX_FILE_SIZE,
      );

    const valid =
      incoming.filter(
        (file) =>
          isAcceptedPhoto(file) &&
          file.size <=
            MAX_FILE_SIZE,
      );

    const merged = [
      ...files,
      ...valid,
    ].filter(
      (
        file,
        index,
        all,
      ) =>
        all.findIndex(
          (candidate) =>
            candidate.name ===
              file.name &&
            candidate.size ===
              file.size &&
            candidate.lastModified ===
              file.lastModified,
        ) === index,
    );

    setFiles(
      merged.slice(0, MAX_FILES),
    );

    const warnings: string[] =
      [];

    if (unsupported.length) {
      warnings.push(
        `${unsupported.length} unsupported file${
          unsupported.length === 1
            ? " was"
            : "s were"
        } skipped`,
      );
    }

    if (oversized.length) {
      warnings.push(
        `${oversized.length} file${
          oversized.length === 1
            ? " was"
            : "s were"
        } over 25 MB and skipped`,
      );
    }

    if (
      merged.length >
      MAX_FILES
    ) {
      warnings.push(
        `only the first ${MAX_FILES} photos were kept`,
      );
    }

    setState(
      warnings.length
        ? "error"
        : "idle",
    );

    setMessage(
      warnings.length
        ? `${warnings.join(
            ". ",
          )}.`
        : "",
    );
  }

  function handleInput(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    addFiles(
      Array.from(
        event.target.files ?? [],
      ),
    );

    event.target.value = "";
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    addFiles(
      Array.from(
        event.dataTransfer.files,
      ),
    );
  }

  async function handleUpload() {
    if (
      !isLoaded ||
      !isSignedIn ||
      !user?.id
    ) {
      setState("error");
      setMessage(
        "You must be signed in to upload photos.",
      );
      return;
    }

    if (!files.length) {
      setState("error");
      setMessage(
        "Select at least one photo.",
      );
      return;
    }

    try {
      setState("uploading");
      setProgress(2);
      setMessage(
        "Creating a secure upload batch...",
      );

      const createResponse =
        await fetch(
          "/api/uploads",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action: "create",
              originalCount:
                files.length,
            }),
          },
        );

      const createData =
        await json<{
          batchId?: string;
          error?: string;
        }>(createResponse);

      if (
        !createResponse.ok ||
        !createData.batchId
      ) {
        throw new Error(
          createData.error ??
            "Could not create the upload batch.",
        );
      }

      const uploaded: FinalizedPhoto[] =
        [];

      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        const file =
          files[index];

        setMessage(
          `Reading metadata and uploading ${index + 1} of ${files.length}: ${file.name}`,
        );

        const [
          metadata,
          checksum,
        ] = await Promise.all([
          extractClientPhotoMetadata(
            file,
          ),
          sha256(file),
        ]);

        const pathname =
          `uploads/${user.id}/${createData.batchId}/` +
          sanitizeFilename(
            file.name,
          );

        const blob =
          await upload(
            pathname,
            file,
            {
              access: "private",
              handleUploadUrl:
                "/api/uploads/blob",
              clientPayload:
                JSON.stringify({
                  batchId:
                    createData.batchId,
                }),
              multipart:
                file.size >
                5 *
                  1024 *
                  1024,
            },
          );

        uploaded.push({
          filename: file.name,
          pathname:
            blob.pathname,
          blobUrl: blob.url,
          mimeType:
            file.type ||
            "application/octet-stream",
          fileSize: file.size,
          checksum,
          ...metadata,
        });

        setProgress(
          Math.round(
            ((index + 1) /
              files.length) *
              75,
          ),
        );
      }

      setMessage(
        "Saving metadata...",
      );

      const finalizeResponse =
        await fetch(
          "/api/uploads",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action: "finalize",
              batchId:
                createData.batchId,
              photos: uploaded,
            }),
          },
        );

      const finalized =
        await json<
          UploadResponse & {
            error?: string;
          }
        >(finalizeResponse);

      if (
        !finalizeResponse.ok ||
        !finalized.batch
      ) {
        throw new Error(
          finalized.error ??
            "Could not save uploaded photos.",
        );
      }

      if (
        finalized.usablePhotoCount <
        2
      ) {
        setState("complete");
        setProgress(100);

        setMessage(
          `${finalized.batch.processedCount} photos were saved, but at least 2 need both GPS coordinates and capture timestamps.`,
        );

        return;
      }

      setState("processing");
      setProgress(85);

      setMessage(
        "Detecting trips from GPS and timestamps...",
      );

      const processResponse =
        await fetch(
          `/api/uploads/${finalized.batch.id}/process`,
          {
            method: "POST",
          },
        );

      const processData =
        await json<{
          tripCount?: number;
          error?: string;
        }>(processResponse);

      if (!processResponse.ok) {
        throw new Error(
          processData.error ??
            "Trip detection failed.",
        );
      }

      setState("complete");
      setProgress(100);

      setMessage(
        `Created ${processData.tripCount ?? 0} proposed trips. Opening review...`,
      );

      router.push(
        `/review/${finalized.batch.id}`,
      );
    } catch (error) {
      console.error(error);

      setState("error");

      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed.",
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
      <section className="mx-auto max-w-5xl">
        <nav className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
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
            Upload your travel
            photos.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Waypoint reads GPS
            coordinates and capture
            times in your browser,
            then stores each photo
            privately.
          </p>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div
            onDragOver={(event) =>
              event.preventDefault()
            }
            onDrop={handleDrop}
            onClick={() =>
              !isBusy &&
              inputRef.current?.click()
            }
            className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-emerald-400/30 bg-emerald-400/5 p-8 text-center hover:border-emerald-300"
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp"
              onChange={
                handleInput
              }
              disabled={isBusy}
              className="hidden"
            />

            <Upload className="mb-4 h-10 w-10 text-emerald-300" />

            <h2 className="text-2xl font-bold">
              Drop photos here
            </h2>

            <p className="mt-3 text-sm text-slate-400">
              Up to {MAX_FILES}{" "}
              photos, 25 MB each.
              Photos upload directly
              to private Vercel Blob
              storage.
            </p>
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Selected photos
                  </h2>

                  <p className="text-sm text-slate-400">
                    {files.length}{" "}
                    photos ·{" "}
                    {formatMegabytes(
                      totalSize,
                    )}{" "}
                    MB total
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setFiles([])
                  }
                  disabled={isBusy}
                  className="text-sm text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {files.map(
                  (
                    file,
                    index,
                  ) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {
                            file.name
                          }
                        </p>

                        <p className="text-xs text-slate-500">
                          {formatMegabytes(
                            file.size,
                          )}{" "}
                          MB
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setFiles(
                            (
                              current,
                            ) =>
                              current.filter(
                                (
                                  _,
                                  currentIndex,
                                ) =>
                                  currentIndex !==
                                  index,
                              ),
                          )
                        }
                        disabled={
                          isBusy
                        }
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-4 w-4 text-slate-400" />
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {message && (
            <div
              className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 ${
                state === "error"
                  ? "border-red-400/20 bg-red-400/10 text-red-200"
                  : state ===
                      "complete"
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              {state ===
              "error" ? (
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              ) : state ===
                "complete" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <LoaderCircle
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    isBusy
                      ? "animate-spin"
                      : ""
                  }`}
                />
              )}

              <p className="text-sm">
                {message}
              </p>
            </div>
          )}

          {isBusy && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={
              isBusy ||
              files.length === 0
            }
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}

            {state ===
            "processing"
              ? "Detecting trips..."
              : state ===
                  "uploading"
                ? "Uploading photos..."
                : "Upload and process photos"}
          </button>
        </section>
      </section>
    </main>
  );
}