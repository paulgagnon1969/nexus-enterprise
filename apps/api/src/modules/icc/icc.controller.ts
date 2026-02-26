import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IccService } from './icc.service';
import { JwtAuthGuard } from '../auth/auth.guards';
import { ICCSearchParams } from '@repo/icc-client';

@Controller('icc')
@UseGuards(JwtAuthGuard)
export class IccController {
  constructor(private readonly iccService: IccService) {}

  /**
   * Check if ICC integration is enabled
   * GET /icc/status
   */
  @Get('status')
  async getStatus() {
    return {
      enabled: this.iccService.isEnabled(),
      healthy: this.iccService.isEnabled()
        ? await this.iccService.healthCheck()
        : false,
    };
  }

  /**
   * Search ICC building codes
   * GET /icc/codes/search?query=...&jurisdiction=...&codeType=...&year=...
   */
  @Get('codes/search')
  async searchCodes(
    @Query('query') query?: string,
    @Query('jurisdiction') jurisdiction?: string,
    @Query('codeType') codeType?: string,
    @Query('year') year?: string
  ) {
    try {
      const params: ICCSearchParams = {
        query,
      };

      const codes = await this.iccService.searchCodes(params);
      return { codes };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Failed to search ICC codes',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get a specific ICC code by ID
   * GET /icc/codes/:id
   */
  @Get('codes/:id')
  async getCode(@Param('id') id: string) {
    try {
      const code = await this.iccService.getCode(id);
      return { code };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Failed to get ICC code',
        HttpStatus.NOT_FOUND
      );
    }
  }

  /**
   * Get applicable codes for a jurisdiction
   * GET /icc/jurisdictions/:jurisdiction/codes
   */
  @Get('jurisdictions/:jurisdiction/codes')
  async getJurisdictionCodes(@Param('jurisdiction') jurisdiction: string) {
    try {
      const codes = await this.iccService.getJurisdictionCodes(jurisdiction);
      return { jurisdiction, codes };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Failed to get jurisdiction codes',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Validate project compliance with ICC standards
   * POST /icc/compliance/validate
   * Body: { projectId: string, specifications: {...} }
   */
  @Post('compliance/validate')
  async validateCompliance(
    @Body() body: { projectId?: string; specifications: Record<string, any> }
  ) {
    try {
      const result = await this.iccService.validateCompliance(
        body.specifications
      );

      return {
        projectId: body.projectId,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Failed to validate compliance',
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
