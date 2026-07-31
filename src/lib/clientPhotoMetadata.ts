import exifr from "exifr";

export type ClientPhotoMetadata = {
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  warning: string | null;
};

type Metadata = Record<string, unknown>;

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = typeof value === "string"
    ? value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")
    : value;
  const result = new Date(normalized);
  return Number.isNaN(result.getTime()) ? null : result;
}

function firstDate(metadata: Metadata | undefined): Date | null {
  if (!metadata) return null;
  const keys = [
    "DateTimeOriginal", "SubSecDateTimeOriginal", "CreateDate",
    "DateTimeDigitized", "MediaCreateDate", "CreationDate",
    "DateCreated", "ModifyDate",
  ];
  for (const key of keys) {
    const value = dateValue(metadata[key]);
    if (value) return value;
  }
  return null;
}

export async function extractClientPhotoMetadata(file: File): Promise<ClientPhotoMetadata> {
  const input = await file.arrayBuffer();
  let metadata: Metadata | undefined;
  let gps: { latitude?: number; longitude?: number } | undefined;

  try {
    metadata = (await exifr.parse(input, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      jfif: true,
      ihdr: true,
      iptc: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
      heic: true,
    } as never)) as Metadata | undefined;
  } catch (error) {
    console.warn(`Could not parse metadata for ${file.name}`, error);
  }

  try {
    gps = await exifr.gps(input);
  } catch (error) {
    console.warn(`Could not parse GPS for ${file.name}`, error);
  }

  const latitude = numberValue(gps?.latitude) ?? numberValue(metadata?.latitude);
  const longitude = numberValue(gps?.longitude) ?? numberValue(metadata?.longitude);
  const validLatitude = latitude !== null && latitude >= -90 && latitude <= 90 ? latitude : null;
  const validLongitude = longitude !== null && longitude >= -180 && longitude <= 180 ? longitude : null;
  const takenAt = firstDate(metadata);

  const warnings: string[] = [];
  if (validLatitude === null || validLongitude === null) warnings.push("Missing GPS coordinates");
  if (!takenAt) warnings.push("Missing capture timestamp");

  return {
    latitude: validLatitude,
    longitude: validLongitude,
    takenAt: takenAt?.toISOString() ?? null,
    width: numberValue(metadata?.ExifImageWidth) ?? numberValue(metadata?.ImageWidth),
    height: numberValue(metadata?.ExifImageHeight) ?? numberValue(metadata?.ImageHeight),
    cameraMake: typeof metadata?.Make === "string" ? metadata.Make.trim() : null,
    cameraModel: typeof metadata?.Model === "string" ? metadata.Model.trim() : null,
    warning: warnings.length ? warnings.join(". ") : null,
  };
}

export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
