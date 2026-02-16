import { Module } from "@nestjs/common";
import { SavedPhrasesController } from "./saved-phrases.controller";
import { SavedPhrasesService } from "./saved-phrases.service";

@Module({
  controllers: [SavedPhrasesController],
  providers: [SavedPhrasesService],
  exports: [SavedPhrasesService],
})
export class SavedPhrasesModule {}
