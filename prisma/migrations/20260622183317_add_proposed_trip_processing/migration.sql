-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "centerLat" DOUBLE PRECISION,
ADD COLUMN     "centerLng" DOUBLE PRECISION,
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "status" "TripStatus" NOT NULL DEFAULT 'PROPOSED',
ADD COLUMN     "uploadBatchId" TEXT;

-- CreateIndex
CREATE INDEX "Trip_ownerId_status_idx" ON "Trip"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Trip_uploadBatchId_idx" ON "Trip"("uploadBatchId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_uploadBatchId_fkey" FOREIGN KEY ("uploadBatchId") REFERENCES "UploadBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
