import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_FILES = 100;
const photoSchema = z.object({
  filename: z.string().min(1).max(255),
  pathname: z.string().min(1),
  blobUrl: z.string().url(),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive().max(25 * 1024 * 1024),
  checksum: z.string().length(64),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  takenAt: z.string().datetime().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  cameraMake: z.string().max(100).nullable(),
  cameraModel: z.string().max(100).nullable(),
  warning: z.string().max(500).nullable(),
});

const createSchema = z.object({ action: z.literal("create"), originalCount: z.number().int().min(1).max(MAX_FILES) });
const finalizeSchema = z.object({ action: z.literal("finalize"), batchId: z.string().min(1), photos: z.array(photoSchema).min(1).max(MAX_FILES) });

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const create = createSchema.safeParse(body);
  if (create.success) {
    const batch = await prisma.uploadBatch.create({
      data: { ownerId: userId, status: "UPLOADING", originalCount: create.data.originalCount },
    });
    return NextResponse.json({ batchId: batch.id });
  }

  const finalize = finalizeSchema.safeParse(body);
  if (!finalize.success) {
    return NextResponse.json({ error: "Invalid upload request.", details: finalize.error.flatten() }, { status: 400 });
  }

  const batch = await prisma.uploadBatch.findFirst({ where: { id: finalize.data.batchId, ownerId: userId } });
  if (!batch) return NextResponse.json({ error: "Upload batch not found." }, { status: 404 });

  let duplicateCount = 0;
  const saved = [];

  for (const photo of finalize.data.photos) {
    if (!photo.pathname.startsWith(`uploads/${userId}/${batch.id}/`)) {
      return NextResponse.json({ error: "Invalid photo pathname." }, { status: 403 });
    }

    const duplicate = await prisma.photoAsset.findFirst({ where: { ownerId: userId, checksum: photo.checksum }, select: { id: true } });
    if (duplicate) {
      duplicateCount += 1;
      continue;
    }

    const created = await prisma.photoAsset.create({
      data: {
        ownerId: userId,
        uploadBatchId: batch.id,
        filename: photo.filename,
        pathname: photo.pathname,
        blobUrl: photo.blobUrl,
        mimeType: photo.mimeType,
        fileSize: photo.fileSize,
        checksum: photo.checksum,
        latitude: photo.latitude,
        longitude: photo.longitude,
        takenAt: photo.takenAt ? new Date(photo.takenAt) : null,
        width: photo.width,
        height: photo.height,
        cameraMake: photo.cameraMake,
        cameraModel: photo.cameraModel,
        hasGps: photo.latitude !== null && photo.longitude !== null,
        hasTimestamp: photo.takenAt !== null,
        warning: photo.warning,
      },
    });
    saved.push(created);
  }

  const warningCount = saved.filter((photo) => photo.warning).length;
  const usablePhotoCount = saved.filter((photo) => photo.hasGps && photo.hasTimestamp).length;

  await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: usablePhotoCount >= 2 ? "UPLOADED" : "REVIEW_REQUIRED",
      processedCount: saved.length,
      warningCount,
      errorMessage: usablePhotoCount >= 2 ? null : "At least 2 photos with GPS coordinates and timestamps are needed.",
    },
  });

  return NextResponse.json({
    batch: {
      id: batch.id,
      status: usablePhotoCount >= 2 ? "UPLOADED" : "REVIEW_REQUIRED",
      originalCount: batch.originalCount,
      processedCount: saved.length,
      warningCount,
      photos: saved.map((photo) => ({
        id: photo.id,
        filename: photo.filename,
        latitude: photo.latitude,
        longitude: photo.longitude,
        takenAt: photo.takenAt?.toISOString() ?? null,
        hasGps: photo.hasGps,
        hasTimestamp: photo.hasTimestamp,
        warning: photo.warning,
      })),
    },
    duplicateCount,
    usablePhotoCount,
  });
}
