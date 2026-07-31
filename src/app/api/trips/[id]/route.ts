import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  city: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: RouteParams,
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const trip = await prisma.trip.findFirst({
    where: {
      id,
      ownerId: userId,
      status: "CONFIRMED",
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

  if (!trip) {
    return NextResponse.json(
      { error: "Trip not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ trip });
}

export async function DELETE(
  _request: Request,
  { params }: RouteParams,
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const trip = await prisma.trip.findFirst({
    where: {
      id,
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });

  if (!trip) {
    return NextResponse.json(
      { error: "Trip not found." },
      { status: 404 },
    );
  }

  await prisma.trip.delete({
    where: {
      id: trip.id,
    },
  });

  return NextResponse.json({
    message: "Trip deleted successfully.",
  });
}

export async function PATCH(
  request: Request,
  { params }: RouteParams,
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const parsed = updateSchema.safeParse(
    await request.json(),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid trip update.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { id } = await params;

  const trip = await prisma.trip.findFirst({
    where: {
      id,
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });

  if (!trip) {
    return NextResponse.json(
      { error: "Trip not found." },
      { status: 404 },
    );
  }

  const updatedTrip = await prisma.trip.update({
    where: {
      id: trip.id,
    },
    data: {
      title: parsed.data.title,
      city: parsed.data.city || null,
      country: parsed.data.country || null,
      notes: parsed.data.notes || null,
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

  return NextResponse.json({
    trip: updatedTrip,
  });
}