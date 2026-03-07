/** Create a new planning room */
export interface CreatePlanningRoomDto {
  name: string;
  description?: string;
  floorPlanUrl?: string;
  sourceType?: 'MANUAL' | 'ROOM_SCAN' | 'PLAN_SHEET' | 'PHOTO';
  sourceId?: string;
  /** Pre-populated dimensions from a room scan or LiDAR capture */
  extractedDimensions?: Record<string, any>;
  /** Which surface created this room */
  deviceOrigin?: 'WEB' | 'MOBILE' | 'DESKTOP';
}

/** Update a planning room */
export interface UpdatePlanningRoomDto {
  name?: string;
  description?: string;
  floorPlanUrl?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
}

/** Send a message in a planning room */
export interface SendMessageDto {
  content: string;
  deviceOrigin?: 'WEB' | 'MOBILE' | 'DESKTOP';
  /** If true, the API will generate an AI response after saving */
  triggerAi?: boolean;
}

/** Add a selection to a room */
export interface CreateSelectionDto {
  vendorProductId?: string;
  position: number;
  quantity?: number;
  notes?: string;
  customizations?: Record<string, any>;
}

/** Update a selection */
export interface UpdateSelectionDto {
  vendorProductId?: string;
  position?: number;
  quantity?: number;
  status?: 'PROPOSED' | 'APPROVED' | 'ORDERED' | 'DELIVERED' | 'INSTALLED' | 'REJECTED';
  notes?: string;
  customizations?: Record<string, any>;
}

/** Generate a selection sheet */
export interface GenerateSheetDto {
  /** Override title for the eDoc */
  title?: string;
}
