CREATE TABLE `DiscoveryStory` (
    `id` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `publicationStatus` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `authorDisplayName` VARCHAR(191) NOT NULL,
    `coverUri` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `likesEnabled` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DiscoveryStory_visible_latest_idx`(`publicationStatus`, `publishedAt`, `withdrawnAt`, `date`, `id`),
    INDEX `DiscoveryStory_ownerDeviceId_createdAt_idx`(`ownerDeviceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DiscoveryLike` (
    `storyId` VARCHAR(191) NOT NULL,
    `ownerDeviceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DiscoveryLike_ownerDeviceId_createdAt_idx`(`ownerDeviceId`, `createdAt`),
    PRIMARY KEY (`storyId`, `ownerDeviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DiscoveryLike`
ADD CONSTRAINT `DiscoveryLike_storyId_fkey`
FOREIGN KEY (`storyId`) REFERENCES `DiscoveryStory`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;
