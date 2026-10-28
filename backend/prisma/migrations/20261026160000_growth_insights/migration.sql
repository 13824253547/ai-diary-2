ALTER TABLE `Diary`
  ADD COLUMN `publishedLocalDate` VARCHAR(10) NULL,
  ADD INDEX `Diary_ownerDeviceId_publishedLocalDate_idx` (`ownerDeviceId`, `publishedLocalDate`);

CREATE TABLE `GrowthFlower` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `flowerKey` VARCHAR(32) NOT NULL,
  `summary` VARCHAR(240) NOT NULL,
  `sourceDiaryIds` JSON NOT NULL,
  `sourceDiaryVersions` JSON NOT NULL,
  `sourceHash` VARCHAR(191) NOT NULL,
  `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrowthFlower_ownerDeviceId_flowerKey_key` (`ownerDeviceId`, `flowerKey`),
  INDEX `GrowthFlower_ownerDeviceId_awardedAt_idx` (`ownerDeviceId`, `awardedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrowthRecognitionRun` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `runKey` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `sourceVersion` VARCHAR(191) NOT NULL,
  `sourceDiaryId` VARCHAR(191) NULL,
  `sourceDiaryVersion` INTEGER NULL,
  `sourceDiaryRefs` JSON NOT NULL,
  `batchResults` JSON NULL,
  `nextBatchIndex` INTEGER NOT NULL DEFAULT 0,
  `batchCount` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(24) NOT NULL,
  `failureCode` VARCHAR(48) NULL,
  `attempt` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GrowthRecognitionRun_ownerDeviceId_runKey_key` (`ownerDeviceId`, `runKey`),
  INDEX `GrowthRecognitionRun_ownerDeviceId_status_createdAt_idx` (`ownerDeviceId`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrowthMilestone` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `milestoneId` VARCHAR(32) NOT NULL,
  `sourceDiaryIds` JSON NOT NULL,
  `achievedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrowthMilestone_ownerDeviceId_milestoneId_key` (`ownerDeviceId`, `milestoneId`),
  INDEX `GrowthMilestone_ownerDeviceId_achievedAt_idx` (`ownerDeviceId`, `achievedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrowthInsightReport` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `sourceVersion` VARCHAR(191) NOT NULL,
  `sourceDiaryIds` JSON NOT NULL,
  `sourceDiaryVersions` JSON NOT NULL,
  `sourceDiaryCount` INTEGER NOT NULL,
  `dimensions` JSON NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `GrowthInsightReport_ownerDeviceId_sourceVersion_key` (`ownerDeviceId`, `sourceVersion`),
  INDEX `GrowthInsightReport_ownerDeviceId_generatedAt_idx` (`ownerDeviceId`, `generatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GrowthReportJob` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `sourceVersion` VARCHAR(191) NOT NULL,
  `sourceDiaryRefs` JSON NOT NULL,
  `candidateDimensions` JSON NULL,
  `nextBatchIndex` INTEGER NOT NULL DEFAULT 0,
  `batchCount` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(24) NOT NULL,
  `failureCode` VARCHAR(48) NULL,
  `attempt` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `GrowthReportJob_ownerDeviceId_requestId_key` (`ownerDeviceId`, `requestId`),
  UNIQUE INDEX `GrowthReportJob_ownerDeviceId_sourceVersion_key` (`ownerDeviceId`, `sourceVersion`),
  INDEX `GrowthReportJob_ownerDeviceId_status_createdAt_idx` (`ownerDeviceId`, `status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
