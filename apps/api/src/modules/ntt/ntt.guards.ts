import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { NttService } from "./ntt.service";
import { canManageNttTicket, canReadNttTicket } from "./ntt.permissions";

@Injectable()
export class NttTicketReadGuard implements CanActivate {
  constructor(private readonly ntt: NttService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    const ticketId = req.params?.id as string | undefined;

    if (!user) throw new ForbiddenException("Missing auth user");
    if (!ticketId) throw new ForbiddenException("Missing NTT ticket id");

    const ticket = await this.ntt.findByIdOrThrow(ticketId);

    if (!canReadNttTicket(user, ticket)) {
      throw new NotFoundException("NTT ticket not found");
    }

    req.nttTicket = ticket;
    return true;
  }
}

@Injectable()
export class NttTicketManageGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;

    if (!user) throw new ForbiddenException("Missing auth user");
    if (!canManageNttTicket(user)) {
      throw new ForbiddenException("Insufficient permissions for NTT management");
    }

    return true;
  }
}
