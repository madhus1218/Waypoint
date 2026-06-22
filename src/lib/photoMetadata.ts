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

type ExifResult = {
  latitude?: number;
  longitude?: number;
  DateTimeOriginal?: Date | string;
  CreateDate?: Date | string;
  ModifyDate?: Date | string;
  ImageWidth?: number;
  ImageHeight?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  Make?: string;
  Model?: string;
};

function toValidDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date ? value : new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function extractPhotoMetadata(
  buffer: Buffer
): Promise<ExtractedPhotoMetadata> {
  const metadata = (await exifr.parse(buffer, [
  "latitude",
  "longitude",
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
  "ImageWidth",
  "ImageHeight",
  "ExifImageWidth",
  "ExifImageHeight",
  "Make",
  "Model",
])) as ExifResult | undefined;

  const latitude =
    typeof metadata?.latitude === "number"
      ? metadata.latitude
      : null;

  const longitude =
    typeof metadata?.longitude === "number"
      ? metadata.longitude
      : null;

  const takenAt =
    toValidDate(metadata?.DateTimeOriginal) ??
    toValidDate(metadata?.CreateDate) ??
    toValidDate(metadata?.ModifyDate);

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
    width:
      metadata?.ExifImageWidth ??
      metadata?.ImageWidth ??
      null,
    height:
      metadata?.ExifImageHeight ??
      metadata?.ImageHeight ??
      null,
    cameraMake: metadata?.Make?.trim() || null,
    cameraModel: metadata?.Model?.trim() || null,
    warning:
      warnings.length > 0 ? warnings.join(". ") : null,
  };
}