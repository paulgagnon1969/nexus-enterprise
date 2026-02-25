import { IsEmail, IsEnum, IsOptional, IsIn } from "class-validator";
import { Role } from "../../auth/auth.guards";

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsIn(["email", "sms", "share_link"])
  channel?: "email" | "sms" | "share_link";
}
