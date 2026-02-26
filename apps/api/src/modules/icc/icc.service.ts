import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICCClient, ICCCode, ICCSearchParams } from '@repo/icc-client';

@Injectable()
export class IccService {
  private readonly logger = new Logger(IccService.name);
  private iccClient: ICCClient | null = null;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient() {
    const apiKey = this.configService.get<string>('ICC_API_KEY');
    const baseUrl = this.configService.get<string>('ICC_API_BASE_URL');

    if (!apiKey) {
      this.logger.warn(
        'ICC_API_KEY not configured. ICC integration will be disabled.'
      );
      return;
    }

    try {
      this.iccClient = new ICCClient({
        apiKey,
        baseUrl,
      });
      this.logger.log('ICC client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize ICC client', error);
    }
  }

  /**
   * Check if ICC integration is available
   */
  isEnabled(): boolean {
    return this.iccClient !== null;
  }

  /**
   * Search ICC building codes
   */
  async searchCodes(params: ICCSearchParams): Promise<ICCCode[]> {
    if (!this.iccClient) {
      throw new Error('ICC integration is not configured');
    }

    try {
      return await this.iccClient.searchCodes(params);
    } catch (error) {
      this.logger.error('Failed to search ICC codes', error);
      throw error;
    }
  }

  /**
   * Get a specific code by ID
   */
  async getCode(codeId: string): Promise<ICCCode> {
    if (!this.iccClient) {
      throw new Error('ICC integration is not configured');
    }

    try {
      return await this.iccClient.getCode(codeId);
    } catch (error) {
      this.logger.error(`Failed to get ICC code ${codeId}`, error);
      throw error;
    }
  }

  /**
   * Get applicable codes for a jurisdiction (e.g., state, city)
   */
  async getJurisdictionCodes(jurisdiction: string): Promise<ICCCode[]> {
    if (!this.iccClient) {
      throw new Error('ICC integration is not configured');
    }

    try {
      return await this.iccClient.getJurisdictionCodes(jurisdiction);
    } catch (error) {
      this.logger.error(
        `Failed to get jurisdiction codes for ${jurisdiction}`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate project compliance with ICC standards
   * @param projectData - Project specifications to validate
   */
  async validateCompliance(projectData: Record<string, any>): Promise<{
    compliant: boolean;
    violations: Array<{ code: string; description: string; severity: string }>;
    recommendations: string[];
  }> {
    if (!this.iccClient) {
      throw new Error('ICC integration is not configured');
    }

    try {
      return await this.iccClient.validateCompliance(projectData);
    } catch (error) {
      this.logger.error('Failed to validate project compliance', error);
      throw error;
    }
  }

  /**
   * Health check for ICC API
   */
  async healthCheck(): Promise<boolean> {
    if (!this.iccClient) {
      return false;
    }

    try {
      return await this.iccClient.healthCheck();
    } catch (error) {
      this.logger.error('ICC health check failed', error);
      return false;
    }
  }
}
