export class LandingConfigDto {
  logoUrl?: string | null;
  headline?: string | null;
  subheadline?: string | null;
}

export class UpsertLandingConfigDto {
  login?: LandingConfigDto | null;
  worker?: LandingConfigDto | null;
}