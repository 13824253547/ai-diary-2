ALTER TABLE `MaterialPhoto`
  DROP INDEX `MaterialPhoto_ownerDeviceId_sourceAssetId_key`;

CREATE INDEX `MaterialPhoto_ownerDeviceId_sourceAssetId_idx`
  ON `MaterialPhoto`(`ownerDeviceId`, `sourceAssetId`);
