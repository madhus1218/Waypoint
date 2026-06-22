import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { extractPhotoMetadata } from "@/lib/photoMetadata";

export const runtime = "nodejs";
export const maxDuration = 60;

const uploadedBlobSchema = z.object({
  originalName: z.string().min(1).max(500),
  pathname: z.string().min(1),
  url: z.string().url(),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

const createUploadSchema = z.object({
  blobs: z
    .array(uploadedBlobSchema)
    .min(1)
    .max(100),
});

async function readPrivateBlob(pathname: string) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    throw new Error("BLOB_READ_WRITE_TOKEN is missing.");
  }

  const result = await get(pathname, {
    access: "private",
    token: blobToken,
  });

  if (!result || !result.stream) {
    throw new Error(`Could not read uploaded file: ${pathname}`);
  }

  const arrayBuffer = await new Response(
    result.stream
  ).arrayBuffer();

  return Buffer.from(arrayBuffer);
}

export async function POST(request: Request) {
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

  try {
    const parsedBody = createUploadSchema.safeParse(
      await request.json()
    );

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid upload data.",
          details: parsedBody.error.flatten(),
        },
        {
          status: 400,
        }
      );
    }

    const expectedPrefix = `uploads/${userId}/`;

    for (const blob of parsedBody.data.blobs) {
      if (!blob.pathname.startsWith(expectedPrefix)) {
        return NextResponse.json(
          {
            error: "One or more uploaded files are invalid.",
          },
          {
            status: 403,
          }
        );
      }
    }

    const uploadBatch = await prisma.uploadBatch.create({
      data: {
        ownerId: userId,
        status: "PROCESSING",
        originalCount: parsedBody.data.blobs.length,
      },
    });

    let processedCount = 0;
    let warningCount = 0;
    let duplicateCount = 0;

    try {
      for (const blob of parsedBody.data.blobs) {
        const buffer = await readPrivateBlob(blob.pathname);

        const checksum = createHash("sha256")
          .update(buffer)
          .digest("hex");

        const existingPhoto =
          await prisma.photoAsset.findFirst({
            where: {
              ownerId: userId,
              checksum,
            },
            select: {
              id: true,
            },
          });

        if (existingPhoto) {
          duplicateCount += 1;
          continue;
        }

        let metadata;

        try {
          metadata = await extractPhotoMetadata(buffer);
        } catch (metadataError) {
          console.warn(
            `Could not extract EXIF from ${blob.originalName}:`,
            metadataError
          );

          metadata = {
            latitude: null,
            longitude: null,
            takenAt: null,
            width: null,
            height: null,
            cameraMake: null,
            cameraModel: null,
            warning: "Could not read photo metadata",
          };
        }

        if (metadata.warning) {
          warningCount += 1;
        }

        await prisma.photoAsset.create({
          data: {
            ownerId: userId,
            uploadBatchId: uploadBatch.id,
            filename: blob.originalName,
            pathname: blob.pathname,
            blobUrl: blob.url,
            mimeType: blob.contentType,
            fileSize: blob.size,
            checksum,
            latitude: metadata.latitude,
            longitude: metadata.longitude,
            takenAt: metadata.takenAt,
            width: metadata.width,
            height: metadata.height,
            cameraMake: metadata.cameraMake,
            cameraModel: metadata.cameraModel,
            hasGps:
              metadata.latitude !== null &&
              metadata.longitude !== null,
            hasTimestamp: metadata.takenAt !== null,
            warning: metadata.warning,
          },
        });

        processedCount += 1;

        await prisma.uploadBatch.update({
          where: {
            id: uploadBatch.id,
          },
          data: {
            processedCount,
            warningCount,
          },
        });
      }

      const usablePhotoCount =
        await prisma.photoAsset.count({
          where: {
            uploadBatchId: uploadBatch.id,
            hasGps: true,
            hasTimestamp: true,
          },
        });

      const finalBatch =
        await prisma.uploadBatch.update({
          where: {
            id: uploadBatch.id,
          },
          data: {
            processedCount,
            warningCount,
            status:
              usablePhotoCount >= 2
                ? "UPLOADED"
                : "REVIEW_REQUIRED",
          },
          include: {
            photos: {
              orderBy: {
                takenAt: "asc",
              },
            },
          },
        });

      return NextResponse.json({
        batch: finalBatch,
        duplicateCount,
        usablePhotoCount,
      });
    } catch (processingError) {
      await prisma.uploadBatch.update({
        where: {
          id: uploadBatch.id,
        },
        data: {
          status: "FAILED",
          errorMessage:
            processingError instanceof Error
              ? processingError.message
              : "Photo processing failed.",
        },
      });

      throw processingError;
    }
  } catch (error) {
    console.error("Photo processing failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process uploaded photos.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET() {
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

  const batches = await prisma.uploadBatch.findMany({
    where: {
      ownerId: userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          photos: true,
        },
      },
    },
  });

  return NextResponse.json({
    batches,
  });
}