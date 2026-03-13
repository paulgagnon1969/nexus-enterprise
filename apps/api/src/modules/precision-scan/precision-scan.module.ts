import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { ComputeMeshModule } from '../compute-mesh/compute-mesh.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrecisionScanController } from './precision-scan.controller';
import { PrecisionScanService } from './precision-scan.service';

@Module({
  imports: [PrismaModule, ComputeMeshModule, NotificationsModule],
  controllers: [PrecisionScanController],
  providers: [PrecisionScanService],
  exports: [PrecisionScanService],
})
export class PrecisionScanModule {}
