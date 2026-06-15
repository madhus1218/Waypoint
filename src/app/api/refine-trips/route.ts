import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { NextResponse } from "next/server";

type InputPoint = {
  filename: string;
  latitude: number;
  longitude: number;
  timestamp: string;
};

type InputTrip = {
  clusterId: string;
  title: string;
  city: string | null;
  country: string | null;
  confidence: "High" | "Medium" | "Low";
  startTimestamp: string;
  endTimestamp: string;
  insight: string;
  points: InputPoint[];
};

const RefinedTripSchema = z.object({
  trips: z.array(
    z.object({
      sourceClusterIds: z.array(z.string()).min(1),
      title: z.string(),
      city: z.string().nullable(),
      country: z.string().nullable(),
      summary: z.string(),
      boundaryReason: z.string(),
    })
  ),
});

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function validateTrips(value: unknown): InputTrip[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const trips: InputTrip[] = [];

  for (const possibleTrip of value) {
    if (
      typeof possibleTrip !== "object" ||
      possibleTrip === null ||
      typeof possibleTrip.clusterId !== "string" ||
      typeof possibleTrip.title !== "string" ||
      typeof possibleTrip.startTimestamp !== "string" ||
      typeof possibleTrip.endTimestamp !== "string" ||
      typeof possibleTrip.insight !== "string" ||
      !Array.isArray(possibleTrip.points)
    ) {
      return null;
    }

    const points: InputPoint[] = [];

    for (const possiblePoint of possibleTrip.points) {
      if (
        typeof possiblePoint !== "object" ||
        possiblePoint === null ||
        typeof possiblePoint.filename !== "string" ||
        typeof possiblePoint.latitude !== "number" ||
        typeof possiblePoint.longitude !== "number" ||
        typeof possiblePoint.timestamp !== "string" ||
        !isValidCoordinate(
          possiblePoint.latitude,
          possiblePoint.longitude
        ) ||
        Number.isNaN(
          new Date(possiblePoint.timestamp).getTime()
        )
      ) {
        return null;
      }

      points.push({
        filename: possiblePoint.filename,
        latitude: possiblePoint.latitude,
        longitude: possiblePoint.longitude,
        timestamp: possiblePoint.timestamp,
      });
    }

    trips.push({
      clusterId: possibleTrip.clusterId,
      title: possibleTrip.title,
      city:
        typeof possibleTrip.city === "string"
          ? possibleTrip.city
          : null,
      country:
        typeof possibleTrip.country === "string"
          ? possibleTrip.country
          : null,
      confidence:
        possibleTrip.confidence === "High" ||
        possibleTrip.confidence === "Medium"
          ? possibleTrip.confidence
          : "Low",
      startTimestamp: possibleTrip.startTimestamp,
      endTimestamp: possibleTrip.endTimestamp,
      insight: possibleTrip.insight,
      points,
    });
  }

  return trips;
}

function getAverageCoordinate(points: InputPoint[]) {
  if (points.length === 0) {
    return {
      latitude: null,
      longitude: null,
    };
  }

  return {
    latitude:
      points.reduce(
        (sum, point) => sum + point.latitude,
        0
      ) / points.length,
    longitude:
      points.reduce(
        (sum, point) => sum + point.longitude,
        0
      ) / points.length,
  };
}

function buildModelInput(trips: InputTrip[]) {
  return trips.map((trip) => {
    const averageCoordinate = getAverageCoordinate(trip.points);

    return {
      clusterId: trip.clusterId,
      currentTitle: trip.title,
      currentCity: trip.city,
      currentCountry: trip.country,
      confidence: trip.confidence,
      startTimestamp: trip.startTimestamp,
      endTimestamp: trip.endTimestamp,
      photoCount: trip.points.length,
      averageLatitude: averageCoordinate.latitude,
      averageLongitude: averageCoordinate.longitude,
      samplePoints: trip.points.slice(0, 12).map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: point.timestamp,
      })),
    };
  });
}

function createFallbackResult(trips: InputTrip[]) {
  return trips.map((trip) => ({
    sourceClusterIds: [trip.clusterId],
    title: trip.title,
    city: trip.city,
    country: trip.country,
    summary: trip.insight,
    boundaryReason:
      "Kept the original DBSCAN trip boundary.",
    points: trip.points,
    startTimestamp: trip.startTimestamp,
    endTimestamp: trip.endTimestamp,
    confidence: trip.confidence,
  }));
}

function combineConfidence(
  trips: InputTrip[]
): "High" | "Medium" | "Low" {
  const pointCount = trips.reduce(
    (sum, trip) => sum + trip.points.length,
    0
  );

  if (pointCount >= 5) {
    return "High";
  }

  if (pointCount >= 3) {
    return "Medium";
  }

  return "Low";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trips = validateTrips(body.trips);

    if (!trips || trips.length === 0) {
      return NextResponse.json(
        {
          error:
            "A non-empty array of valid generated trips is required.",
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        "OPENAI_API_KEY is missing. Returning original DBSCAN trips."
      );

      return NextResponse.json({
        trips: createFallbackResult(trips),
        refinedWithGpt: false,
        warning:
          "GPT refinement was skipped because the API key is not configured.",
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const modelInput = buildModelInput(trips);

    const response = await openai.responses.parse({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `
You refine travel trips produced by DBSCAN clustering.

Review the clusters in chronological order and resolve only genuinely
ambiguous trip boundaries.

Rules:
1. Merge clusters only when their timestamps and coordinates strongly
   suggest they are parts of the same continuous trip.
2. Keep geographically distinct destinations as separate trips.
3. Keep repeat visits separated when a significant time gap indicates
   that the traveler left and later returned.
4. Never create cluster IDs that were not provided.
5. Every provided cluster ID must appear exactly once in the output.
6. Preserve chronological order.
7. Do not invent a precise city or country when the coordinates are
   insufficient. Use null instead.
8. Write a concise, readable title.
9. Write a natural one- or two-sentence travel summary based only on
   the supplied metadata.
10. Explain briefly why the boundary was kept or merged.
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            dbscanClusters: modelInput,
          }),
        },
      ],
      text: {
        format: zodTextFormat(
          RefinedTripSchema,
          "refined_trips"
        ),
      },
    });

    const parsedResult = response.output_parsed;

    if (!parsedResult) {
      throw new Error(
        "GPT did not return a structured refinement."
      );
    }

    const tripById = new Map(
      trips.map((trip) => [trip.clusterId, trip])
    );

    const usedClusterIds = new Set<string>();

    const refinedTrips = parsedResult.trips.map(
      (refinedTrip) => {
        const sourceTrips = refinedTrip.sourceClusterIds.map(
          (clusterId) => {
            const sourceTrip = tripById.get(clusterId);

            if (!sourceTrip) {
              throw new Error(
                `GPT returned an unknown cluster ID: ${clusterId}`
              );
            }

            if (usedClusterIds.has(clusterId)) {
              throw new Error(
                `GPT reused cluster ID: ${clusterId}`
              );
            }

            usedClusterIds.add(clusterId);
            return sourceTrip;
          }
        );

        const combinedPoints = sourceTrips
          .flatMap((trip) => trip.points)
          .sort(
            (firstPoint, secondPoint) =>
              new Date(firstPoint.timestamp).getTime() -
              new Date(secondPoint.timestamp).getTime()
          );

        return {
          sourceClusterIds:
            refinedTrip.sourceClusterIds,
          title: refinedTrip.title.trim(),
          city: refinedTrip.city,
          country: refinedTrip.country,
          summary: refinedTrip.summary.trim(),
          boundaryReason:
            refinedTrip.boundaryReason.trim(),
          points: combinedPoints,
          startTimestamp: combinedPoints[0].timestamp,
          endTimestamp:
            combinedPoints[combinedPoints.length - 1]
              .timestamp,
          confidence: combineConfidence(sourceTrips),
        };
      }
    );

    if (usedClusterIds.size !== trips.length) {
      throw new Error(
        "GPT omitted one or more DBSCAN clusters."
      );
    }

    refinedTrips.sort(
      (firstTrip, secondTrip) =>
        new Date(firstTrip.startTimestamp).getTime() -
        new Date(secondTrip.startTimestamp).getTime()
    );

    return NextResponse.json({
      trips: refinedTrips,
      refinedWithGpt: true,
    });
  } catch (error) {
    console.error("GPT trip refinement failed:", error);

    return NextResponse.json(
      {
        error: "Could not refine trip boundaries with GPT.",
      },
      { status: 500 }
    );
  }
}