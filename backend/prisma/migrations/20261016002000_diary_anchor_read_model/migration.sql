CREATE TABLE `DiaryAnchorExtraction` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `diaryId` VARCHAR(191) NOT NULL,
    `diaryVersion` INTEGER NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `sourceHash` VARCHAR(191) NOT NULL,
    `resultHash` VARCHAR(191) NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL,
    `failureCode` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiaryAnchorExtraction_ownerDeviceId_diaryId_diaryVersion_key`(`ownerDeviceId`, `diaryId`, `diaryVersion`),
    UNIQUE INDEX `DiaryAnchorExtraction_ownerDeviceId_requestId_key`(`ownerDeviceId`, `requestId`),
    INDEX `DiaryAnchorExtraction_ownerDeviceId_diaryId_status_idx`(`ownerDeviceId`, `diaryId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DiaryAnchor` (
    `id` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `diaryId` VARCHAR(191) NOT NULL,
    `diaryVersion` INTEGER NOT NULL,
    `extractionId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `sourceBlockId` VARCHAR(191) NOT NULL,
    `excerpt` LONGTEXT NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DiaryAnchor_extractionId_anchorId_key`(`extractionId`, `anchorId`),
    INDEX `DiaryAnchor_ownerDeviceId_tagId_diaryVersion_idx`(`ownerDeviceId`, `tagId`, `diaryVersion`),
    INDEX `DiaryAnchor_ownerDeviceId_diaryId_diaryVersion_idx`(`ownerDeviceId`, `diaryId`, `diaryVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DiaryAnchor`
ADD CONSTRAINT `DiaryAnchor_extractionId_fkey`
FOREIGN KEY (`extractionId`) REFERENCES `DiaryAnchorExtraction`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
