import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PhotoPointInput = {
  filename?: string;
  latitude: number;
  longitude: number;
  takenAt: string;
};

type CreateTripRequestBody = {
  ownerId?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  country?: string;
  notes?: string;
  photoPoints?: PhotoPointInput[];
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");

    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner ID is required" },
        { status: 400 }
      );
    }

    const trips = await prisma.trip.findMany({
      where: {
        ownerId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        photoPoints: {
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    return NextResponse.json({ trips });
  } catch (error) {
    console.error("Failed to fetch trips:", error);

    return NextResponse.json(
      { error: "Failed to fetch trips" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTripRequestBody;

    const {
      ownerId,
      title,
      startDate,
      endDate,
      city,
      country,
      notes,
      photoPoints,
    } = body;

    if (!ownerId || !title?.trim() || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Owner ID, title, start date, and end date are required" },
        { status: 400 }
      );
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (
      Number.isNaN(parsedStartDate.getTime()) ||
      Number.isNaN(parsedEndDate.getTime())
    ) {
      return NextResponse.json(
        { error: "Invalid trip date" },
        { status: 400 }
      );
    }

    if (parsedEndDate < parsedStartDate) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const existingTrip = await prisma.trip.findFirst({
      where: {
        ownerId,
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
          message: "Trip already exists",
        },
        { status: 200 }
      );
    }

    const trip = await prisma.trip.create({
      data: {
        ownerId,
        title: title.trim(),
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        city: city?.trim() || null,
        country: country?.trim() || null,
        notes: notes?.trim() || null,
        photoPoints: {
          create:
            photoPoints?.map((point) => ({
              filename: point.filename || null,
              latitude: Number(point.latitude),
              longitude: Number(point.longitude),
              takenAt: new Date(point.takenAt),
            })) || [],
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

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    console.error("Failed to create trip:", error);

    return NextResponse.json(
      { error: "Failed to create trip" },
      { status: 500 }
    );
  }
}