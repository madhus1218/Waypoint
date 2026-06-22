"use client";

import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";

const UploadClient = dynamic(
  () => import("./UploadClient"),
  {
    ssr: false,
    loading: () => (
      <main className="flex min-h-screen items-center justify-center bg-[#07130f] text-white">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
          <p className="mt-4 text-slate-400">
            Loading photo uploader...
          </p>
        </div>
      </main>
    ),
  }
);

export default function UploadPage() {
  return <UploadClient />;
}