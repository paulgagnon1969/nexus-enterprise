import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { ConfigService } from "@nestjs/config";

/**
 * Compares two semver strings (e.g. "1.2.3" vs "1.3.0").
 * Returns true if `version` is at least `minVersion`.
 */
function semverGte(version: string, minVersion: string): boolean {
  const a = version.split(".").map(Number);
  const b = minVersion.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true; // equal
}

/**
 * Global interceptor that enforces minimum app versions for NexBridge Connect
 * (and optionally mobile). Reads `X-App-Version` and `X-App-Platform` headers.
 *
 * When the client version is below the minimum, returns 426 Upgrade Required
 * with a JSON body indicating the required version and a download URL.
 */
@Injectable()
export class AppVersionInterceptor implements NestInterceptor {
  private readonly minNexbridge: string;
  private readonly downloadUrl: string;

  constructor(private readonly config: ConfigService) {
    this.minNexbridge =
      this.config.get<string>("MIN_NEXBRIDGE_VERSION") || "1.0.0";
    this.downloadUrl =
      this.config.get<string>("NEXBRIDGE_DOWNLOAD_URL") ||
      "https://staging-ncc.nfsgrp.com/downloads";
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const platform = (request.headers["x-app-platform"] || "").toLowerCase();
    const version = request.headers["x-app-version"] || "";

    if (platform === "nexbridge" && version) {
      if (!semverGte(version, this.minNexbridge)) {
        throw new HttpException(
          {
            error: "UPDATE_REQUIRED",
            message: `NexBridge Connect ${this.minNexbridge} or later is required. Please update.`,
            minVersion: this.minNexbridge,
            currentVersion: version,
            downloadUrl: this.downloadUrl,
          },
          426,
        );
      }
    }

    return next.handle();
  }
}
