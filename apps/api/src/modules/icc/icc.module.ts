import { Module } from '@nestjs/common';
import { IccController } from './icc.controller';
import { IccService } from './icc.service';

@Module({
  controllers: [IccController],
  providers: [IccService],
  exports: [IccService], // Export for use in other modules
})
export class IccModule {}
