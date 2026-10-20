CREATE TABLE `ChatConversation` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `nextTurnSequence` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatConversation_ownerDeviceId_updatedAt_idx`(`ownerDeviceId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatTurn` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `userMessageId` VARCHAR(191) NOT NULL,
    `assistantMessageId` VARCHAR(191) NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL,
    `failureCode` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `providerRequestId` VARCHAR(191) NULL,
    `resultHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChatTurn_ownerDeviceId_conversationId_requestId_key`(`ownerDeviceId`, `conversationId`, `requestId`),
    UNIQUE INDEX `ChatTurn_conversationId_sequence_key`(`conversationId`, `sequence`),
    INDEX `ChatTurn_ownerDeviceId_conversationId_status_idx`(`ownerDeviceId`, `conversationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `turnSequence` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `text` LONGTEXT NOT NULL,
    `source` VARCHAR(191) NULL,
    `providerRequestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatMessage_conversationId_order_key`(`conversationId`, `order`),
    INDEX `ChatMessage_conversationId_turnSequence_idx`(`conversationId`, `turnSequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ChatTurn`
ADD CONSTRAINT `ChatTurn_conversationId_fkey`
FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChatMessage`
ADD CONSTRAINT `ChatMessage_conversationId_fkey`
FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
