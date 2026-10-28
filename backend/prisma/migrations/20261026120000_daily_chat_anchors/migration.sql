ALTER TABLE `DiaryAnchor`
    ADD COLUMN `sourceBlockIds` JSON NULL;

ALTER TABLE `ChatTurn`
    ADD COLUMN `deviceLocalDate` VARCHAR(10) NULL,
    ADD COLUMN `memoryEligible` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `memoryAnchorBatchId` VARCHAR(191) NULL,
    ADD INDEX `ChatTurn_ownerDeviceId_memoryEligible_deviceLocalDate_status_idx`(
        `ownerDeviceId`,
        `memoryEligible`,
        `deviceLocalDate`,
        `status`
    );

CREATE TABLE `ChatDailyAnchor` (
    `id` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `sourceHash` VARCHAR(191) NOT NULL,
    `resultHash` VARCHAR(191) NULL,
    `sourceDateStart` VARCHAR(10) NOT NULL,
    `sourceDateEnd` VARCHAR(10) NOT NULL,
    `sourceCount` INTEGER NOT NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(24) NOT NULL,
    `failureCode` VARCHAR(48) NULL,
    `tagId` VARCHAR(191) NULL,
    `excerpt` LONGTEXT NULL,
    `generatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChatDailyAnchor_anchorId_key`(`anchorId`),
    UNIQUE INDEX `ChatDailyAnchor_ownerDeviceId_requestId_key`(`ownerDeviceId`, `requestId`),
    INDEX `ChatDailyAnchor_ownerDeviceId_status_generatedAt_idx`(`ownerDeviceId`, `status`, `generatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatDailyAnchorSource` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `anchorBatchId` VARCHAR(191) NOT NULL,
    `turnId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `localDate` VARCHAR(10) NOT NULL,

    UNIQUE INDEX `ChatDailyAnchorSource_anchorBatchId_messageId_key`(`anchorBatchId`, `messageId`),
    INDEX `ChatDailyAnchorSource_ownerDeviceId_messageId_idx`(`ownerDeviceId`, `messageId`),
    INDEX `ChatDailyAnchorSource_turnId_idx`(`turnId`),
    INDEX `ChatDailyAnchorSource_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatAnchorCorrection` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `anchorBatchId` VARCHAR(191) NOT NULL,
    `correction` LONGTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChatAnchorCorrection_anchorBatchId_key`(`anchorBatchId`),
    UNIQUE INDEX `ChatAnchorCorrection_ownerDeviceId_anchorId_key`(`ownerDeviceId`, `anchorId`),
    INDEX `ChatAnchorCorrection_ownerDeviceId_updatedAt_idx`(`ownerDeviceId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatAnchorCorrectionCommand` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `correctionId` VARCHAR(191) NOT NULL,
    `correctionVersion` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatAnchorCorrectionCommand_ownerDeviceId_idempotencyKey_key`(`ownerDeviceId`, `idempotencyKey`),
    INDEX `ChatAnchorCorrectionCommand_correctionId_idx`(`correctionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ChatDailyAnchorSource`
    ADD CONSTRAINT `ChatDailyAnchorSource_anchorBatchId_fkey`
    FOREIGN KEY (`anchorBatchId`) REFERENCES `ChatDailyAnchor`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ChatDailyAnchorSource_turnId_fkey`
    FOREIGN KEY (`turnId`) REFERENCES `ChatTurn`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ChatDailyAnchorSource_messageId_fkey`
    FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ChatAnchorCorrection`
    ADD CONSTRAINT `ChatAnchorCorrection_anchorBatchId_fkey`
    FOREIGN KEY (`anchorBatchId`) REFERENCES `ChatDailyAnchor`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ChatAnchorCorrectionCommand`
    ADD CONSTRAINT `ChatAnchorCorrectionCommand_correctionId_fkey`
    FOREIGN KEY (`correctionId`) REFERENCES `ChatAnchorCorrection`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
