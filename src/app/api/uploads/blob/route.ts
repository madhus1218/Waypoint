import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "You must be signed in to upload photos." }, { status: 401 });

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload ?? "{}") as { batchId?: string };
        if (!payload.batchId) throw new Error("Missing upload batch.");

        const batch = await prisma.uploadBatch.findFirst({
          where: { id: payload.batchId, ownerId: userId },
          select: { id: true },
        });
        if (!batch) throw new Error("Upload batch not found.");
        if (!pathname.startsWith(`uploads/${userId}/${payload.batchId}/`)) {
          throw new Error("Invalid upload pathname.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId, batchId: payload.batchId }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Blob token route failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authorize the upload." }, { status: 400 });
  }
}
