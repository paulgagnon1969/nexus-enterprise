import { IsEnum, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateVjnDto {
  /** GCS URL of the voice recording */
  @IsString()
  voiceRecordingUrl!: string;

  /** Duration in seconds */
  @IsNumber()
  voiceDurationSecs!: number;

  /** On-device raw transcript (speech recognition output) */
  @IsOptional()
  @IsString()
  deviceTranscript?: string;

  /** Context hint for AI processing */
  @IsOptional()
  @IsString()
  contextHint?: "daily_log" | "journal" | "message" | "standalone";

  /** Optional project context */
  @IsOptional()
  @IsString()
  projectId?: string;

  /** ISO 639-1 language code (default "en"). Enables auto-translation. */
  @IsOptional()
  @IsString()
  language?: string;
}

export class ShareVjnDto {
  /** Target type: "daily_log" | "journal" | "message" */
  @IsString()
  target!: "daily_log" | "journal" | "message";

  /** Required for daily_log shares */
  @IsOptional()
  @IsString()
  projectId?: string;

  /** Required for journal shares */
  @IsOptional()
  @IsString()
  subjectUserId?: string;

  /** Required for message shares — thread ID or user ID to DM */
  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  recipientUserId?: string;
}

export class UpdateVjnDto {
  /** User-edited AI text */
  @IsOptional()
  @IsString()
  aiText?: string;

  /** User-edited AI summary */
  @IsOptional()
  @IsString()
  aiSummary?: string;
}
