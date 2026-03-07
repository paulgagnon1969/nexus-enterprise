import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import type { SendMessageDto } from './dto';

@Injectable()
export class PlanningRoomService {
  private readonly logger = new Logger(PlanningRoomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listMessages(roomId: string, companyId: string) {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId },
    });
    if (!room) throw new NotFoundException('Planning room not found');

    return this.prisma.planningMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(
    roomId: string,
    companyId: string,
    actor: AuthenticatedUser,
    dto: SendMessageDto,
  ) {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId },
    });
    if (!room) throw new NotFoundException('Planning room not found');

    // Save user message
    const userMsg = await this.prisma.planningMessage.create({
      data: {
        roomId,
        role: 'USER',
        content: dto.content,
        deviceOrigin: dto.deviceOrigin ?? 'WEB',
        createdById: actor.userId,
      },
    });

    // If AI trigger is requested, generate an AI response
    // (Phase 2: OpenAI Vision integration for floor plan analysis)
    if (dto.triggerAi) {
      try {
        const aiResponse = await this.generateAiResponse(room, dto.content);
        const aiMsg = await this.prisma.planningMessage.create({
          data: {
            roomId,
            role: 'ASSISTANT',
            content: aiResponse.content,
            artifacts: aiResponse.artifacts ?? undefined,
            deviceOrigin: 'WEB',
          },
        });
        return { userMessage: userMsg, aiMessage: aiMsg };
      } catch (err: any) {
        this.logger.error(`AI response failed: ${err?.message}`, err?.stack);
        // Return user message even if AI fails
        return { userMessage: userMsg, aiMessage: null, error: err?.message };
      }
    }

    return { userMessage: userMsg };
  }

  /**
   * Generate an AI response for the planning room conversation.
   * Phase 2 will add OpenAI Vision integration for floor plan analysis.
   */
  private async generateAiResponse(
    room: any,
    userMessage: string,
  ): Promise<{ content: string; artifacts?: any[] }> {
    // Phase 2: Full OpenAI integration with floor plan analysis
    // For now, return a placeholder that acknowledges the message
    return {
      content: `I've received your layout request for "${room.name}". AI-assisted planning will be available in Phase 2. For now, you can manually add selections from the vendor catalog.`,
    };
  }
}
