CREATE TABLE `MaterialPhoto` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `sourceAssetId` VARCHAR(191) NOT NULL,
  `filePath` VARCHAR(1024) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(80) NOT NULL,
  `size` INTEGER NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `date` VARCHAR(32) NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MaterialPhoto_ownerDeviceId_sourceAssetId_key` (`ownerDeviceId`, `sourceAssetId`),
  INDEX `MaterialPhoto_ownerDeviceId_createdAt_idx` (`ownerDeviceId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MaterialPhotoQuota` (
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `photoCount` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`ownerDeviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DiaryPhotoCopy` (
  `id` VARCHAR(191) NOT NULL,
  `ownerDeviceId` VARCHAR(191) NOT NULL,
  `diaryId` VARCHAR(191) NOT NULL,
  `photoId` VARCHAR(191) NOT NULL,
  `filePath` VARCHAR(1024) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(80) NOT NULL,
  `size` INTEGER NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `date` VARCHAR(32) NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DiaryPhotoCopy_ownerDeviceId_diaryId_photoId_key` (`ownerDeviceId`, `diaryId`, `photoId`),
  INDEX `DiaryPhotoCopy_ownerDeviceId_diaryId_idx` (`ownerDeviceId`, `diaryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
