import { auth } from "@clerk/nextjs/server";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname) => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error(
            "You must be signed in to upload photos."
          );
        }

        const expectedPrefix = `uploads/${userId}/`;

        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error(
            `Invalid upload pathname. Expected it to begin with ${expectedPrefix}`
          );
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

      onUploadCompleted: async ({
        blob,
        tokenPayload,
      }) => {
        console.info("Blob upload completed", {
          pathname: blob.pathname,
          tokenPayloadPresent: Boolean(tokenPayload),
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error(
      "Blob client-token route failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate the upload token.",
      },
      {
        status: 400,
      }
    );
  }
}