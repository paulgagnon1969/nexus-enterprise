import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

export const STRIPE_CLIENT = "STRIPE_CLIENT";

export const StripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => {
    const secretKey = config.get<string>("STRIPE_SECRET_KEY");
    if (!secretKey) {
      console.warn("[billing] STRIPE_SECRET_KEY not set – Stripe calls will be disabled");
      return null;
    }
    return new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  },
};
