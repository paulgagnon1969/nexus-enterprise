import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AddressService } from "./address.service";

@Controller("address")
export class AddressController {
  constructor(private readonly address: AddressService) {}

  @UseGuards(JwtAuthGuard)
  @Get("zip-lookup")
  lookupZip(@Query("zip") zip: string) {
    return this.address.lookupZip(zip);
  }
}
