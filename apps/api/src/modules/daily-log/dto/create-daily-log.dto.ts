import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";

export enum DailyLogTypeDto {
  PUDL = 'PUDL',
  RECEIPT_EXPENSE = 'RECEIPT_EXPENSE',
  JSA = 'JSA',
  INCIDENT = 'INCIDENT',
  QUALITY = 'QUALITY',
  TADL = 'TADL',
  INVENTORY_MOVE = 'INVENTORY_MOVE',
  EQUIPMENT_USAGE = 'EQUIPMENT_USAGE',
}

export enum FulfillmentMethodDto {
  WILL_CALL = 'WILL_CALL',
  DELIVERY = 'DELIVERY',
  RETURN = 'RETURN',
  UNKNOWN = 'UNKNOWN',
}

export enum InventoryMoveTypeDto {
  DROP = 'DROP',
  PICKUP = 'PICKUP',
  TRANSFER = 'TRANSFER',
}

export class CreateDailyLogDto {
  @IsDateString()
  logDate!: string;

  @IsOptional()
  @IsEnum(DailyLogTypeDto)
  type?: DailyLogTypeDto;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  weatherSummary?: string | null;

  @IsOptional()
  weatherJson?: any;

  @IsOptional()
  @IsString()
  crewOnSite?: string | null;

  @IsOptional()
  @IsString()
  workPerformed?: string | null;

  @IsOptional()
  @IsString()
  issues?: string | null;

  @IsOptional()
  @IsString()
  safetyIncidents?: string | null;

  @IsOptional()
  @IsString()
  manpowerOnsite?: string | null;

  @IsOptional()
  @IsString()
  personOnsite?: string | null;

  @IsOptional()
  @IsString()
  confidentialNotes?: string | null;

  // Optional PETL context
  @IsOptional()
  @IsString()
  buildingId?: string | null;

  @IsOptional()
  @IsString()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  roomParticleId?: string | null;

  @IsOptional()
  @IsString()
  sowItemId?: string | null;

  @IsOptional()
  @IsBoolean()
  shareInternal?: boolean;

  @IsOptional()
  @IsBoolean()
  shareSubs?: boolean;

  @IsOptional()
  @IsBoolean()
  shareClient?: boolean;

  @IsOptional()
  @IsBoolean()
  sharePrivate?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notifyUserIds?: string[];

  // Receipt/expense fields (used when type = RECEIPT_EXPENSE)
  @IsOptional()
  @IsString()
  expenseVendor?: string | null;

  @IsOptional()
  @IsNumber()
  expenseAmount?: number | null;

  @IsOptional()
  @IsDateString()
  expenseDate?: string | null;

  // Fulfillment method for receipt purchases
  @IsOptional()
  @IsEnum(FulfillmentMethodDto)
  fulfillmentMethod?: FulfillmentMethodDto;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string | null;

  @IsOptional()
  @IsString()
  originLocationId?: string | null;

  // Device geolocation at receipt photo capture
  @IsOptional()
  @IsNumber()
  receiptCaptureLat?: number | null;

  @IsOptional()
  @IsNumber()
  receiptCaptureLng?: number | null;

  @IsOptional()
  @IsNumber()
  receiptCaptureGeoAccuracy?: number | null;

  // Inventory move fields (used when type = INVENTORY_MOVE)
  @IsOptional()
  @IsString()
  moveFromLocationId?: string | null;

  @IsOptional()
  @IsString()
  moveToLocationId?: string | null;

  @IsOptional()
  inventoryMoveItemsJson?: any;

  @IsOptional()
  @IsEnum(InventoryMoveTypeDto)
  moveType?: InventoryMoveTypeDto;

  // Equipment usage fields (used when type = EQUIPMENT_USAGE)
  // [{assetId, hours, meterType?, meterReading?, notes?}]
  @IsOptional()
  equipmentUsageJson?: any;

  // Structured personnel onsite (JSON array of PersonnelEntry)
  @IsOptional()
  personnelOnsiteJson?: any;

  // Source JSA log ID (for seeding personnel from a JSA)
  @IsOptional()
  @IsString()
  sourceJsaId?: string | null;

  // JSA safety notes (JSON — hazards, controls, PPE)
  @IsOptional()
  jsaSafetyJson?: any;

  // Voice/AI fields (used when creating from voice recording or VJN share)
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;

  @IsOptional()
  @IsString()
  voiceRecordingUrl?: string | null;

  @IsOptional()
  @IsNumber()
  voiceDurationSecs?: number | null;

  /** ISO 639-1 language code (default "en"). Triggers auto-translation. */
  @IsOptional()
  @IsString()
  language?: string;

  // Receipt line item exclusions: [{ ocrResultId, lineItemIndex }]
  @IsOptional()
  excludedLineItems?: Array<{ ocrResultId: string; lineItemIndex: number }>;

  // Flat credit/deduction applied to receipt total
  @IsOptional()
  @IsNumber()
  creditAmount?: number | null;

  // NexCART — receipt origin tracking
  @IsOptional()
  @IsString()
  receiptOrigin?: 'MANUAL' | 'SHOPPING_CART' | null;

  @IsOptional()
  @IsString()
  shoppingCartId?: string | null;

  // Optional: project file IDs to attach (triggers OCR if receipt type)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentProjectFileIds?: string[];
}
