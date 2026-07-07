import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { extractPhotoMetadata } from "@/lib/photoMetadata";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 100;

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function isAcceptedPhoto(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return (
    ALLOWED_CONTENT_TYPES.has(file.type) ||
    (extension !== undefined && ALLOWED_EXTENSIONS.has(extension))
  );
}

function serializePhoto(photo: {
  id: string;
  filename: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: Date | null;
  hasGps: boolean;
  hasTimestamp: boolean;
  warning: string | null;
}) {
  return {
    ...photo,
    takenAt: photo.takenAt?.toISOString() ?? null,
  };
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Upload photos as multipart/form-data with one or more files named `files`.",
        },
        {
          status: 400,
        },
      );
    }

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        {
          error: "Select at least one photo.",
        },
        {
          status: 400,
        },
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        {
          error: `You can upload up to ${MAX_FILES} photos at a time.`,
        },
        {
          status: 400,
        },
      );
    }

    const invalidFile = files.find((file) => !isAcceptedPhoto(file));

    if (invalidFile) {
      return NextResponse.json(
        {
          error: `Unsupported file type for ${invalidFile.name}. Upload JPG, PNG, WEBP, HEIC, or HEIF photos.`,
        },
        {
          status: 400,
        },
      );
    }

    const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE);

    if (oversizedFile) {
      return NextResponse.json(
        {
          error: `${oversizedFile.name} is larger than the 25 MB upload limit.`,
        },
        {
          status: 400,
        },
      );
    }

    const uploadBatch = await prisma.uploadBatch.create({
      data: {
        ownerId: userId,
        status: "PROCESSING",
        originalCount: files.length,
      },
    });

    let processedCount = 0;
    let warningCount = 0;
    let duplicateCount = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const buffer = Buffer.from(await file.arrayBuffer());

        const checksum = createHash("sha256").update(buffer).digest("hex");

        const existingPhoto = await prisma.photoAsset.findFirst({
          where: {
            ownerId: userId,
            checksum,
          },
          select: {
            id: true,
          },
        });

        if (existingPhoto) {
          duplicateCount += 1;
          continue;
        }

        let metadata;

        try {
          metadata = await extractPhotoMetadata(buffer);
        } catch (metadataError) {
          console.warn(`Could not extract EXIF from ${file.name}:`, metadataError);

          metadata = {
            latitude: null,
            longitude: null,
            takenAt: null,
            width: null,
            height: null,
            cameraMake: null,
            cameraModel: null,
            warning: "Could not read photo metadata",
          };
        }

        if (metadata.warning) {
          warningCount += 1;
        }

        await prisma.photoAsset.create({
          data: {
            ownerId: userId,
            uploadBatchId: uploadBatch.id,
            filename: file.name,
            pathname: `metadata-only/${userId}/${uploadBatch.id}/${index}-${sanitizeFilename(file.name)}`,
            blobUrl: "metadata-only",
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            checksum,
            latitude: metadata.latitude,
            longitude: metadata.longitude,
            takenAt: metadata.takenAt,
            width: metadata.width,
            height: metadata.height,
            cameraMake: metadata.cameraMake,
            cameraModel: metadata.cameraModel,
            hasGps: metadata.latitude !== null && metadata.longitude !== null,
            hasTimestamp: metadata.takenAt !== null,
            warning: metadata.warning,
          },
        });

        processedCount += 1;

        await prisma.uploadBatch.update({
          where: {
            id: uploadBatch.id,
          },
          data: {
            processedCount,
            warningCount,
          },
        });
      }

      const usablePhotoCount = await prisma.photoAsset.count({
        where: {
          uploadBatchId: uploadBatch.id,
          hasGps: true,
          hasTimestamp: true,
        },
      });

      const finalBatch = await prisma.uploadBatch.update({
        where: {
          id: uploadBatch.id,
        },
        data: {
          processedCount,
          warningCount,
          status: usablePhotoCount >= 2 ? "UPLOADED" : "REVIEW_REQUIRED",
        },
        include: {
          photos: {
            orderBy: {
              takenAt: "asc",
            },
            select: {
              id: true,
              filename: true,
              latitude: true,
              longitude: true,
              takenAt: true,
              hasGps: true,
              hasTimestamp: true,
              warning: true,
            },
          },
        },
      });

      return NextResponse.json({
        batch: {
          ...finalBatch,
          photos: finalBatch.photos.map(serializePhoto),
        },
        duplicateCount,
        usablePhotoCount,
      });
    } catch (processingError) {
      await prisma.uploadBatch.update({
        where: {
          id: uploadBatch.id,
        },
        data: {
          status: "FAILED",
          errorMessage:
            processingError instanceof Error
              ? processingError.message
              : "Photo processing failed.",
        },
      });

      throw processingError;
    }
  } catch (error) {
    console.error("Photo processing failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process uploaded photos.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const batches = await prisma.uploadBatch.findMany({
    where: {
      ownerId: userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          photos: true,
        },
      },
    },
  });

  return NextResponse.json({
    batches,
  });
}