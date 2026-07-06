import exifr from "exifr";

export type ExtractedPhotoMetadata = {
  latitude: number | null;
  longitude: number | null;
  takenAt: Date | null;
  width: number | null;
  height: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  warning: string | null;
};

type AnyMetadata = Record<string, unknown>;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toValidDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Handles EXIF-style dates like "2026:07:06 10:31:22"
    const normalizedExifDate = trimmed.replace(
      /^(\d{4}):(\d{2}):(\d{2})/,
      "$1-$2-$3"
    );

    const date = new Date(normalizedExifDate);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function gpsArrayToDecimal(value: unknown): number | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const degrees = toNumber(value[0]);
  const minutes = toNumber(value[1]);
  const seconds = toNumber(value[2]);

  if (
    degrees === null ||
    minutes === null ||
    seconds === null
  ) {
    return null;
  }

  return degrees + minutes / 60 + seconds / 3600;
}

function getCoordinate(
  metadata: AnyMetadata | undefined,
  decimalKeys: string[],
  arrayKey: string,
  refKey: string,
  negativeRefs: string[]
): number | null {
  if (!metadata) {
    return null;
  }

  for (const key of decimalKeys) {
    const value = toNumber(metadata[key]);

    if (value !== null) {
      return value;
    }
  }

  const decimal = gpsArrayToDecimal(metadata[arrayKey]);

  if (decimal === null) {
    return null;
  }

  const ref = String(metadata[refKey] ?? "").toUpperCase();

  return negativeRefs.includes(ref) ? -decimal : decimal;
}

function getFirstDate(metadata: AnyMetadata | undefined) {
  if (!metadata) {
    return null;
  }

  return (
    toValidDate(metadata.DateTimeOriginal) ??
    toValidDate(metadata.CreateDate) ??
    toValidDate(metadata.ModifyDate) ??
    toValidDate(metadata.DateTimeDigitized) ??
    toValidDate(metadata.SubSecDateTimeOriginal) ??
    toValidDate(metadata.OffsetTimeOriginal) ??
    null
  );
}

export async function extractPhotoMetadata(
  buffer: Buffer
): Promise<ExtractedPhotoMetadata> {
  let metadata: AnyMetadata | undefined;
  let gps:
    | {
        latitude?: number;
        longitude?: number;
      }
    | undefined;

  try {
    const parseOptions: any = {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
    };

    metadata = (await exifr.parse(
      buffer,
      parseOptions
    )) as AnyMetadata | undefined;
  } catch (error) {
    console.warn("exifr.parse failed:", error);
  }

  try {
    gps = await exifr.gps(buffer);
  } catch (error) {
    console.warn("exifr.gps failed:", error);
  }

  const latitude =
    toNumber(gps?.latitude) ??
    getCoordinate(
      metadata,
      ["latitude", "Latitude", "GPSLatitudeDecimal"],
      "GPSLatitude",
      "GPSLatitudeRef",
      ["S"]
    );

  const longitude =
    toNumber(gps?.longitude) ??
    getCoordinate(
      metadata,
      ["longitude", "Longitude", "GPSLongitudeDecimal"],
      "GPSLongitude",
      "GPSLongitudeRef",
      ["W"]
    );

  const takenAt = getFirstDate(metadata);

  const width =
    toNumber(metadata?.ExifImageWidth) ??
    toNumber(metadata?.ImageWidth) ??
    toNumber(metadata?.PixelXDimension) ??
    null;

  const height =
    toNumber(metadata?.ExifImageHeight) ??
    toNumber(metadata?.ImageHeight) ??
    toNumber(metadata?.PixelYDimension) ??
    null;

  const cameraMake =
    typeof metadata?.Make === "string"
      ? metadata.Make.trim()
      : null;

  const cameraModel =
    typeof metadata?.Model === "string"
      ? metadata.Model.trim()
      : null;

  const warnings: string[] = [];

  if (latitude === null || longitude === null) {
    warnings.push("Missing GPS coordinates");
  }

  if (!takenAt) {
    warnings.push("Missing capture timestamp");
  }

  return {
    latitude,
    longitude,
    takenAt,
    width,
    height,
    cameraMake,
    cameraModel,
    warning:
      warnings.length > 0 ? warnings.join(". ") : null,
  };
}