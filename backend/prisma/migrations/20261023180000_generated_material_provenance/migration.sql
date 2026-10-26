ALTER TABLE `MaterialPhoto`
  ADD COLUMN `generationRequestId` VARCHAR(191) NULL,
  ADD COLUMN `generationPrompt` TEXT NULL,
  ADD COLUMN `generationSource` VARCHAR(80) NULL;

CREATE UNIQUE INDEX `MaterialPhoto_ownerDeviceId_generationRequestId_key`
  ON `MaterialPhoto`(`ownerDeviceId`, `generationRequestId`);
