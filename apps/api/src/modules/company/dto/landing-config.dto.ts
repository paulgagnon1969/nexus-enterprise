export class LandingConfigDto {
  logoUrl?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  // Optional secondary image slot, used primarily by the worker apply page
  // for an additional GIF or banner. Kept generic so it can be reused for
  // login in the future if needed.
  secondaryLogoUrl?: string | null;
}

export class UpsertLandingConfigDto {
  login?: LandingConfigDto | null;
  worker?: LandingConfigDto | null;
}
