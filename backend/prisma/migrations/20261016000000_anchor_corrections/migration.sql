CREATE TABLE `AnchorCorrection` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `diaryId` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `sourceBlockId` VARCHAR(191) NOT NULL,
    `sourceDiaryVersion` INTEGER NOT NULL,
    `correction` LONGTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AnchorCorrection_owner_diary_anchor_version_key`(`ownerDeviceId`, `diaryId`, `anchorId`, `sourceDiaryVersion`),
    INDEX `AnchorCorrection_ownerDeviceId_diaryId_sourceDiaryVersion_idx`(`ownerDeviceId`, `diaryId`, `sourceDiaryVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AnchorCorrectionCommand` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `correctionId` VARCHAR(191) NOT NULL,
    `correctionVersion` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AnchorCorrectionCommand_ownerDeviceId_idempotencyKey_key`(`ownerDeviceId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
