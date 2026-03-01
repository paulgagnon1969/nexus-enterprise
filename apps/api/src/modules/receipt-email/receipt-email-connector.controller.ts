import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
} from "@nestjs/common";
import {
  ReceiptEmailConnectorService,
  CreateConnectorDto,
  UpdateConnectorDto,
} from "./receipt-email-connector.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("receipt-email-connectors")
export class ReceiptEmailConnectorController {
  constructor(private readonly service: ReceiptEmailConnectorService) {}

  @Get()
  async list(@Req() req: { user: AuthenticatedUser }) {
    return this.service.list(req.user);
  }

  @Get(":id")
  async getById(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
  ) {
    return this.service.getById(req.user, id);
  }

  @Post()
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Body() body: CreateConnectorDto,
  ) {
    return this.service.create(req.user, body);
  }

  @Patch(":id")
  async update(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
    @Body() body: UpdateConnectorDto,
  ) {
    return this.service.update(req.user, id, body);
  }

  @Delete(":id")
  async remove(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
  ) {
    return this.service.remove(req.user, id);
  }

  @Post(":id/test")
  async testConnection(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
  ) {
    return this.service.testConnection(req.user, id);
  }

  @Post(":id/poll")
  async triggerPoll(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
  ) {
    return this.service.triggerPoll(req.user, id);
  }
}
