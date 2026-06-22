import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

export async function POST(
  request: Request
): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname) => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error("You must be signed in to upload photos.");
        }

        const expectedPrefix = `uploads/${userId}/`;

        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid upload pathname.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId,
          }),
        };
        },

        onUploadCompleted: async ({ blob, tokenPayload }) => {
          if (!tokenPayload) {
            console.warn("Upload completed without a token payload", {
              pathname: blob.pathname,
            });
            return;
          }

          const parsedPayload = JSON.parse(tokenPayload) as {
            userId: string;
          };

          console.info("Photo uploaded to private storage", {
            pathname: blob.pathname,
            ownerId: parsedPayload.userId,
          });
        },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Blob upload authorization failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not authorize photo upload.",
      },
      {
        status: 400,
      }
    );
  }
}