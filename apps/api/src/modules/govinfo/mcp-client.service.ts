import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";

const RATE_LIMIT_KEY_PREFIX = "govinfo:mcp:ratelimit:";
const RATE_LIMIT_MAX = 20; // per user per hour
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const LOOKUP_CACHE_TTL = 1800; // 30 min for CFR section lookups

export interface McpQueryResult {
  answer: string;
  sources: Array<{ cfrRef: string; url: string }>;
  confidence: number;
  provider: string;
}

@Injectable()
export class McpClientService {
  private readonly logger = new Logger(McpClientService.name);
  private readonly mcpEndpoint: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.mcpEndpoint = this.config.get<string>("GOVINFO_MCP_ENDPOINT");
    this.apiKey = this.config.get<string>("GOVINFO_API_KEY");

    if (!this.mcpEndpoint) {
      this.logger.warn(
        "GOVINFO_MCP_ENDPOINT is not set — MCP regulatory assistant will be disabled. " +
          "Will fall back to local document search.",
      );
    }
  }

  /** Whether the MCP integration is configured. */
  isEnabled(): boolean {
    return !!this.mcpEndpoint;
  }

  /**
   * Ask a regulatory question. Routes to MCP if available, falls back to
   * local SystemDocument search.
   */
  async query(
    userId: string,
    question: string,
    context?: { cfrTitle?: number; cfrPart?: number },
  ): Promise<McpQueryResult> {
    // Rate limit
    await this.enforceRateLimit(userId);

    const startMs = Date.now();
    let result: McpQueryResult;

    try {
      if (this.mcpEndpoint) {
        result = await this.queryMcp(question, context);
      } else {
        result = await this.localFallback(question, context);
      }
    } catch (err: any) {
      // Log the failed query
      await this.logQuery(userId, question, context, null, startMs, false, err.message);
      throw err;
    }

    // Log successful query
    await this.logQuery(userId, question, context, result, startMs, true);

    return result;
  }

  /**
   * Direct CFR section lookup via MCP.
   * Cached in Redis for 30 minutes.
   */
  async lookupCfrSection(
    title: number,
    part: number,
    section: number,
  ): Promise<McpQueryResult | null> {
    const cacheKey = `govinfo:mcp:lookup:${title}-${part}-${section}`;
    const cached = await this.redis.getJson<McpQueryResult>(cacheKey);
    if (cached) return cached;

    if (!this.mcpEndpoint) return null;

    try {
      const result = await this.queryMcp(
        `What does ${title} CFR ${part}.${section} require?`,
        { cfrTitle: title, cfrPart: part },
      );

      await this.redis.setJson(cacheKey, result, LOOKUP_CACHE_TTL);
      return result;
    } catch (err: any) {
      this.logger.warn(`MCP lookup failed for ${title} CFR ${part}.${section}: ${err?.message}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // MCP Communication
  // -----------------------------------------------------------------------

  /** Send a query to the GPO MCP server. */
  private async queryMcp(
    question: string,
    context?: { cfrTitle?: number; cfrPart?: number },
  ): Promise<McpQueryResult> {
    if (!this.mcpEndpoint) {
      throw new Error("MCP endpoint not configured");
    }

    // The GPO MCP server expects a standard MCP tool-call format.
    // This may need adjustment once the public preview API is finalized.
    const body = {
      method: "tools/call",
      params: {
        name: "search_govinfo",
        arguments: {
          query: question,
          ...(context?.cfrTitle ? { cfrTitle: String(context.cfrTitle) } : {}),
          ...(context?.cfrPart ? { cfrPart: String(context.cfrPart) } : {}),
        },
      },
    };

    try {
      const res = await fetch(this.mcpEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-Api-Key": this.apiKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        this.logger.warn(`MCP server returned ${res.status}: ${errText.slice(0, 200)}`);
        // Fall back to local search
        return this.localFallback(question, context);
      }

      const data = await res.json() as any;

      // Parse MCP response into our standard format
      return this.parseMcpResponse(data);
    } catch (err: any) {
      this.logger.warn(`MCP query failed: ${err?.message ?? err}`);
      // Graceful fallback
      return this.localFallback(question, context);
    }
  }

  /** Parse MCP server response into our standard result format. */
  private parseMcpResponse(data: any): McpQueryResult {
    // The MCP response format may vary during public preview.
    // We try to extract a meaningful answer and sources.
    const content = data?.result?.content ?? data?.content ?? [];
    const textParts = Array.isArray(content)
      ? content.filter((c: any) => c.type === "text").map((c: any) => c.text)
      : [];

    const answer = textParts.join("\n\n") || "No answer available from the GovInfo MCP server.";

    // Try to extract CFR references as sources
    const sources: Array<{ cfrRef: string; url: string }> = [];
    const cfrPattern = /(\d{1,2})\s*CFR\s*(?:Part\s*)?(\d+(?:\.\d+)?)/gi;
    let match: RegExpExecArray | null;
    const seenRefs = new Set<string>();
    while ((match = cfrPattern.exec(answer)) !== null) {
      const ref = `${match[1]} CFR ${match[2]}`;
      if (!seenRefs.has(ref)) {
        seenRefs.add(ref);
        sources.push({
          cfrRef: ref,
          url: `https://www.ecfr.gov/current/title-${match[1]}/part-${match[2]}`,
        });
      }
    }

    return {
      answer,
      sources,
      confidence: textParts.length > 0 ? 0.8 : 0.3,
      provider: "govinfo-mcp",
    };
  }

  // -----------------------------------------------------------------------
  // Local Fallback (search synced SystemDocuments)
  // -----------------------------------------------------------------------

  /** Search local SystemDocument content when MCP is unavailable. */
  private async localFallback(
    question: string,
    context?: { cfrTitle?: number; cfrPart?: number },
  ): Promise<McpQueryResult> {
    // Build a simple keyword search against SystemDocument titles/descriptions
    const keywords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (keywords.length === 0) {
      return {
        answer: "Please provide a more specific question about regulatory requirements.",
        sources: [],
        confidence: 0,
        provider: "local-search",
      };
    }

    // Search documents matching any keyword in title/description
    const whereConditions: any[] = keywords.map((kw) => ({
      OR: [
        { title: { contains: kw, mode: "insensitive" } },
        { description: { contains: kw, mode: "insensitive" } },
      ],
    }));

    // Scope to relevant category if context provided
    const categoryFilter = context?.cfrTitle === 29
      ? { category: "Safety & Compliance" }
      : {};

    const docs = await this.prisma.systemDocument.findMany({
      where: {
        active: true,
        ...categoryFilter,
        AND: whereConditions.slice(0, 3), // Limit AND clauses to avoid perf issues
      },
      include: { currentVersion: { select: { htmlContent: true } } },
      take: 5,
      orderBy: { title: "asc" },
    });

    if (docs.length === 0) {
      return {
        answer:
          "No matching regulations found in the synced OSHA/EPA documents. " +
          "Try using more specific terms, or configure the GovInfo MCP server for broader search.",
        sources: [],
        confidence: 0.1,
        provider: "local-search",
      };
    }

    // Build a simple answer from matched documents
    const snippets = docs.map((d) => {
      const sectionMatch = d.code.match(/osha-\d+-(\d+)/);
      const sectionNum = sectionMatch ? sectionMatch[1] : "";
      return `• **${d.title}** ${d.description ? `— ${d.description}` : ""}`;
    });

    const sources = docs.map((d) => {
      const cfrMatch = d.title.match(/§(\d+\.\d+)/);
      return {
        cfrRef: cfrMatch ? `29 CFR ${cfrMatch[1]}` : d.code,
        url: `https://www.ecfr.gov/current/title-29/section-${cfrMatch?.[1] ?? ""}`,
      };
    });

    return {
      answer:
        `Found ${docs.length} relevant regulation${docs.length > 1 ? "s" : ""}:\n\n` +
        snippets.join("\n") +
        "\n\nNote: This is a local search result. Configure GOVINFO_MCP_ENDPOINT for AI-powered answers.",
      sources,
      confidence: 0.5,
      provider: "local-search",
    };
  }

  // -----------------------------------------------------------------------
  // Rate Limiting & Audit Logging
  // -----------------------------------------------------------------------

  /** Enforce per-user rate limit. Throws if exceeded. */
  private async enforceRateLimit(userId: string): Promise<void> {
    const key = `${RATE_LIMIT_KEY_PREFIX}${userId}`;
    const current = await this.redis.getJson<number>(key);
    const count = current ?? 0;

    if (count >= RATE_LIMIT_MAX) {
      throw new Error(
        `Rate limit exceeded: maximum ${RATE_LIMIT_MAX} queries per hour. Please try again later.`,
      );
    }

    await this.redis.setJson(key, count + 1, RATE_LIMIT_WINDOW);
  }

  /** Log a query to the audit table. */
  private async logQuery(
    userId: string,
    question: string,
    context: { cfrTitle?: number; cfrPart?: number } | undefined,
    result: McpQueryResult | null,
    startMs: number,
    wasSuccessful: boolean,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.prisma.regQueryLog.create({
        data: {
          userId,
          question,
          answer: result?.answer ?? null,
          sources: result?.sources ?? Prisma.JsonNull,
          contextJson: context ?? Prisma.JsonNull,
          durationMs: Date.now() - startMs,
          provider: result?.provider ?? "unknown",
          wasSuccessful,
          errorMessage: errorMessage ?? null,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log regulatory query: ${err?.message}`);
    }
  }
}
