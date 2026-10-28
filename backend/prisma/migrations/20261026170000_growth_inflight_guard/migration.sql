ALTER TABLE `GrowthRecognitionRun`
  ADD COLUMN `inFlightBatchIndex` INTEGER NULL;

ALTER TABLE `GrowthReportJob`
  ADD COLUMN `inFlightBatchIndex` INTEGER NULL;
