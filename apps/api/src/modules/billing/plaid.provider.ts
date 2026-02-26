import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export const PLAID_CLIENT = "PLAID_CLIENT";

export const PlaidProvider: Provider = {
  provide: PLAID_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): PlaidApi => {
    const clientId = config.get<string>("PLAID_CLIENT_ID") || "";
    const secret = config.get<string>("PLAID_SECRET") || "";
    const env = config.get<string>("PLAID_ENV") || "sandbox";

    if (!clientId || !secret) {
      console.warn("[billing] PLAID_CLIENT_ID or PLAID_SECRET not set – Plaid calls will fail");
    }

    const envMap: Record<string, string> = {
      sandbox: PlaidEnvironments.sandbox,
      development: PlaidEnvironments.development,
      production: PlaidEnvironments.production,
    };

    const configuration = new Configuration({
      basePath: envMap[env] || PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });

    return new PlaidApi(configuration);
  },
};
