import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { RoomScanController } from './room-scan.controller';
import { RoomScanService } from './room-scan.service';
import { MulterModule } from '@nestjs/platform-express';
import * as multer from 'multer';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    MulterModule.register({ storage: multer.memoryStorage() }),
  ],
  controllers: [RoomScanController],
  providers: [RoomScanService],
  exports: [RoomScanService],
})
export class RoomScanModule {}
