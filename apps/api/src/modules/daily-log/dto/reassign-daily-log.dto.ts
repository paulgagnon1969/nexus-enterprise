import { IsString, IsNotEmpty } from "class-validator";

export class ReassignDailyLogDto {
  @IsString()
  @IsNotEmpty()
  targetProjectId!: string;
}
