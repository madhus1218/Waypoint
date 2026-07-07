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
    const cleaned = value.trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Handles rational-style metadata objects like { numerator: 40, denominator: 1 }
  if (
    value &&
    typeof value === "object" &&
    "numerator" in value &&
    "denominator" in value
  ) {
    const rational = value as {
      numerator?: unknown;
      denominator?: unknown;
    };

    const numerator = toNumber(rational.numerator);
    const denominator = toNumber(rational.denominator);

    if (numerator !== null && denominator !== null && denominator !== 0) {
      return numerator / denominator;
    }
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

    if (!trimmed) {
      return null;
    }

    // Handles EXIF dates like "2026:07:06 10:31:22"
    const normalizedExifDate = trimmed.replace(
      /^(\d{4}):(\d{2}):(\d{2})/,
      "$1-$2-$3",
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

  if (degrees === null || minutes === null || seconds === null) {
    return null;
  }

  return degrees + minutes / 60 + seconds / 3600;
}

function gpsTimeArrayToString(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const hours = toNumber(value[0]);
  const minutes = toNumber(value[1]);
  const seconds = toNumber(value[2]);

  if (hours === null || minutes === null || seconds === null) {
    return null;
  }

  const hh = String(Math.floor(hours)).padStart(2, "0");
  const mm = String(Math.floor(minutes)).padStart(2, "0");
  const ss = String(Math.floor(seconds)).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function getMetadataValue(metadata: AnyMetadata | undefined, keys: string[]) {
  if (!metadata) {
    return undefined;
  }

  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== null) {
      return metadata[key];
    }
  }

  return undefined;
}

function getCoordinate(
  metadata: AnyMetadata | undefined,
  decimalKeys: string[],
  arrayKeys: string[],
  refKeys: string[],
  negativeRefs: string[],
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

  for (const arrayKey of arrayKeys) {
    const decimal = gpsArrayToDecimal(metadata[arrayKey]);

    if (decimal === null) {
      continue;
    }

    const refValue = getMetadataValue(metadata, refKeys);
    const ref = String(refValue ?? "").toUpperCase();

    return negativeRefs.includes(ref) ? -decimal : decimal;
  }

  return null;
}

function getDateFromGps(metadata: AnyMetadata | undefined): Date | null {
  if (!metadata) {
    return null;
  }

  const dateStamp = getMetadataValue(metadata, [
    "GPSDateStamp",
    "gpsDateStamp",
    "GPSDate",
  ]);

  const timeStamp = getMetadataValue(metadata, [
    "GPSTimeStamp",
    "gpsTimeStamp",
    "GPSTime",
  ]);

  if (!dateStamp) {
    return null;
  }

  const datePart = String(dateStamp)
    .trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2})$/, "$1-$2-$3");

  const timePart = gpsTimeArrayToString(timeStamp) ?? "00:00:00";

  const date = new Date(`${datePart}T${timePart}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getFirstDate(metadata: AnyMetadata | undefined) {
  if (!metadata) {
    return null;
  }

  return (
    toValidDate(metadata.DateTimeOriginal) ??
    toValidDate(metadata.dateTimeOriginal) ??
    toValidDate(metadata.CreateDate) ??
    toValidDate(metadata.createDate) ??
    toValidDate(metadata.ModifyDate) ??
    toValidDate(metadata.modifyDate) ??
    toValidDate(metadata.DateTimeDigitized) ??
    toValidDate(metadata.dateTimeDigitized) ??
    toValidDate(metadata.SubSecDateTimeOriginal) ??
    toValidDate(metadata.subSecDateTimeOriginal) ??
    toValidDate(metadata.MediaCreateDate) ??
    toValidDate(metadata.mediaCreateDate) ??
    toValidDate(metadata.CreationDate) ??
    toValidDate(metadata.creationDate) ??
    toValidDate(metadata.DateCreated) ??
    toValidDate(metadata.dateCreated) ??
    getDateFromGps(metadata) ??
    null
  );
}

function normalizeCoordinate(value: number | null, min: number, max: number) {
  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
}

export async function extractPhotoMetadata(
  buffer: Buffer,
): Promise<ExtractedPhotoMetadata> {
  let metadata: AnyMetadata | undefined;
  let gps:
    | {
        latitude?: number;
        longitude?: number;
      }
    | undefined;

  const input = new Uint8Array(buffer);

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
      icc: false,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,

      // Important for real iPhone photos.
      heic: true,
    } as any)) as AnyMetadata | undefined;
  } catch (error) {
    console.warn("exifr.parse failed:", error);
  }

  try {
    gps = await exifr.gps(input);
  } catch (error) {
    console.warn("exifr.gps failed:", error);
  }

  const rawLatitude =
    toNumber(gps?.latitude) ??
    getCoordinate(
      metadata,
      [
        "latitude",
        "Latitude",
        "GPSLatitudeDecimal",
        "gpsLatitudeDecimal",
      ],
      ["GPSLatitude", "gpsLatitude"],
      ["GPSLatitudeRef", "gpsLatitudeRef"],
      ["S"],
    );

  const rawLongitude =
    toNumber(gps?.longitude) ??
    getCoordinate(
      metadata,
      [
        "longitude",
        "Longitude",
        "GPSLongitudeDecimal",
        "gpsLongitudeDecimal",
      ],
      ["GPSLongitude", "gpsLongitude"],
      ["GPSLongitudeRef", "gpsLongitudeRef"],
      ["W"],
    );

  const latitude = normalizeCoordinate(rawLatitude, -90, 90);
  const longitude = normalizeCoordinate(rawLongitude, -180, 180);

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
      : typeof metadata?.make === "string"
        ? metadata.make.trim()
        : null;

  const cameraModel =
    typeof metadata?.Model === "string"
      ? metadata.Model.trim()
      : typeof metadata?.model === "string"
        ? metadata.model.trim()
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
    warning: warnings.length > 0 ? warnings.join(". ") : null,
  };
}