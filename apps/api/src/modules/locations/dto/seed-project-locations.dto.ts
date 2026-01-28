import { IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class SeedProjectLocationsDto {
  // How many warehouse zones to create under "Main Warehouse".
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  zonesCount?: number;

  // Optional upstream vendor names to seed (e.g., "Home Depot #123").
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  upstreamVendors?: string[];
}
