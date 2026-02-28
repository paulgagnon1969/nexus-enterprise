import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { AnalyticsService } from "./analytics.service";

/**
 * Map NestJS controller route paths to TUCKS module + eventType.
 * Only routes listed here generate telemetry events. Unlisted routes
 * are silently ignored — keeps noise low and overhead near zero.
 */
const ROUTE_MAP: Record<string, { module: string; eventType: string }> = {
  // Daily Logs
  "POST /daily-logs":             { module: "daily_logs",  eventType: "RECORD_CREATE" },
  "PATCH /daily-logs":            { module: "daily_logs",  eventType: "RECORD_UPDATE" },
  "GET /daily-logs":              { module: "daily_logs",  eventType: "MODULE_OPEN" },

  // Projects
  "POST /projects":               { module: "projects",    eventType: "RECORD_CREATE" },
  "GET /projects":                 { module: "projects",    eventType: "MODULE_OPEN" },

  // Tasks
  "POST /tasks":                   { module: "tasks",       eventType: "RECORD_CREATE" },
  "PATCH /tasks":                  { module: "tasks",       eventType: "RECORD_UPDATE" },

  // Messaging
  "POST /messages":                { module: "messaging",   eventType: "RECORD_CREATE" },
  "POST /message-threads":         { module: "messaging",   eventType: "RECORD_CREATE" },
  "GET /message-threads":          { module: "messaging",   eventType: "MODULE_OPEN" },

  // Timecards
  "POST /timecards":               { module: "timecards",   eventType: "RECORD_CREATE" },
  "PATCH /timecards":              { module: "timecards",   eventType: "RECORD_UPDATE" },

  // Financial
  "POST /projects/*/invoices":     { module: "financial",   eventType: "RECORD_CREATE" },
  "POST /projects/*/payments":     { module: "financial",   eventType: "RECORD_CREATE" },
  "POST /projects/*/bills":        { module: "financial",   eventType: "RECORD_CREATE" },

  // Imports
  "POST /import-jobs":             { module: "imports",     eventType: "RECORD_CREATE" },

  // Voice Notes
  "POST /vjn":                     { module: "voice_notes", eventType: "RECORD_CREATE" },

  // Auth
  "POST /auth/login":              { module: "auth",        eventType: "LOGIN" },
};

/**
 * Match a request method+path against the route map.
 * Supports wildcards (*) for path segments like /projects/:id/invoices.
 */
function matchRoute(method: string, url: string): { module: string; eventType: string } | null {
  // Strip query string and trailing slash
  const path = url.split("?")[0].replace(/\/+$/, "");
  const key = `${method} ${path}`;

  // Exact match first
  if (ROUTE_MAP[key]) return ROUTE_MAP[key];

  // Wildcard match: replace path segments with * and try again
  const segments = path.split("/");
  for (let i = 1; i < segments.length; i++) {
    const wildcard = [...segments];
    wildcard[i] = "*";
    const wKey = `${method} ${wildcard.join("/")}`;
    if (ROUTE_MAP[wKey]) return ROUTE_MAP[wKey];
  }

  return null;
}

@Injectable()
export class ActivityTrackingInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method ?? "GET").toUpperCase();
    const url: string = req.url ?? req.raw?.url ?? "";
    const user = req.user as { userId?: string; companyId?: string } | undefined;

    // Only track authenticated requests that match a known route
    if (!user?.userId || !user?.companyId) {
      return next.handle();
    }

    const match = matchRoute(method, url);
    if (!match) {
      return next.handle();
    }

    // Fire-and-forget after response completes (on success only)
    return next.handle().pipe(
      tap(() => {
        void this.analytics.trackEvent({
          companyId: user.companyId!,
          userId: user.userId!,
          eventType: match.eventType,
          module: match.module,
          metadata: { path: url, method },
        });
      }),
    );
  }
}
