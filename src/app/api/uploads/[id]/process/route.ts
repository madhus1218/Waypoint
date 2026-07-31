import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { type GeoPoint, inferTripsWithDbscan } from "@/lib/dbscan";
import { prisma } from "@/lib/prisma";
import { getLocationDetails } from "@/lib/tripLocations";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

function confidenceForPhotoCount(count: number) {
  if (count >= 8) return 0.95;
  if (count >= 5) return 0.85;
  if (count >= 3) return 0.7;
  return 0.55;
}

export async function POST(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: uploadBatchId } = await context.params;

  try {
    const batch = await prisma.uploadBatch.findFirst({
      where: { id: uploadBatchId, ownerId: userId },
      include: {
        photos: {
          where: { hasGps: true, hasTimestamp: true, latitude: { not: null }, longitude: { not: null }, takenAt: { not: null } },
          orderBy: { takenAt: "asc" },
        },
      },
    });
    if (!batch) return NextResponse.json({ error: "Upload batch not found." }, { status: 404 });
    if (batch.photos.length < 2) return NextResponse.json({ error: "At least 2 usable photos are required.", tripCount: 0 }, { status: 400 });

    await prisma.$transaction([
      prisma.trip.deleteMany({ where: { ownerId: userId, uploadBatchId, status: "PROPOSED" } }),
      prisma.photoAsset.updateMany({ where: { ownerId: userId, uploadBatchId }, data: { tripId: null } }),
      prisma.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: "PROCESSING", errorMessage: null } }),
    ]);

    const points: GeoPoint[] = batch.photos.map((photo) => ({
      latitude: photo.latitude as number,
      longitude: photo.longitude as number,
      timestamp: (photo.takenAt as Date).toISOString(),
      filename: photo.id,
    }));

    const clusters = inferTripsWithDbscan(points, { epsilonMiles: 50, minPoints: 2, maxTimeGapHours: 72 });
    if (!clusters.length) {
      await prisma.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: "REVIEW_REQUIRED", errorMessage: "No trips could be detected." } });
      return NextResponse.json({ tripCount: 0 });
    }

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      const location = getLocationDetails(cluster.latitude, cluster.longitude);
      const photoIds = cluster.points.map((point) => point.filename).filter((id): id is string => Boolean(id));
      const trip = await prisma.trip.create({
        data: {
          ownerId: userId,
          uploadBatchId,
          title: location.title === "Unnamed Travel Stop" ? `Trip ${index + 1}` : location.title,
          city: location.city,
          country: location.country,
          notes: "Generated from uploaded photo GPS coordinates and timestamps.",
          status: "PROPOSED",
          startDate: new Date(cluster.startDate),
          endDate: new Date(cluster.endDate),
          centerLat: cluster.latitude,
          centerLng: cluster.longitude,
          confidence: confidenceForPhotoCount(cluster.points.length),
          photoPoints: {
            createMany: {
              data: cluster.points.map((point) => ({
                filename: point.filename,
                latitude: point.latitude,
                longitude: point.longitude,
                takenAt: new Date(point.timestamp),
              })),
            },
          },
        },
      });
      await prisma.photoAsset.updateMany({ where: { id: { in: photoIds }, ownerId: userId, uploadBatchId }, data: { tripId: trip.id } });
    }

    await prisma.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: "REVIEW_REQUIRED", errorMessage: null } });
    return NextResponse.json({ tripCount: clusters.length });
  } catch (error) {
    console.error("Trip processing failed:", error);
    await prisma.uploadBatch.updateMany({ where: { id: uploadBatchId, ownerId: userId }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Trip processing failed." } });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trip processing failed." }, { status: 500 });
  }
}
