-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADING',
    "originalCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "uploadBatchId" TEXT NOT NULL,
    "tripId" TEXT,
    "filename" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3),
    "width" INTEGER,
    "height" INTEGER,
    "cameraMake" TEXT,
    "cameraModel" TEXT,
    "hasGps" BOOLEAN NOT NULL DEFAULT false,
    "hasTimestamp" BOOLEAN NOT NULL DEFAULT false,
    "warning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadBatch_ownerId_idx" ON "UploadBatch"("ownerId");

-- CreateIndex
CREATE INDEX "UploadBatch_ownerId_status_idx" ON "UploadBatch"("ownerId", "status");

-- CreateIndex
CREATE INDEX "UploadBatch_createdAt_idx" ON "UploadBatch"("createdAt");

-- CreateIndex
CREATE INDEX "PhotoAsset_ownerId_idx" ON "PhotoAsset"("ownerId");

-- CreateIndex
CREATE INDEX "PhotoAsset_uploadBatchId_idx" ON "PhotoAsset"("uploadBatchId");

-- CreateIndex
CREATE INDEX "PhotoAsset_tripId_idx" ON "PhotoAsset"("tripId");

-- CreateIndex
CREATE INDEX "PhotoAsset_takenAt_idx" ON "PhotoAsset"("takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoAsset_ownerId_checksum_key" ON "PhotoAsset"("ownerId", "checksum");

-- CreateIndex
CREATE INDEX "PhotoPoint_tripId_idx" ON "PhotoPoint"("tripId");

-- CreateIndex
CREATE INDEX "PhotoPoint_takenAt_idx" ON "PhotoPoint"("takenAt");

-- CreateIndex
CREATE INDEX "Trip_ownerId_idx" ON "Trip"("ownerId");

-- CreateIndex
CREATE INDEX "Trip_ownerId_startDate_idx" ON "Trip"("ownerId", "startDate");

-- AddForeignKey
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "UploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
