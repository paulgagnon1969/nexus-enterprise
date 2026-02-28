import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { RoomScanController } from './room-scan.controller';
import { RoomScanService } from './room-scan.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
  ],
  controllers: [RoomScanController],
  providers: [RoomScanService],
  exports: [RoomScanService],
})
export class RoomScanModule {}
