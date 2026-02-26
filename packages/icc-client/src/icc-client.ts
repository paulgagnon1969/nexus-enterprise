import axios, { AxiosInstance } from 'axios';

export interface ICCClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

// ICC Code Connect API models
export interface ICCBook {
  shortCode: string;
  printing: string;
  uri: string[];
  title: string;
  accessStartDate: string | null;
  accessEndDate: string | null;
  childrenCount?: {
    chapters: number;
    frontmatter: number;
    backmatter: number;
    appendicies: number;
  };
}

export interface ICCBooksResponse {
  collections: ICCBook[];
}

export interface ICCSearchParams {
  query?: string;
  bookId?: string;
  section?: string;
}

export interface ICCSearchResult {
  sectionId: string;
  title: string;
  content: string;
  bookId: string;
}

// Legacy interface for compatibility
export interface ICCCode {
  id: string;
  name: string;
  jurisdiction: string;
  effectiveDate: string;
  version: string;
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
   * Get all books (building codes) assigned to client
   * @param withCount - Include chapter/section counts
   */
  async getBooks(withCount: boolean = false): Promise<ICCBooksResponse> {
    const response = await this.axios.get('/v1/books', {
      params: { with_count: withCount ? 1 : 0 },
    });
    return response.data;
  }

  /**
   * Get book structure (chapters, sections, etc.)
   * @param bookId - Short code (e.g., "IBC2021")
   */
  async getBookStructure(bookId: string): Promise<any> {
    const response = await this.axios.get(`/v1/books/${bookId}`);
    return response.data;
  }

  /**
   * Get content for a specific section
   * @param bookId - Short code (e.g., "IBC2021")
   * @param sectionId - Section identifier
   */
  async getSection(bookId: string, sectionId: string): Promise<any> {
    const response = await this.axios.get(`/v1/books/${bookId}/content/${sectionId}`);
    return response.data;
  }

  /**
   * Search within books
   * @param params - Search parameters
   */
  async search(params: ICCSearchParams): Promise<any> {
    const response = await this.axios.post('/v1/search', params);
    return response.data;
  }

  // Legacy methods for backward compatibility
  async searchCodes(params: ICCSearchParams): Promise<ICCCode[]> {
    const books = await this.getBooks();
    return books.collections.map(book => ({
      id: book.shortCode,
      name: book.title,
      jurisdiction: 'US', // ICC codes are US-based
      effectiveDate: book.accessStartDate || '',
      version: book.printing,
    }));
  }

  async getCode(codeId: string): Promise<ICCCode> {
    const books = await this.getBooks();
    const book = books.collections.find(b => b.shortCode === codeId);
    if (!book) throw new Error(`Book ${codeId} not found`);
    return {
      id: book.shortCode,
      name: book.title,
      jurisdiction: 'US',
      effectiveDate: book.accessStartDate || '',
      version: book.printing,
    };
  }

  async getJurisdictionCodes(jurisdiction: string): Promise<ICCCode[]> {
    // ICC codes apply to all US jurisdictions
    return this.searchCodes({});
  }

  async validateCompliance(projectData: Record<string, any>): Promise<{
    compliant: boolean;
    violations: Array<{ code: string; description: string; severity: string }>;
    recommendations: string[];
  }> {
    // ICC API doesn't provide compliance validation endpoint
    // This would need to be implemented as a separate service
    throw new Error('Compliance validation not implemented by ICC API');
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
