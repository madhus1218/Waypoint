import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { inferTripsWithDbscan } from "@/lib/dbscan";
import { prisma } from "@/lib/prisma";
import { getLocationDetails } from "@/lib/tripLocations";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ClusterPoint = {
  id: string;
  filename: string;
  latitude: number;
  longitude: number;
  timestamp: string;
};

type PythonCluster = {
  clusterId: string;
  points: ClusterPoint[];
  centerLat: number;
  centerLng: number;
  startTimestamp: string;
  endTimestamp: string;
};

type RefinedTrip = {
  sourceClusterIds: string[];
  title: string;
  city: string | null;
  country: string | null;
  summary: string;
  boundaryReason: string;
  points: ClusterPoint[];
  startTimestamp: string;
  endTimestamp: string;
  confidence: "High" | "Medium" | "Low";
};

function confidenceValue(
  value: RefinedTrip["confidence"],
) {
  if (value === "High") {
    return 0.9;
  }

  if (value === "Medium") {
    return 0.7;
  }

  return 0.55;
}

async function parseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Service returned ${response.status}: ${text.slice(0, 180)}`,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id: uploadBatchId } = await context.params;

  try {
    const batch = await prisma.uploadBatch.findFirst({
      where: {
        id: uploadBatchId,
        ownerId: userId,
      },
      include: {
        photos: {
          where: {
            hasGps: true,
            hasTimestamp: true,
            latitude: {
              not: null,
            },
            longitude: {
              not: null,
            },
            takenAt: {
              not: null,
            },
          },
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: "Upload batch not found." },
        { status: 404 },
      );
    }

    if (batch.photos.length < 2) {
      return NextResponse.json(
        {
          error:
            "At least 2 photos with GPS and timestamps are required.",
        },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.trip.deleteMany({
        where: {
          ownerId: userId,
          uploadBatchId,
          status: "PROPOSED",
        },
      }),
      prisma.photoAsset.updateMany({
        where: {
          ownerId: userId,
          uploadBatchId,
        },
        data: {
          tripId: null,
        },
      }),
      prisma.uploadBatch.update({
        where: {
          id: uploadBatchId,
        },
        data: {
          status: "PROCESSING",
          errorMessage: null,
        },
      }),
    ]);

    const points: ClusterPoint[] = batch.photos.map(
      (photo) => ({
        id: photo.id,
        filename: photo.filename,
        latitude: photo.latitude!,
        longitude: photo.longitude!,
        timestamp: photo.takenAt!.toISOString(),
      }),
    );

    const origin = new URL(request.url).origin;

    let clusterData: Record<string, unknown> = {};
    let clusters: PythonCluster[] = [];

    try {
      const clusterResponse = await fetch(
        `${origin}/api/cluster`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie:
              request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify({
            points,
            epsilonMiles: 75,
            minPoints: 2,
            maxGapHours: 168,
          }),
          cache: "no-store",
        },
      );

      clusterData = await parseJson(clusterResponse);

      if (!clusterResponse.ok) {
        throw new Error(
          String(
            clusterData.error ??
              "Python clustering failed.",
          ),
        );
      }

      clusters = (
        clusterData.clusters ?? []
      ) as PythonCluster[];
    } catch (pythonError) {
      console.warn(
        "Python clustering unavailable; using TypeScript DBSCAN fallback.",
        pythonError,
      );

      clusters = inferTripsWithDbscan(points, {
        epsilonMiles: 75,
        minPoints: 2,
        maxTimeGapHours: 168,
      }).map((cluster, index) => ({
        clusterId: `cluster-${index + 1}`,
        points: cluster.points.map((point) => {
          const original = points.find(
            (candidate) =>
              candidate.filename === point.filename &&
              candidate.timestamp === point.timestamp,
          );

          return {
            id:
              original?.id ??
              `${index}-${point.filename ?? "photo"}`,
            filename:
              point.filename ?? "photo",
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: point.timestamp,
          };
        }),
        centerLat: cluster.latitude,
        centerLng: cluster.longitude,
        startTimestamp: cluster.startDate,
        endTimestamp: cluster.endDate,
      }));

      clusterData = {
        engine: "typescript-dbscan-fallback",
      };
    }

    if (!clusters.length) {
      await prisma.uploadBatch.update({
        where: {
          id: uploadBatchId,
        },
        data: {
          status: "REVIEW_REQUIRED",
          errorMessage:
            "No automatic trips matched the distance and time rules.",
        },
      });

      return NextResponse.json({
        tripCount: 0,
        clusteringEngine: clusterData.engine,
        refinedWithGpt: false,
      });
    }

    const gptInput = clusters.map(
      (cluster, index) => {
        const location = getLocationDetails(
          cluster.centerLat,
          cluster.centerLng,
        );

        let confidence:
          | "High"
          | "Medium"
          | "Low" = "Low";

        if (cluster.points.length >= 5) {
          confidence = "High";
        } else if (cluster.points.length >= 3) {
          confidence = "Medium";
        }

        return {
          clusterId: cluster.clusterId,
          title:
            location.title ===
            "Unnamed Travel Stop"
              ? `Trip ${index + 1}`
              : location.title,
          city: location.city,
          country: location.country,
          confidence,
          startTimestamp:
            cluster.startTimestamp,
          endTimestamp: cluster.endTimestamp,
          insight: `Detected from ${cluster.points.length} timestamped GPS photos using DBSCAN.`,
          points: cluster.points,
        };
      },
    );

    const refineResponse = await fetch(
      `${origin}/api/refine-trips`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie:
            request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({
          trips: gptInput,
        }),
        cache: "no-store",
      },
    );

    const refineData =
      await parseJson(refineResponse);

    if (!refineResponse.ok) {
      throw new Error(
        String(
          refineData.error ??
            "GPT refinement failed.",
        ),
      );
    }

    const refinedTrips = (
      refineData.trips ?? []
    ) as RefinedTrip[];

    for (const refined of refinedTrips) {
      if (!refined.points.length) {
        continue;
      }

      const centerLat =
        refined.points.reduce(
          (sum, point) =>
            sum + point.latitude,
          0,
        ) / refined.points.length;

      const centerLng =
        refined.points.reduce(
          (sum, point) =>
            sum + point.longitude,
          0,
        ) / refined.points.length;

      const trip = await prisma.trip.create({
        data: {
          ownerId: userId,
          uploadBatchId,
          title: refined.title,
          city: refined.city,
          country: refined.country,
          notes: `${refined.summary}\n\nBoundary decision: ${refined.boundaryReason}`,
          status: "PROPOSED",
          startDate: new Date(
            refined.startTimestamp,
          ),
          endDate: new Date(
            refined.endTimestamp,
          ),
          centerLat,
          centerLng,
          confidence: confidenceValue(
            refined.confidence,
          ),
          photoPoints: {
            createMany: {
              data: refined.points.map(
                (point) => ({
                  filename:
                    point.filename,
                  latitude:
                    point.latitude,
                  longitude:
                    point.longitude,
                  takenAt: new Date(
                    point.timestamp,
                  ),
                }),
              ),
            },
          },
        },
      });

      await prisma.photoAsset.updateMany({
        where: {
          id: {
            in: refined.points.map(
              (point) => point.id,
            ),
          },
          ownerId: userId,
          uploadBatchId,
        },
        data: {
          tripId: trip.id,
        },
      });
    }

    await prisma.uploadBatch.update({
      where: {
        id: uploadBatchId,
      },
      data: {
        status: "REVIEW_REQUIRED",
        errorMessage: null,
      },
    });

    return NextResponse.json({
      tripCount: refinedTrips.length,
      clusteringEngine: clusterData.engine,
      refinedWithGpt: Boolean(
        refineData.refinedWithGpt,
      ),
      warning: refineData.warning ?? null,
    });
  } catch (error) {
    console.error(
      "Trip processing failed:",
      error,
    );

    await prisma.uploadBatch.updateMany({
      where: {
        id: uploadBatchId,
        ownerId: userId,
      },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Trip processing failed.",
      },
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Trip processing failed.",
      },
      { status: 500 },
    );
  }
}