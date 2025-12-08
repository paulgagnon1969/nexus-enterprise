import { IsEmail, IsEnum, IsString } from "class-validator";
import { Role } from "@prisma/client";

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;
}
