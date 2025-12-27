import { IsEmail, IsEnum } from "class-validator";
import { Role } from "../../auth/auth.guards";

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;
}
