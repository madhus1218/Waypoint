import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getLocationDetails } from "@/lib/tripLocations";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };
type ClusterPoint = { id: string; filename: string; latitude: number; longitude: number; timestamp: string };
type PythonCluster = { clusterId: string; points: ClusterPoint[]; centerLat: number; centerLng: number; startTimestamp: string; endTimestamp: string };
type RefinedTrip = { sourceClusterIds: string[]; title: string; city: string | null; country: string | null; summary: string; boundaryReason: string; points: ClusterPoint[]; startTimestamp: string; endTimestamp: string; confidence: "High" | "Medium" | "Low" };

function confidenceValue(value: RefinedTrip["confidence"]) {
  return value === "High" ? 0.9 : value === "Medium" ? 0.7 : 0.55;
}

async function parseJson(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`Service returned ${response.status}: ${text.slice(0, 180)}`); }
}

export async function POST(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: uploadBatchId } = await context.params;

  try {
    const batch = await prisma.uploadBatch.findFirst({
      where: { id: uploadBatchId, ownerId: userId },
      include: { photos: { where: { hasGps: true, hasTimestamp: true, latitude: { not: null }, longitude: { not: null }, takenAt: { not: null } }, orderBy: { takenAt: "asc" } } },
    });
    if (!batch) return NextResponse.json({ error: "Upload batch not found." }, { status: 404 });
    if (batch.photos.length < 2) return NextResponse.json({ error: "At least 2 photos with GPS and timestamps are required." }, { status: 400 });

    await prisma.$transaction([
      prisma.trip.deleteMany({ where: { ownerId: userId, uploadBatchId, status: "PROPOSED" } }),
      prisma.photoAsset.updateMany({ where: { ownerId: userId, uploadBatchId }, data: { tripId: null } }),
      prisma.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: "PROCESSING", errorMessage: null } }),
    ]);

    const points: ClusterPoint[] = batch.photos.map((photo) => ({
      id: photo.id,
      filename: photo.filename,
      latitude: photo.latitude!,
      longitude: photo.longitude!,
      timestamp: photo.takenAt!.toISOString(),
    }));

    const origin = new URL(request.url).origin;
    const clusterResponse = await fetch(`${origin}/api/cluster`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ points, epsilonMiles: 75, minPoints: 2, maxGapHours: 168 }),
      cache: "no-store",
    });
    const clusterData = await parseJson(clusterResponse);
    if (!clusterResponse.ok) throw new Error(String(clusterData.error ?? "Python clustering failed."));
    const clusters = (clusterData.clusters ?? []) as PythonCluster[];

    if (!clusters.length) {
      await prisma.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: "REVIEW_REQUIRED", errorMessage: "No automatic trips matched the distance and time rules." } });
      return NextResponse.json({ tripCount: 0, clusteringEngine: clusterData.engine, refinedWithGpt: false });
    }

    const gptInput = clusters.map((cluster, index) => {
      const location = getLocationDetails(cluster.centerLat, cluster.centerLng);
      return {
        clusterId: cluster.clusterId,
        title: location.title === "Unnamed Travel Stop" ? `Trip ${index + 1}` : location.title,
        city: location.city,
        country: location.country,
        confidence: cluster.points.length >= 5 ? "High" : cluster.points.length >= 3 ? "Medium" : "Low",
        startTimestamp: cluster.startTimestamp,
        endTimestamp: cluster.endTimestamp,
        insight: `Detected from ${cluster.points.length} timestamped GPS photos using Python scikit-learn DBSCAN.`,
        points: cluster.points,
      };
    });

    const refineResponse = await fetch(`${origin}/api/refine-trips`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trips: gptInput }),
      cache: "no-store",
    });
    const refineData = await parseJson(refineResponse);
    if (!refineResponse.ok) throw new Error(String(refineData.error ?? "GPT refinement failed."));
    const refinedTrips = (refineData.trips ?? []) as RefinedTrip[];

    for (const refined of refinedTrips) {
      const centerLat = refined.points.reduce((sum, p) => sum + p.latitude, 0) / refined.points.length;
      const centerLng = refined.points.reduce((sum, p) => sum + p.longitude, 0) / refined.points.length;
      const trip = await prisma.trip.create({
        data: {
          ownerId: userId,
          uploadBatchId,
          title: refined.title,
          city: refined.city,
          country: refined.country,
          notes: `${refined.summary}\n\nBoundary decision: ${refined.boundaryReason}`,
          status: "PROPOSED",
          startDate: new Date(refined.startTimestamp),
          endDate: new Date(refined.endTimestamp),
          centerLat,
          centerLng,
          confidence: confidenceValue(refined.confidence),
          photoPoints: { createMany: { data: refined.points.map((p) => ({ filename: p.filename, latitude: p.latitude, longitude: p.longitude, takenAt: new Date(p.timestamp) })) } },
        },
      });
      await prisma.photoAsset.updateMany({ where: { id: { in: refined.points.map((p) => p.id) }, ownerId: userId, uploadBatchId }, data: { tripId: trip.id } });
    }

    await prisma.uploadBatch.update({ where: { id: uploadBatchId }, data: { status: "REVIEW_REQUIRED", errorMessage: null } });
    return NextResponse.json({ tripCount: refinedTrips.length, clusteringEngine: clusterData.engine, refinedWithGpt: Boolean(refineData.refinedWithGpt), warning: refineData.warning ?? null });
  } catch (error) {
    console.error("Trip processing failed:", error);
    await prisma.uploadBatch.updateMany({ where: { id: uploadBatchId, ownerId: userId }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Trip processing failed." } });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trip processing failed." }, { status: 500 });
  }
}
