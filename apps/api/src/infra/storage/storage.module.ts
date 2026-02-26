import { Module } from "@nestjs/common";

/**
 * StorageModule — provides file-storage helpers (GCS, local, etc.)
 * TODO: Add StorageService with upload / signed-URL logic.
 */
@Module({
  providers: [],
  exports: [],
})
export class StorageModule {}
