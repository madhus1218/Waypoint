import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: "You must be signed in to view trips.",
      },
      {
        status: 401,
      },
    );
  }

  try {
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
          orderBy: {
            takenAt: "asc",
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
      const uploadedPhotos = trip.photos
        .filter(
          (photo) =>
            photo.latitude !== null &&
            photo.longitude !== null &&
            photo.takenAt !== null,
        )
        .map((photo) => ({
          id: photo.id,
          filename: photo.filename,
          latitude: photo.latitude as number,
          longitude: photo.longitude as number,
          takenAt: photo.takenAt as Date,
          blobUrl: photo.blobUrl,
          pathname: photo.pathname,
        }));

      const legacyPhotoPoints = trip.photoPoints.map((photo) => ({
        id: photo.id,
        filename: photo.filename,
        latitude: photo.latitude,
        longitude: photo.longitude,
        takenAt: photo.takenAt,
        blobUrl: null,
        pathname: null,
      }));

      const displayPhotoPoints =
        uploadedPhotos.length > 0
          ? uploadedPhotos
          : legacyPhotoPoints;

      return {
        id: trip.id,
        ownerId: trip.ownerId,
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
        photoPoints: displayPhotoPoints,
      };
    });

    return NextResponse.json({
      trips: normalizedTrips,
    });
  } catch (error) {
    console.error("Failed to fetch saved trips:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch saved trips.",
      },
      {
        status: 500,
      },
    );
  }
}