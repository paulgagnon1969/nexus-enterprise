import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AddressService } from "./address.service";
import { AddressController } from "./address.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [AddressService],
  controllers: [AddressController],
})
export class AddressModule {}
