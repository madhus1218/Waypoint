import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PhotoPointInput = {
  filename?: string;
  latitude: number;
  longitude: number;
  takenAt: string;
};

type CreateTripRequestBody = {
  title?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  country?: string;
  notes?: string;
  photoPoints?: PhotoPointInput[];
};

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error: "You must be signed in to view your trips.",
        },
        {
          status: 401,
        }
      );
    }

    const trips = await prisma.trip.findMany({
      where: {
        ownerId: userId,
        status: "CONFIRMED",
      },
      orderBy: {
        startDate: "desc",
      },
      include: {
        photos: {
          where: {
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
          select: {
            id: true,
            filename: true,
            latitude: true,
            longitude: true,
            takenAt: true,
            blobUrl: true,
            pathname: true,
          },
        },

        photoPoints: {
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    const normalizedTrips = trips.map((trip) => {
      const uploadedPhotoPoints = trip.photos
        .filter(
          (
            photo
          ): photo is typeof photo & {
            latitude: number;
            longitude: number;
            takenAt: Date;
          } =>
            photo.latitude !== null &&
            photo.longitude !== null &&
            photo.takenAt !== null
        )
        .map((photo) => ({
          id: photo.id,
          filename: photo.filename,
          latitude: photo.latitude,
          longitude: photo.longitude,
          takenAt: photo.takenAt,
          blobUrl: photo.blobUrl,
          pathname: photo.pathname,
        }));

      const legacyPhotoPoints = trip.photoPoints.map(
        (photo) => ({
          id: photo.id,
          filename: photo.filename,
          latitude: photo.latitude,
          longitude: photo.longitude,
          takenAt: photo.takenAt,
          blobUrl: null,
          pathname: null,
        })
      );

      return {
        id: trip.id,
        title: trip.title,
        startDate: trip.startDate,
        endDate: trip.endDate,
        city: trip.city,
        country: trip.country,
        notes: trip.notes,
        status: trip.status,
        confidence: trip.confidence,
        centerLat: trip.centerLat,
        centerLng: trip.centerLng,
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt,

        photoPoints:
          uploadedPhotoPoints.length > 0
            ? uploadedPhotoPoints
            : legacyPhotoPoints,
      };
    });

    return NextResponse.json({
      trips: normalizedTrips,
    });
  } catch (error) {
    console.error("Failed to fetch trips:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch saved trips.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error: "You must be signed in to save a trip.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as CreateTripRequestBody;

    const {
      title,
      startDate,
      endDate,
      city,
      country,
      notes,
      photoPoints,
    } = body;

    if (!title?.trim() || !startDate || !endDate) {
      return NextResponse.json(
        {
          error:
            "Title, start date, and end date are required.",
        },
        {
          status: 400,
        }
      );
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (
      Number.isNaN(parsedStartDate.getTime()) ||
      Number.isNaN(parsedEndDate.getTime())
    ) {
      return NextResponse.json(
        {
          error: "Invalid trip date.",
        },
        {
          status: 400,
        }
      );
    }

    if (parsedEndDate < parsedStartDate) {
      return NextResponse.json(
        {
          error: "End date cannot be before start date.",
        },
        {
          status: 400,
        }
      );
    }

    const validPhotoPoints = (photoPoints ?? []).filter(
      (point) => {
        const takenAt = new Date(point.takenAt);

        return (
          Number.isFinite(Number(point.latitude)) &&
          Number.isFinite(Number(point.longitude)) &&
          !Number.isNaN(takenAt.getTime())
        );
      }
    );

    const existingTrip = await prisma.trip.findFirst({
      where: {
        ownerId: userId,
        title: title.trim(),
        startDate: parsedStartDate,
        endDate: parsedEndDate,
      },
      include: {
        photoPoints: {
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    if (existingTrip) {
      return NextResponse.json(
        {
          trip: existingTrip,
          message: "Trip already exists.",
        },
        {
          status: 200,
        }
      );
    }

    const trip = await prisma.trip.create({
      data: {
        ownerId: userId,
        title: title.trim(),
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        city: city?.trim() || null,
        country: country?.trim() || null,
        notes: notes?.trim() || null,
        status: "CONFIRMED",

        photoPoints: {
          create: validPhotoPoints.map((point) => ({
            filename: point.filename?.trim() || null,
            latitude: Number(point.latitude),
            longitude: Number(point.longitude),
            takenAt: new Date(point.takenAt),
          })),
        },
      },

      include: {
        photoPoints: {
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    return NextResponse.json(
      {
        trip,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Failed to create trip:", error);

    return NextResponse.json(
      {
        error: "Failed to create trip.",
      },
      {
        status: 500,
      }
    );
  }
}