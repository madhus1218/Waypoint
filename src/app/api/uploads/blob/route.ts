import { auth } from "@clerk/nextjs/server";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

type UploadClientPayload = {
  batchId?: string;
};

export async function POST(request: Request) {
  try {
    const blobToken =
      process.env.BLOB_READ_WRITE_TOKEN ??
      process.env.waypoint_BLOB_READ_WRITE_TOKEN;

    if (!blobToken) {
      console.error("Missing Vercel Blob read/write token.");

      return NextResponse.json(
        {
          error:
            "BLOB_READ_WRITE_TOKEN is missing from the Vercel environment variables.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request,
      token: blobToken,

      onBeforeGenerateToken: async (
        pathname,
        clientPayload,
      ) => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error(
            "You must be signed in to upload photos.",
          );
        }

        let payload: UploadClientPayload;

        try {
          payload = JSON.parse(
            clientPayload || "{}",
          ) as UploadClientPayload;
        } catch {
          throw new Error(
            "The upload client payload is invalid.",
          );
        }

        if (!payload.batchId) {
          throw new Error(
            "The upload batch ID is missing.",
          );
        }

        const batch = await prisma.uploadBatch.findFirst({
          where: {
            id: payload.batchId,
            ownerId: userId,
          },
          select: {
            id: true,
          },
        });

        if (!batch) {
          throw new Error(
            "The upload batch could not be found.",
          );
        }

        const expectedPrefix =
          `uploads/${userId}/${payload.batchId}/`;

        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error(
            "The requested upload pathname is invalid.",
          );
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId,
            batchId: payload.batchId,
          }),
        };
      },

      onUploadCompleted: async ({
        blob,
        tokenPayload,
      }) => {
        console.log("Blob upload completed", {
          pathname: blob.pathname,
          tokenPayload,
        });
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "Failed to generate Vercel Blob client token:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to authorize the photo upload.",
      },
      { status: 400 },
    );
  }
}