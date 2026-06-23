import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
  console.log("UPLOAD ROUTE REACHED");
  
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error: "You must be signed in to upload photos.",
        },
        {
          status: 401,
        }
      );
    }

    const formData = await request.formData();

    const file = formData.get("file");
    const pathname = formData.get("pathname");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "No valid file was provided.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof pathname !== "string" ||
      pathname.length === 0
    ) {
      return NextResponse.json(
        {
          error: "No valid pathname was provided.",
        },
        {
          status: 400,
        }
      );
    }

    const expectedPrefix = `uploads/${userId}/`;

    if (!pathname.startsWith(expectedPrefix)) {
      return NextResponse.json(
        {
          error: "Invalid upload pathname.",
        },
        {
          status: 403,
        }
      );
    }

    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${
            file.type || "unknown"
          }.`,
        },
        {
          status: 400,
        }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "Each photo must be 25 MB or smaller.",
        },
        {
          status: 400,
        }
      );
    }

    const blob = await put(pathname, file, {
      access: "private",
      addRandomSuffix: true,
    });

    return NextResponse.json({
      blob,
    });
  } catch (error) {
    console.error("Blob server upload failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not upload the photo.",
      },
      {
        status: 500,
      }
    );
  }
}