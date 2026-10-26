CREATE TABLE `AppAttestDevice` (
    `deviceId` VARCHAR(191) NOT NULL,
    `keyId` VARCHAR(191) NOT NULL,
    `publicKey` LONGTEXT NOT NULL,
    `signCount` INTEGER NOT NULL DEFAULT 0,
    `tokenVersion` INTEGER NOT NULL DEFAULT 1,
    `environment` VARCHAR(191) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AppAttestDevice_keyId_key`(`keyId`),
    INDEX `AppAttestDevice_revokedAt_updatedAt_idx`(`revokedAt`, `updatedAt`),
    PRIMARY KEY (`deviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AppAttestChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `challenge` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `keyId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `method` VARCHAR(191) NULL,
    `path` VARCHAR(191) NULL,
    `bodyHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AppAttestChallenge_challenge_key`(`challenge`),
    INDEX `AppAttestChallenge_expiresAt_consumedAt_idx`(`expiresAt`, `consumedAt`),
    INDEX `AppAttestChallenge_keyId_purpose_idx`(`keyId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AppAttestRateLimit` (
    `id` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AppAttestRateLimit_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
