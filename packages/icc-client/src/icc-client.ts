import axios, { AxiosInstance } from 'axios';

export interface ICCClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface ICCCode {
  id: string;
  name: string;
  jurisdiction: string;
  effectiveDate: string;
  version: string;
}

export interface ICCSearchParams {
  query?: string;
  jurisdiction?: string;
  codeType?: string;
  year?: number;
}

/**
 * ICC (International Code Council) API Client
 * 
 * Provides type-safe access to ICC building codes, standards, and compliance data.
 * This is a wrapper around the auto-generated OpenAPI client with additional
 * error handling, authentication, and convenience methods.
 */
export class ICCClient {
  private axios: AxiosInstance;
  private config: ICCClientConfig;

  constructor(config: ICCClientConfig) {
    this.config = {
      baseUrl: config.baseUrl || process.env.ICC_API_BASE_URL || 'https://api.iccsafe.org',
      timeout: config.timeout || 30000,
      ...config,
    };

    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          
          if (status === 401) {
            throw new Error('ICC API authentication failed. Check your API key.');
          } else if (status === 403) {
            throw new Error('ICC API access forbidden. Verify subscription level.');
          } else if (status === 429) {
            throw new Error('ICC API rate limit exceeded. Retry later.');
          } else if (status >= 500) {
            throw new Error(`ICC API server error: ${data?.message || 'Unknown error'}`);
          }
          
          throw new Error(`ICC API error (${status}): ${data?.message || error.message}`);
        }
        
        throw new Error(`ICC API network error: ${error.message}`);
      }
    );
  }

  /**
   * Search ICC building codes by jurisdiction, type, or keywords
   */
  async searchCodes(params: ICCSearchParams): Promise<ICCCode[]> {
    const response = await this.axios.get('/codes/search', { params });
    return response.data;
  }

  /**
   * Get a specific code by ID
   */
  async getCode(codeId: string): Promise<ICCCode> {
    const response = await this.axios.get(`/codes/${codeId}`);
    return response.data;
  }

  /**
   * Validate if a project complies with ICC standards
   * @param projectData - Project specifications for compliance check
   */
  async validateCompliance(projectData: Record<string, any>): Promise<{
    compliant: boolean;
    violations: Array<{ code: string; description: string; severity: string }>;
    recommendations: string[];
  }> {
    const response = await this.axios.post('/compliance/validate', projectData);
    return response.data;
  }

  /**
   * Get applicable codes for a specific jurisdiction
   */
  async getJurisdictionCodes(jurisdiction: string): Promise<ICCCode[]> {
    const response = await this.axios.get('/jurisdictions', {
      params: { jurisdiction },
    });
    return response.data;
  }

  /**
   * Health check - verify API connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.axios.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Factory function to create ICC client from environment variables
 */
export function createICCClient(config?: Partial<ICCClientConfig>): ICCClient {
  const apiKey = config?.apiKey || process.env.ICC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ICC_API_KEY environment variable is required');
  }

  return new ICCClient({
    apiKey,
    ...config,
  });
}
