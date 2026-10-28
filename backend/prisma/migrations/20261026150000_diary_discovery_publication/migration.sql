ALTER TABLE `DiscoveryStory`
    ADD COLUMN `sourceDiaryId` VARCHAR(191) NULL,
    ADD COLUMN `sourceDiaryVersion` INTEGER NULL,
    ADD COLUMN `coverPhotoId` VARCHAR(191) NULL,
    ADD COLUMN `publicPhotoIds` JSON NULL,
    ADD COLUMN `publicContent` JSON NULL,
    ADD COLUMN `cityKey` VARCHAR(191) NOT NULL DEFAULT '',
    ADD UNIQUE INDEX `DiscoveryStory_sourceDiaryId_key`(`sourceDiaryId`),
    ADD INDEX `DiscoveryStory_visible_same_city_idx`(
        `publicationStatus`,
        `publishedAt`,
        `withdrawnAt`,
        `cityKey`,
        `date`,
        `id`
    );
