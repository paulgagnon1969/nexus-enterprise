import { IsOptional, IsString } from "class-validator";

export class CreateProjectPetlArchiveDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
