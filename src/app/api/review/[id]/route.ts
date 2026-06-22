import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    tripId: z.string().min(1),
    title: z.string().trim().min(1).max(100),
  }),

  z.object({
    action: z.literal("move-photo"),
    photoId: z.string().min(1),
    targetTripId: z.string().min(1),
  }),

  z.object({
    action: z.literal("merge"),
    sourceTripId: z.string().min(1),
    targetTripId: z.string().min(1),
  }),

  z.object({
    action: z.literal("split"),
    tripId: z.string().min(1),
    splitPhotoId: z.string().min(1),
    newTitle: z.string().trim().min(1).max(100).optional(),
  }),

  z.object({
    action: z.literal("confirm"),
  }),
]);

async function getOwnedBatch(
  uploadBatchId: string,
  userId: string
) {
  return prisma.uploadBatch.findFirst({
    where: {
      id: uploadBatchId,
      ownerId: userId,
    },
    include: {
      trips: {
        where: {
          status: {
            not: "ARCHIVED",
          },
        },
        orderBy: {
          startDate: "asc",
        },
        include: {
          photos: {
            orderBy: {
              takenAt: "asc",
            },
          },
        },
      },
      photos: {
        where: {
          tripId: null,
        },
        orderBy: {
          takenAt: "asc",
        },
      },
    },
  });
}

async function recalculateTrip(tripId: string) {
  const photos = await prisma.photoAsset.findMany({
    where: {
      tripId,
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
  });

  if (photos.length === 0) {
    await prisma.trip.delete({
      where: {
        id: tripId,
      },
    });

    return;
  }

  const datedPhotos = photos.filter(
    (
      photo
    ): photo is typeof photo & {
      takenAt: Date;
      latitude: number;
      longitude: number;
    } =>
      photo.takenAt !== null &&
      photo.latitude !== null &&
      photo.longitude !== null
  );

  if (datedPhotos.length === 0) {
    return;
  }

  const latitude =
    datedPhotos.reduce(
      (sum, photo) => sum + photo.latitude,
      0
    ) / datedPhotos.length;

  const longitude =
    datedPhotos.reduce(
      (sum, photo) => sum + photo.longitude,
      0
    ) / datedPhotos.length;

  await prisma.trip.update({
    where: {
      id: tripId,
    },
    data: {
      startDate: datedPhotos[0].takenAt,
      endDate:
        datedPhotos[datedPhotos.length - 1].takenAt,
      centerLat: latitude,
      centerLng: longitude,
      confidence:
        datedPhotos.length >= 5
          ? 0.9
          : datedPhotos.length >= 3
            ? 0.7
            : 0.5,
    },
  });
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const { id } = await context.params;
  const batch = await getOwnedBatch(id, userId);

  if (!batch) {
    return NextResponse.json(
      {
        error: "Upload batch not found.",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    batch,
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const { id: uploadBatchId } = await context.params;

  const existingBatch =
    await prisma.uploadBatch.findFirst({
      where: {
        id: uploadBatchId,
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });

  if (!existingBatch) {
    return NextResponse.json(
      {
        error: "Upload batch not found.",
      },
      {
        status: 404,
      }
    );
  }

  const parsedBody = actionSchema.safeParse(
    await request.json()
  );

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid review action.",
        details: parsedBody.error.flatten(),
      },
      {
        status: 400,
      }
    );
  }

  const action = parsedBody.data;

  try {
    if (action.action === "rename") {
      const result = await prisma.trip.updateMany({
        where: {
          id: action.tripId,
          ownerId: userId,
          uploadBatchId,
        },
        data: {
          title: action.title,
        },
      });

      if (result.count === 0) {
        return NextResponse.json(
          {
            error: "Trip not found.",
          },
          {
            status: 404,
          }
        );
      }
    }

    if (action.action === "move-photo") {
      const photo =
        await prisma.photoAsset.findFirst({
          where: {
            id: action.photoId,
            ownerId: userId,
            uploadBatchId,
          },
          select: {
            id: true,
            tripId: true,
          },
        });

      const targetTrip =
        await prisma.trip.findFirst({
          where: {
            id: action.targetTripId,
            ownerId: userId,
            uploadBatchId,
          },
          select: {
            id: true,
          },
        });

      if (!photo || !targetTrip) {
        return NextResponse.json(
          {
            error: "Photo or destination trip not found.",
          },
          {
            status: 404,
          }
        );
      }

      const previousTripId = photo.tripId;

      await prisma.photoAsset.update({
        where: {
          id: photo.id,
        },
        data: {
          tripId: targetTrip.id,
        },
      });

      await recalculateTrip(targetTrip.id);

      if (
        previousTripId &&
        previousTripId !== targetTrip.id
      ) {
        await recalculateTrip(previousTripId);
      }
    }

    if (action.action === "merge") {
      if (
        action.sourceTripId === action.targetTripId
      ) {
        return NextResponse.json(
          {
            error: "Choose two different trips.",
          },
          {
            status: 400,
          }
        );
      }

      const trips = await prisma.trip.findMany({
        where: {
          id: {
            in: [
              action.sourceTripId,
              action.targetTripId,
            ],
          },
          ownerId: userId,
          uploadBatchId,
        },
        select: {
          id: true,
        },
      });

      if (trips.length !== 2) {
        return NextResponse.json(
          {
            error: "One or more trips were not found.",
          },
          {
            status: 404,
          }
        );
      }

      await prisma.$transaction([
        prisma.photoAsset.updateMany({
          where: {
            tripId: action.sourceTripId,
            ownerId: userId,
            uploadBatchId,
          },
          data: {
            tripId: action.targetTripId,
          },
        }),

        prisma.trip.delete({
          where: {
            id: action.sourceTripId,
          },
        }),
      ]);

      await recalculateTrip(action.targetTripId);
    }

    if (action.action === "split") {
      const trip = await prisma.trip.findFirst({
        where: {
          id: action.tripId,
          ownerId: userId,
          uploadBatchId,
        },
        include: {
          photos: {
            orderBy: {
              takenAt: "asc",
            },
          },
        },
      });

      if (!trip) {
        return NextResponse.json(
          {
            error: "Trip not found.",
          },
          {
            status: 404,
          }
        );
      }

      const splitIndex = trip.photos.findIndex(
        (photo) => photo.id === action.splitPhotoId
      );

      if (
        splitIndex <= 0 ||
        splitIndex >= trip.photos.length
      ) {
        return NextResponse.json(
          {
            error:
              "Select a photo after the first photo to split this trip.",
          },
          {
            status: 400,
          }
        );
      }

      const secondHalf = trip.photos.slice(splitIndex);

      const validSecondHalf = secondHalf.filter(
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
      );

      if (validSecondHalf.length === 0) {
        return NextResponse.json(
          {
            error:
              "The selected photos do not contain enough metadata to create a trip.",
          },
          {
            status: 400,
          }
        );
      }

      const centerLat =
        validSecondHalf.reduce(
          (sum, photo) => sum + photo.latitude,
          0
        ) / validSecondHalf.length;

      const centerLng =
        validSecondHalf.reduce(
          (sum, photo) => sum + photo.longitude,
          0
        ) / validSecondHalf.length;

      const newTrip = await prisma.$transaction(
        async (transaction) => {
          const created =
            await transaction.trip.create({
              data: {
                ownerId: userId,
                uploadBatchId,
                title:
                  action.newTitle ??
                  `${trip.title} — Part 2`,
                city: trip.city,
                country: trip.country,
                notes:
                  "Created by splitting a proposed trip during review.",
                status: "PROPOSED",
                startDate:
                  validSecondHalf[0].takenAt,
                endDate:
                  validSecondHalf[
                    validSecondHalf.length - 1
                  ].takenAt,
                centerLat,
                centerLng,
                confidence:
                  validSecondHalf.length >= 5
                    ? 0.9
                    : validSecondHalf.length >= 3
                      ? 0.7
                      : 0.5,
              },
            });

          await transaction.photoAsset.updateMany({
            where: {
              id: {
                in: secondHalf.map(
                  (photo) => photo.id
                ),
              },
              ownerId: userId,
              uploadBatchId,
            },
            data: {
              tripId: created.id,
            },
          });

          return created;
        }
      );

      await recalculateTrip(trip.id);
      await recalculateTrip(newTrip.id);
    }

    if (action.action === "confirm") {
      const proposedTripCount =
        await prisma.trip.count({
          where: {
            ownerId: userId,
            uploadBatchId,
            status: "PROPOSED",
          },
        });

      if (proposedTripCount === 0) {
        return NextResponse.json(
          {
            error: "There are no proposed trips to confirm.",
          },
          {
            status: 400,
          }
        );
      }

      await prisma.$transaction([
        prisma.trip.updateMany({
          where: {
            ownerId: userId,
            uploadBatchId,
            status: "PROPOSED",
          },
          data: {
            status: "CONFIRMED",
          },
        }),

        prisma.uploadBatch.update({
          where: {
            id: uploadBatchId,
          },
          data: {
            status: "COMPLETED",
            errorMessage: null,
          },
        }),
      ]);
    }

    const updatedBatch = await getOwnedBatch(
      uploadBatchId,
      userId
    );

    return NextResponse.json({
      batch: updatedBatch,
    });
  } catch (error) {
    console.error("Trip review action failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Trip review action failed.",
      },
      {
        status: 500,
      }
    );
  }
}