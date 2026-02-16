import { IsString, IsOptional, IsArray } from "class-validator";

export class CreatePublicationGroupDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  companyIds?: string[];
}

export class UpdatePublicationGroupDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateGroupMembersDto {
  @IsArray()
  companyIds!: string[];
}
