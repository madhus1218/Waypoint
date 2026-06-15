import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

function getOwnerIdFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  return searchParams.get("ownerId");
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ownerId = getOwnerIdFromRequest(request);

    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner ID is required" },
        { status: 400 }
      );
    }

    const trip = await prisma.trip.findFirst({
      where: {
        id,
        ownerId,
      },
      include: {
        photoPoints: {
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    if (!trip) {
      return NextResponse.json(
        { error: "Trip not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ trip });
  } catch (error) {
    console.error("Failed to fetch trip:", error);

    return NextResponse.json(
      { error: "Failed to fetch trip" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ownerId = getOwnerIdFromRequest(request);

    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner ID is required" },
        { status: 400 }
      );
    }

    const existingTrip = await prisma.trip.findFirst({
      where: {
        id,
        ownerId,
      },
    });

    if (!existingTrip) {
      return NextResponse.json(
        { error: "Trip not found" },
        { status: 404 }
      );
    }

    await prisma.trip.delete({
      where: {
        id: existingTrip.id,
      },
    });

    return NextResponse.json({
      message: "Trip deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete trip:", error);

    return NextResponse.json(
      { error: "Failed to delete trip" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ownerId = getOwnerIdFromRequest(request);

    if (!ownerId) {
      return NextResponse.json(
        { error: "Owner ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, city, country, notes } = body;

    if (typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Trip title is required" },
        { status: 400 }
      );
    }

    const existingTrip = await prisma.trip.findFirst({
      where: {
        id,
        ownerId,
      },
    });

    if (!existingTrip) {
      return NextResponse.json(
        { error: "Trip not found" },
        { status: 404 }
      );
    }

    const updatedTrip = await prisma.trip.update({
      where: {
        id: existingTrip.id,
      },
      data: {
        title: title.trim(),
        city: typeof city === "string" ? city.trim() || null : null,
        country:
          typeof country === "string" ? country.trim() || null : null,
        notes: typeof notes === "string" ? notes.trim() || null : null,
      },
      include: {
        photoPoints: {
          orderBy: {
            takenAt: "asc",
          },
        },
      },
    });

    return NextResponse.json({ trip: updatedTrip });
  } catch (error) {
    console.error("Failed to update trip:", error);

    return NextResponse.json(
      { error: "Failed to update trip" },
      { status: 500 }
    );
  }
}