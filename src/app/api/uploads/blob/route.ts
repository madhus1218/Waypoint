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
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024;

type ClientPayload = {
  batchId?: string;
};

function getBlobToken(): string | undefined {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.waypoint_BLOB_READ_WRITE_TOKEN
  );
}

export async function POST(request: Request) {
  try {
    const blobToken = getBlobToken();

    if (!blobToken) {
      console.error(
        "Missing Blob token. Expected BLOB_READ_WRITE_TOKEN or waypoint_BLOB_READ_WRITE_TOKEN.",
      );

      return NextResponse.json(
        {
          error:
            "The Vercel Blob token is missing. Add BLOB_READ_WRITE_TOKEN in Vercel and redeploy.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    const response = await handleUpload({
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

        let payload: ClientPayload = {};

        try {
          payload = JSON.parse(
            clientPayload ?? "{}",
          ) as ClientPayload;
        } catch {
          throw new Error("Invalid upload information.");
        }

        const batchId = payload.batchId;

        if (!batchId) {
          throw new Error("Missing upload batch.");
        }

        const batch = await prisma.uploadBatch.findFirst({
          where: {
            id: batchId,
            ownerId: userId,
          },
          select: {
            id: true,
          },
        });

        if (!batch) {
          throw new Error(
            "Upload batch was not found or does not belong to you.",
          );
        }

        const expectedPrefix = `uploads/${userId}/${batchId}/`;

        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid upload pathname.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId,
            batchId,
          }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          console.log("Vercel Blob upload completed:", {
            pathname: blob.pathname,
            tokenPayload,
          });
        } catch (error) {
          console.error(
            "Blob completion callback failed:",
            error,
          );
        }
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Blob client-token route failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not authorize the photo upload.",
      },
      { status: 400 },
    );
  }
}