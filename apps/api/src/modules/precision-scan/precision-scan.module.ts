import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { ComputeMeshModule } from '../compute-mesh/compute-mesh.module';
import { PrecisionScanController } from './precision-scan.controller';
import { PrecisionScanService } from './precision-scan.service';

@Module({
  imports: [PrismaModule, ComputeMeshModule],
  controllers: [PrecisionScanController],
  providers: [PrecisionScanService],
  exports: [PrecisionScanService],
})
export class PrecisionScanModule {}
