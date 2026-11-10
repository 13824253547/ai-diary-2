-- This account-system cutover intentionally removes all legacy anonymous records.
-- The one-time local media purge command must run before this schema replacement.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS
  `AppAttestRateLimit`,
  `AppAttestChallenge`,
  `AppAttestDevice`,
  `DiscoveryLike`,
  `DiscoveryStory`,
  `GenerationJob`,
  `SaveCommand`,
  `Draft`,
  `GrowthReportJob`,
  `GrowthInsightReport`,
  `GrowthMilestone`,
  `GrowthRecognitionRun`,
  `GrowthFlower`,
  `ChatAnchorCorrectionCommand`,
  `ChatAnchorCorrection`,
  `ChatDailyAnchorSource`,
  `ChatDailyAnchor`,
  `ChatMessage`,
  `ChatTurn`,
  `ChatConversation`,
  `AnchorCorrectionCommand`,
  `AnchorCorrection`,
  `DiaryAnchor`,
  `DiaryAnchorExtraction`,
  `DiaryPhotoCopy`,
  `MaterialPhotoQuota`,
  `MaterialPhoto`,
  `Diary`;
SET FOREIGN_KEY_CHECKS = 1;

-- CreateTable
CREATE TABLE `Diary` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL DEFAULT '',
    `date` DATETIME(3) NOT NULL,
    `publishedLocalDate` VARCHAR(10) NULL,
    `privacy` VARCHAR(191) NOT NULL,
    `photoIds` JSON NOT NULL,
    `publicBlockIds` JSON NULL,
    `contentSnapshot` JSON NULL,
    `version` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Diary_ownerUserId_date_idx`(`ownerUserId`, `date`),
    INDEX `Diary_ownerUserId_publishedLocalDate_idx`(`ownerUserId`, `publishedLocalDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `sourceAssetId` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(1024) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(80) NOT NULL,
    `size` INTEGER NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `date` VARCHAR(32) NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `generationRequestId` VARCHAR(191) NULL,
    `generationPrompt` TEXT NULL,
    `generationSource` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MaterialPhoto_ownerUserId_sourceAssetId_idx`(`ownerUserId`, `sourceAssetId`),
    INDEX `MaterialPhoto_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    UNIQUE INDEX `MaterialPhoto_ownerUserId_generationRequestId_key`(`ownerUserId`, `generationRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialPhotoQuota` (
    `ownerUserId` VARCHAR(191) NOT NULL,
    `photoCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`ownerUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiaryPhotoCopy` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
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

    INDEX `DiaryPhotoCopy_ownerUserId_diaryId_idx`(`ownerUserId`, `diaryId`),
    UNIQUE INDEX `DiaryPhotoCopy_ownerUserId_diaryId_photoId_key`(`ownerUserId`, `diaryId`, `photoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiaryAnchorExtraction` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
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

    INDEX `DiaryAnchorExtraction_ownerUserId_diaryId_status_idx`(`ownerUserId`, `diaryId`, `status`),
    UNIQUE INDEX `DiaryAnchorExtraction_ownerUserId_diaryId_diaryVersion_key`(`ownerUserId`, `diaryId`, `diaryVersion`),
    UNIQUE INDEX `DiaryAnchorExtraction_ownerUserId_requestId_key`(`ownerUserId`, `requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiaryAnchor` (
    `id` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `diaryId` VARCHAR(191) NOT NULL,
    `diaryVersion` INTEGER NOT NULL,
    `extractionId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `sourceBlockId` VARCHAR(191) NOT NULL,
    `sourceBlockIds` JSON NULL,
    `excerpt` LONGTEXT NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DiaryAnchor_ownerUserId_tagId_diaryVersion_idx`(`ownerUserId`, `tagId`, `diaryVersion`),
    INDEX `DiaryAnchor_ownerUserId_diaryId_diaryVersion_idx`(`ownerUserId`, `diaryId`, `diaryVersion`),
    UNIQUE INDEX `DiaryAnchor_extractionId_anchorId_key`(`extractionId`, `anchorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnchorCorrection` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `diaryId` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `sourceBlockId` VARCHAR(191) NOT NULL,
    `sourceDiaryVersion` INTEGER NOT NULL,
    `correction` LONGTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AnchorCorrection_ownerUserId_diaryId_sourceDiaryVersion_idx`(`ownerUserId`, `diaryId`, `sourceDiaryVersion`),
    UNIQUE INDEX `AnchorCorrection_owner_diary_anchor_version_key`(`ownerUserId`, `diaryId`, `anchorId`, `sourceDiaryVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnchorCorrectionCommand` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `correctionId` VARCHAR(191) NOT NULL,
    `correctionVersion` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AnchorCorrectionCommand_ownerUserId_idempotencyKey_key`(`ownerUserId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatConversation` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `nextTurnSequence` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatConversation_ownerUserId_updatedAt_idx`(`ownerUserId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatTurn` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
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
    `deviceLocalDate` VARCHAR(10) NULL,
    `memoryEligible` BOOLEAN NOT NULL DEFAULT false,
    `memoryAnchorBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ChatTurn_ownerUserId_conversationId_status_idx`(`ownerUserId`, `conversationId`, `status`),
    INDEX `ChatTurn_ownerUserId_memoryEligible_deviceLocalDate_status_idx`(`ownerUserId`, `memoryEligible`, `deviceLocalDate`, `status`),
    UNIQUE INDEX `ChatTurn_ownerUserId_conversationId_requestId_key`(`ownerUserId`, `conversationId`, `requestId`),
    UNIQUE INDEX `ChatTurn_conversationId_sequence_key`(`conversationId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `ChatMessage_conversationId_turnSequence_idx`(`conversationId`, `turnSequence`),
    UNIQUE INDEX `ChatMessage_conversationId_order_key`(`conversationId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatDailyAnchor` (
    `id` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
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
    INDEX `ChatDailyAnchor_ownerUserId_status_generatedAt_idx`(`ownerUserId`, `status`, `generatedAt`),
    UNIQUE INDEX `ChatDailyAnchor_ownerUserId_requestId_key`(`ownerUserId`, `requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatDailyAnchorSource` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `anchorBatchId` VARCHAR(191) NOT NULL,
    `turnId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `localDate` VARCHAR(10) NOT NULL,

    INDEX `ChatDailyAnchorSource_ownerUserId_messageId_idx`(`ownerUserId`, `messageId`),
    INDEX `ChatDailyAnchorSource_turnId_idx`(`turnId`),
    INDEX `ChatDailyAnchorSource_messageId_idx`(`messageId`),
    UNIQUE INDEX `ChatDailyAnchorSource_anchorBatchId_messageId_key`(`anchorBatchId`, `messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAnchorCorrection` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `anchorId` VARCHAR(191) NOT NULL,
    `anchorBatchId` VARCHAR(191) NOT NULL,
    `correction` LONGTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChatAnchorCorrection_anchorBatchId_key`(`anchorBatchId`),
    INDEX `ChatAnchorCorrection_ownerUserId_updatedAt_idx`(`ownerUserId`, `updatedAt`),
    UNIQUE INDEX `ChatAnchorCorrection_ownerUserId_anchorId_key`(`ownerUserId`, `anchorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAnchorCorrectionCommand` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `correctionId` VARCHAR(191) NOT NULL,
    `correctionVersion` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatAnchorCorrectionCommand_correctionId_idx`(`correctionId`),
    UNIQUE INDEX `ChatAnchorCorrectionCommand_ownerUserId_idempotencyKey_key`(`ownerUserId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrowthFlower` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `flowerKey` VARCHAR(32) NOT NULL,
    `summary` VARCHAR(240) NOT NULL,
    `sourceDiaryIds` JSON NOT NULL,
    `sourceDiaryVersions` JSON NOT NULL,
    `sourceHash` VARCHAR(191) NOT NULL,
    `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GrowthFlower_ownerUserId_awardedAt_idx`(`ownerUserId`, `awardedAt`),
    UNIQUE INDEX `GrowthFlower_ownerUserId_flowerKey_key`(`ownerUserId`, `flowerKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrowthRecognitionRun` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `runKey` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `sourceVersion` VARCHAR(191) NOT NULL,
    `sourceDiaryId` VARCHAR(191) NULL,
    `sourceDiaryVersion` INTEGER NULL,
    `sourceDiaryRefs` JSON NOT NULL,
    `batchResults` JSON NULL,
    `nextBatchIndex` INTEGER NOT NULL DEFAULT 0,
    `inFlightBatchIndex` INTEGER NULL,
    `batchCount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(24) NOT NULL,
    `failureCode` VARCHAR(48) NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GrowthRecognitionRun_ownerUserId_status_createdAt_idx`(`ownerUserId`, `status`, `createdAt`),
    UNIQUE INDEX `GrowthRecognitionRun_ownerUserId_runKey_key`(`ownerUserId`, `runKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrowthMilestone` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `milestoneId` VARCHAR(32) NOT NULL,
    `sourceDiaryIds` JSON NOT NULL,
    `achievedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GrowthMilestone_ownerUserId_achievedAt_idx`(`ownerUserId`, `achievedAt`),
    UNIQUE INDEX `GrowthMilestone_ownerUserId_milestoneId_key`(`ownerUserId`, `milestoneId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrowthInsightReport` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `sourceVersion` VARCHAR(191) NOT NULL,
    `sourceDiaryIds` JSON NOT NULL,
    `sourceDiaryVersions` JSON NOT NULL,
    `sourceDiaryCount` INTEGER NOT NULL,
    `dimensions` JSON NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GrowthInsightReport_ownerUserId_generatedAt_idx`(`ownerUserId`, `generatedAt`),
    UNIQUE INDEX `GrowthInsightReport_ownerUserId_sourceVersion_key`(`ownerUserId`, `sourceVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrowthReportJob` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `sourceVersion` VARCHAR(191) NOT NULL,
    `sourceDiaryRefs` JSON NOT NULL,
    `candidateDimensions` JSON NULL,
    `nextBatchIndex` INTEGER NOT NULL DEFAULT 0,
    `inFlightBatchIndex` INTEGER NULL,
    `batchCount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(24) NOT NULL,
    `failureCode` VARCHAR(48) NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GrowthReportJob_ownerUserId_status_createdAt_idx`(`ownerUserId`, `status`, `createdAt`),
    UNIQUE INDEX `GrowthReportJob_ownerUserId_requestId_key`(`ownerUserId`, `requestId`),
    UNIQUE INDEX `GrowthReportJob_ownerUserId_sourceVersion_key`(`ownerUserId`, `sourceVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Draft` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `sourceDiaryId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `characterId` VARCHAR(191) NOT NULL,
    `selectedPhotoIds` JSON NOT NULL,
    `privacy` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Draft_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaveCommand` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `sourceDiaryId` VARCHAR(191) NULL,
    `sourceDiaryVersion` INTEGER NULL,
    `diaryId` VARCHAR(191) NOT NULL,
    `savedVersion` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SaveCommand_ownerUserId_idempotencyKey_key`(`ownerUserId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GenerationJob` (
    `jobId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `draftVersion` INTEGER NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `stage` VARCHAR(191) NOT NULL,
    `progressPercent` INTEGER NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 1,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `retryable` BOOLEAN NULL,
    `inputSnapshot` JSON NULL,
    `progressMilestones` JSON NULL,
    `result` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GenerationJob_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    UNIQUE INDEX `GenerationJob_ownerUserId_idempotencyKey_key`(`ownerUserId`, `idempotencyKey`),
    PRIMARY KEY (`jobId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscoveryStory` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `sourceDiaryId` VARCHAR(191) NULL,
    `sourceDiaryVersion` INTEGER NULL,
    `publicationStatus` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `authorDisplayName` VARCHAR(191) NOT NULL,
    `coverUri` VARCHAR(191) NOT NULL,
    `coverPhotoId` VARCHAR(191) NULL,
    `publicPhotoIds` JSON NULL,
    `publicContent` JSON NULL,
    `date` DATETIME(3) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `cityKey` VARCHAR(191) NOT NULL DEFAULT '',
    `body` TEXT NOT NULL,
    `likesEnabled` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiscoveryStory_sourceDiaryId_key`(`sourceDiaryId`),
    INDEX `DiscoveryStory_visible_latest_idx`(`publicationStatus`, `publishedAt`, `withdrawnAt`, `date`, `id`),
    INDEX `DiscoveryStory_visible_same_city_idx`(`publicationStatus`, `publishedAt`, `withdrawnAt`, `cityKey`, `date`, `id`),
    INDEX `DiscoveryStory_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscoveryLike` (
    `storyId` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DiscoveryLike_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    PRIMARY KEY (`storyId`, `ownerUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAccount` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(32) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserAccount_username_key`(`username`),
    UNIQUE INDEX `UserAccount_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AccountSession_userId_key`(`userId`),
    INDEX `AccountSession_expiresAt_revokedAt_idx`(`expiresAt`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaptchaChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(16) NOT NULL,
    `targetX` INTEGER NOT NULL,
    `imageSeed` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaptchaChallenge_expiresAt_consumedAt_idx`(`expiresAt`, `consumedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `purpose` VARCHAR(16) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `codeHash` VARCHAR(64) NOT NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationChallenge_email_purpose_key`(`email`, `purpose`),
    INDEX `EmailVerificationChallenge_email_purpose_createdAt_idx`(`email`, `purpose`, `createdAt`),
    INDEX `EmailVerificationChallenge_ownerUserId_purpose_createdAt_idx`(`ownerUserId`, `purpose`, `createdAt`),
    INDEX `EmailVerificationChallenge_expiresAt_consumedAt_idx`(`expiresAt`, `consumedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthRateLimit` (
    `id` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuthRateLimit_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountDeletionJob` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `lastFailureCode` VARCHAR(48) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AccountDeletionJob_ownerUserId_key`(`ownerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DiaryAnchor` ADD CONSTRAINT `DiaryAnchor_extractionId_fkey` FOREIGN KEY (`extractionId`) REFERENCES `DiaryAnchorExtraction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatTurn` ADD CONSTRAINT `ChatTurn_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatDailyAnchorSource` ADD CONSTRAINT `ChatDailyAnchorSource_anchorBatchId_fkey` FOREIGN KEY (`anchorBatchId`) REFERENCES `ChatDailyAnchor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatDailyAnchorSource` ADD CONSTRAINT `ChatDailyAnchorSource_turnId_fkey` FOREIGN KEY (`turnId`) REFERENCES `ChatTurn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatDailyAnchorSource` ADD CONSTRAINT `ChatDailyAnchorSource_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAnchorCorrection` ADD CONSTRAINT `ChatAnchorCorrection_anchorBatchId_fkey` FOREIGN KEY (`anchorBatchId`) REFERENCES `ChatDailyAnchor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAnchorCorrectionCommand` ADD CONSTRAINT `ChatAnchorCorrectionCommand_correctionId_fkey` FOREIGN KEY (`correctionId`) REFERENCES `ChatAnchorCorrection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiscoveryLike` ADD CONSTRAINT `DiscoveryLike_storyId_fkey` FOREIGN KEY (`storyId`) REFERENCES `DiscoveryStory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountSession` ADD CONSTRAINT `AccountSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
