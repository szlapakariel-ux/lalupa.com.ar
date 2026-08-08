CREATE TYPE "PublicExperienceStatus" AS ENUM ('ACTIVA', 'PROXIMA', 'PROXIMAMENTE');

CREATE TABLE "PublicExperience" (
  "id" TEXT NOT NULL, "category" TEXT NOT NULL, "title" TEXT NOT NULL,
  "guides" TEXT NOT NULL, "description" TEXT NOT NULL,
  "status" "PublicExperienceStatus" NOT NULL DEFAULT 'PROXIMAMENTE',
  "details" TEXT, "ctaLabel" TEXT, "ctaUrl" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0, "published" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicExperience_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublicExperienceSchedule" (
  "id" TEXT NOT NULL, "experienceId" TEXT NOT NULL, "audience" TEXT,
  "text" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PublicExperienceSchedule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublicExperienceImage" (
  "id" TEXT NOT NULL, "experienceId" TEXT NOT NULL, "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL, "alt" TEXT, "isCover" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicExperienceImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicExperience_published_position_idx" ON "PublicExperience"("published", "position");
CREATE INDEX "PublicExperienceSchedule_experienceId_position_idx" ON "PublicExperienceSchedule"("experienceId", "position");
CREATE INDEX "PublicExperienceImage_experienceId_isCover_position_idx" ON "PublicExperienceImage"("experienceId", "isCover", "position");
ALTER TABLE "PublicExperience" ADD CONSTRAINT "PublicExperience_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicExperienceSchedule" ADD CONSTRAINT "PublicExperienceSchedule_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "PublicExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicExperienceImage" ADD CONSTRAINT "PublicExperienceImage_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "PublicExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
