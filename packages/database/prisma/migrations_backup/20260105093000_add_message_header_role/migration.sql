-- Add MessageHeaderRole enum and headerRole column on MessageParticipant
CREATE TYPE "MessageHeaderRole" AS ENUM ('TO', 'CC', 'BCC');

ALTER TABLE "MessageParticipant"
ADD COLUMN "headerRole" "MessageHeaderRole" NOT NULL DEFAULT 'TO';
