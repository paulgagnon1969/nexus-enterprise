import { IsString, IsNotEmpty } from 'class-validator';

export class OcrFileDto {
  @IsString()
  @IsNotEmpty()
  projectFileId!: string;
}
