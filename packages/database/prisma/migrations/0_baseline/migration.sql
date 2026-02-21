-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AccountLinkStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED', 'UNLINKED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "public"."AssetType" AS ENUM ('LABOR', 'MATERIAL', 'EQUIPMENT', 'TOOL', 'RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."AttachmentKind" AS ENUM ('INTERNAL_FILE', 'UPLOADED_FILE', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "public"."BidCostType" AS ENUM ('MATERIAL', 'LABOR', 'EQUIPMENT', 'ALL');

-- CreateEnum
CREATE TYPE "public"."BidItemAvailability" AS ENUM ('IN_STOCK', 'BACKORDERED', 'SPECIAL_ORDER', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "public"."BidItemSourceType" AS ENUM ('PETL', 'COMPONENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."BidRecipientStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'RESPONDED', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."BidRequestStatus" AS ENUM ('DRAFT', 'SENT', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."BidResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "public"."BillingMode" AS ENUM ('TIME_AND_MATERIAL', 'FIXED_FEE', 'INCLUDED_IN_SCOPE', 'NO_CHARGE');

-- CreateEnum
CREATE TYPE "public"."CandidateCertificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VALID', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."CandidateInterestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'HIRED');

-- CreateEnum
CREATE TYPE "public"."CandidateTrainingAttemptStatus" AS ENUM ('PASSED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "public"."CandidateTrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."CandidateVisibilityScope" AS ENUM ('TENANT_ONLY', 'GLOBAL_POOL', 'PRIVATE_TEST');

-- CreateEnum
CREATE TYPE "public"."ClaimJournalDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "public"."ClaimJournalEntryType" AS ENUM ('SUBMISSION', 'RESPONSE', 'CALL', 'EMAIL', 'MEETING', 'NOTE', 'APPROVAL', 'DENIAL', 'PARTIAL_APPROVAL');

-- CreateEnum
CREATE TYPE "public"."CompanyKind" AS ENUM ('SYSTEM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "public"."CompanyTrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "public"."CrossTenantInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."DailyLogStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."DailyLogType" AS ENUM ('PUDL', 'RECEIPT_EXPENSE', 'JSA', 'INCIDENT', 'QUALITY');

-- CreateEnum
CREATE TYPE "public"."DocumentScanJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."DocumentTemplateType" AS ENUM ('INVOICE', 'QUOTE', 'SOP', 'GENERIC');

-- CreateEnum
CREATE TYPE "public"."DocumentTypeGuess" AS ENUM ('LIKELY_PROCEDURE', 'LIKELY_POLICY', 'LIKELY_FORM', 'REFERENCE_DOC', 'UNLIKELY_PROCEDURE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."GlobalRole" AS ENUM ('NONE', 'SUPER_ADMIN', 'SUPPORT', 'NCC_SYSTEM_DEVELOPER');

-- CreateEnum
CREATE TYPE "public"."GoldenPriceUpdateSource" AS ENUM ('XACT_ESTIMATE', 'GOLDEN_PETL');

-- CreateEnum
CREATE TYPE "public"."HtmlConversionStatus" AS ENUM ('PENDING', 'CONVERTING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ImportJobType" AS ENUM ('XACT_RAW', 'XACT_COMPONENTS', 'PRICE_LIST', 'PRICE_LIST_COMPONENTS', 'XACT_COMPONENTS_ALLOCATE', 'BIA_LCP', 'COMPANY_PRICE_LIST', 'FORTIFIED_PAYROLL_ADMIN', 'PROJECT_PETL_PERCENT');

-- CreateEnum
CREATE TYPE "public"."InventoryItemType" AS ENUM ('ASSET', 'MATERIAL', 'PARTICLE');

-- CreateEnum
CREATE TYPE "public"."LocationType" AS ENUM ('SITE', 'BUILDING', 'WAREHOUSE', 'ZONE', 'AISLE', 'SHELF', 'BIN', 'PERSON', 'VIRTUAL', 'SUPPLIER', 'VENDOR', 'TRANSIT', 'LOGICAL');

-- CreateEnum
CREATE TYPE "public"."MaintenanceIntervalUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "public"."MaintenanceMeterType" AS ENUM ('HOURS', 'MILES', 'RUN_CYCLES', 'GENERATOR_HOURS');

-- CreateEnum
CREATE TYPE "public"."MaintenanceTodoStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MaintenanceTriggerStrategy" AS ENUM ('TIME_ONLY', 'METER_ONLY', 'TIME_OR_METER');

-- CreateEnum
CREATE TYPE "public"."ManualStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ManualVersionChangeType" AS ENUM ('INITIAL', 'DOCUMENT_ADDED', 'DOCUMENT_REMOVED', 'DOCUMENT_REORDERED', 'CHAPTER_ADDED', 'CHAPTER_REMOVED', 'CHAPTER_REORDERED', 'METADATA_UPDATED');

-- CreateEnum
CREATE TYPE "public"."MaterialRequirementStatus" AS ENUM ('PLANNED', 'DUE_SOON', 'LATE', 'ORDERED', 'RECEIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."MessageHeaderRole" AS ENUM ('TO', 'CC', 'BCC');

-- CreateEnum
CREATE TYPE "public"."MessageThreadType" AS ENUM ('DIRECT', 'BOARD', 'CUSTOMER', 'JOURNAL');

-- CreateEnum
CREATE TYPE "public"."NexNetSource" AS ENUM ('REFERRAL', 'PUBLIC_APPLY', 'MIGRATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "public"."NexNetStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'HIRED', 'REJECTED', 'TEST');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."NotificationKind" AS ENUM ('GENERIC', 'REFERRAL', 'ONBOARDING', 'PROJECT', 'SYSTEM', 'DIRECT_MESSAGE');

-- CreateEnum
CREATE TYPE "public"."NttStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "public"."NttSubjectType" AS ENUM ('APPLICATION_QUESTION', 'APPLICATION_FAILURE', 'UI_IMPROVEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."OcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."OnboardingDocumentType" AS ENUM ('PHOTO', 'GOV_ID', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'TEST');

-- CreateEnum
CREATE TYPE "public"."OrgInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ParcelStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETE');

-- CreateEnum
CREATE TYPE "public"."PersonalContactSource" AS ENUM ('UPLOAD', 'WINDOWS', 'MACOS', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "public"."PersonalContactSubjectType" AS ENUM ('CANDIDATE', 'WORKER');

-- CreateEnum
CREATE TYPE "public"."PetlActivity" AS ENUM ('REMOVE_AND_REPLACE', 'REMOVE', 'REPLACE', 'DETACH_AND_RESET', 'MATERIALS', 'REPAIR', 'INSTALL_ONLY');

-- CreateEnum
CREATE TYPE "public"."PetlPercentUpdateSessionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."PetlPercentUpdateTargetType" AS ENUM ('SOW_ITEM', 'RECON_ENTRY');

-- CreateEnum
CREATE TYPE "public"."PetlReconciliationCaseStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."PetlReconciliationEntryKind" AS ENUM ('NOTE_ONLY', 'CREDIT', 'ADD', 'CHANGE_ORDER_CLIENT_PAY', 'REIMBURSE_OWNER');

-- CreateEnum
CREATE TYPE "public"."PetlReconciliationEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."PetlReconciliationEntryTag" AS ENUM ('SUPPLEMENT', 'CHANGE_ORDER', 'OTHER', 'WARRANTY');

-- CreateEnum
CREATE TYPE "public"."PnpCategory" AS ENUM ('SAFETY', 'HR', 'OPERATIONS', 'COMPLIANCE', 'QUALITY', 'INSURANCE', 'GENERAL');

-- CreateEnum
CREATE TYPE "public"."PnpReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'MODIFIED_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."PriceListKind" AS ENUM ('GOLDEN', 'ACTIVE');

-- CreateEnum
CREATE TYPE "public"."ProjectBillLineItemAmountSource" AS ENUM ('MANUAL', 'TIMECARDS_DERIVED');

-- CreateEnum
CREATE TYPE "public"."ProjectBillLineItemKind" AS ENUM ('MATERIALS', 'LABOR', 'OTHER', 'EQUIPMENT', 'LABOR_AND_MATERIALS');

-- CreateEnum
CREATE TYPE "public"."ProjectBillStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "public"."ProjectInvoiceCategory" AS ENUM ('PETL', 'EXPENSE', 'HOURS');

-- CreateEnum
CREATE TYPE "public"."ProjectInvoiceLineItemKind" AS ENUM ('MANUAL', 'BILLABLE_HOURS', 'EQUIPMENT_RENTAL', 'COST_BOOK', 'OTHER', 'LABOR_ONLY', 'MATERIALS_ONLY', 'LABOR_AND_MATERIALS', 'CREDIT');

-- CreateEnum
CREATE TYPE "public"."ProjectInvoicePetlLineBillingTag" AS ENUM ('NONE', 'CHANGE_ORDER', 'SUPPLEMENT', 'WARRANTY', 'PETL_LINE_ITEM', 'CREDIT');

-- CreateEnum
CREATE TYPE "public"."ProjectInvoicePetlLineKind" AS ENUM ('BASE', 'ACV_HOLDBACK_CREDIT');

-- CreateEnum
CREATE TYPE "public"."ProjectInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "public"."ProjectParticipantScope" AS ENUM ('OWNER_MEMBER', 'COLLABORATOR_MEMBER', 'EXTERNAL_CONTACT');

-- CreateEnum
CREATE TYPE "public"."ProjectParticleType" AS ENUM ('ROOM', 'ZONE', 'EXTERIOR');

-- CreateEnum
CREATE TYPE "public"."ProjectPaymentMethod" AS ENUM ('WIRE', 'ACH', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ProjectPaymentStatus" AS ENUM ('RECORDED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."ProjectRole" AS ENUM ('OWNER', 'MANAGER', 'COLLABORATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "public"."ProjectVisibilityLevel" AS ENUM ('FULL', 'LIMITED', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "public"."PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."ReferralRelationshipType" AS ENUM ('PERSONAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "public"."ReferralStatus" AS ENUM ('INVITED', 'CONFIRMED', 'REJECTED', 'APPLIED', 'HIRED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ReputationDimension" AS ENUM ('OVERALL', 'SAFETY', 'PAYMENT', 'COMMUNICATION', 'QUALITY');

-- CreateEnum
CREATE TYPE "public"."ReputationModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."ReputationSourceType" AS ENUM ('EMPLOYER_ON_WORKER', 'WORKER_ON_EMPLOYER', 'CLIENT_ON_COMPANY', 'COMPANY_ON_CLIENT', 'MODERATOR_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."ReputationSubjectType" AS ENUM ('USER', 'COMPANY');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'CLIENT', 'EM');

-- CreateEnum
CREATE TYPE "public"."SavedPhraseCategory" AS ENUM ('INVOICE', 'BILL', 'DAILY_LOG', 'GENERAL');

-- CreateEnum
CREATE TYPE "public"."ShareLinkType" AS ENUM ('PUBLIC_URL', 'PRIVATE_LINK');

-- CreateEnum
CREATE TYPE "public"."StagedDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "public"."SupplierTagCategory" AS ENUM ('REGION', 'TRADE', 'SCOPE');

-- CreateEnum
CREATE TYPE "public"."SystemDocumentPublicationTarget" AS ENUM ('ALL_TENANTS', 'SINGLE_TENANT');

-- CreateEnum
CREATE TYPE "public"."TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "public"."TaxRateSource" AS ENUM ('TAPOUT_BASELINE', 'COMPANY_OVERRIDE');

-- CreateEnum
CREATE TYPE "public"."TenantDocumentStatus" AS ENUM ('UNRELEASED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."TransactionKind" AS ENUM ('PURCHASE', 'CONSUME', 'TRANSFER', 'RETURN', 'WASTE', 'TIME_PUNCH', 'MAINTENANCE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."UsageStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."UserType" AS ENUM ('INTERNAL', 'CLIENT', 'APPLICANT');

-- CreateTable
CREATE TABLE "public"."AccountLinkEvent" (
    "id" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "linkedEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verificationCode" TEXT,
    "verificationSentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "triggeredByInviteId" TEXT,
    "status" "public"."AccountLinkStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorGlobalRole" "public"."GlobalRole" NOT NULL,
    "action" TEXT NOT NULL,
    "targetCompanyId" TEXT,
    "targetUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "assetType" "public"."AssetType" NOT NULL,
    "baseUnit" TEXT,
    "baseRate" DECIMAL(12,4),
    "costBreakdown" JSONB,
    "attributes" JSONB,
    "isTrackable" BOOLEAN NOT NULL DEFAULT false,
    "isConsumable" BOOLEAN NOT NULL DEFAULT false,
    "priceListItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentLocationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maintLeadTimeDays" INTEGER,
    "maintMeterIntervalAmount" INTEGER,
    "maintMeterType" "public"."MaintenanceMeterType",
    "maintNotes" TEXT,
    "maintOwnerEmail" TEXT,
    "maintOwnerExternalId" TEXT,
    "maintTimeIntervalUnit" "public"."MaintenanceIntervalUnit",
    "maintTimeIntervalValue" INTEGER,
    "maintTriggerStrategy" "public"."MaintenanceTriggerStrategy",
    "maintenanceProfileCode" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumberOrVin" TEXT,
    "year" INTEGER,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssetMaintenanceRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerStrategy" "public"."MaintenanceTriggerStrategy" NOT NULL,
    "timeIntervalValue" INTEGER,
    "timeIntervalUnit" "public"."MaintenanceIntervalUnit",
    "meterType" "public"."MaintenanceMeterType",
    "meterIntervalAmount" INTEGER,
    "leadTimeDays" INTEGER,
    "defaultAssigneeRole" "public"."Role",
    "priority" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssetMaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "lastServiceDate" TIMESTAMP(3),
    "lastServiceMeter" INTEGER,
    "nextTimeDueAt" TIMESTAMP(3),
    "nextMeterDueAt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssetMaintenanceTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assetType" "public"."AssetType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssetMeterReading" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "meterType" "public"."MaintenanceMeterType" NOT NULL,
    "value" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetMeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssetTransaction" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "usageId" TEXT,
    "kind" "public"."TransactionKind" NOT NULL,
    "quantity" DECIMAL(12,4),
    "unit" TEXT,
    "unitCost" DECIMAL(12,4),
    "totalCost" DECIMAL(14,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssetUsage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sowItemId" TEXT,
    "dailyLogId" TEXT,
    "billingMode" "public"."BillingMode" NOT NULL,
    "status" "public"."UsageStatus" NOT NULL DEFAULT 'PLANNED',
    "quantity" DECIMAL(12,4),
    "unit" TEXT,
    "overrideRate" DECIMAL(12,4),
    "snapshotRate" DECIMAL(12,4),
    "snapshotCostBreakdown" JSONB,
    "actualCost" DECIMAL(14,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BidRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "public"."BidRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "filterConfig" JSONB,
    "sentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BidRequestItem" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "sourceType" "public"."BidItemSourceType" NOT NULL DEFAULT 'PETL',
    "sourceId" TEXT,
    "catSel" TEXT,
    "divisionCode" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "costType" "public"."BidCostType" NOT NULL DEFAULT 'ALL',
    "referenceUnitPrice" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BidRequestRecipient" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierContactId" TEXT,
    "accessToken" TEXT NOT NULL,
    "accessPin" TEXT NOT NULL,
    "pinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "public"."BidRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "emailMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidRequestRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BidResponse" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "public"."BidResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "submittedByName" TEXT,
    "submittedByEmail" TEXT,
    "submittedAt" TIMESTAMP(3),
    "csvUploadPath" TEXT,
    "csvUploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BidResponseItem" (
    "id" TEXT NOT NULL,
    "bidResponseId" TEXT NOT NULL,
    "bidRequestItemId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "totalPrice" DOUBLE PRECISION,
    "notes" TEXT,
    "leadTimeDays" INTEGER,
    "availability" "public"."BidItemAvailability",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidResponseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateCertification" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "certificationTypeId" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "public"."CandidateCertificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateCertificationDocument" (
    "id" TEXT NOT NULL,
    "candidateCertificationId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "CandidateCertificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateInterest" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requestingCompanyId" TEXT NOT NULL,
    "status" "public"."CandidateInterestStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "handledByUserId" TEXT,
    "baseHourlyRate" DOUBLE PRECISION,
    "cpFringeHourlyRate" DOUBLE PRECISION,
    "cpHourlyRate" DOUBLE PRECISION,
    "dayRate" DOUBLE PRECISION,
    "employmentEndDate" TIMESTAMP(3),
    "employmentStartDate" TIMESTAMP(3),

    CONSTRAINT "CandidateInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateMarketProfile" (
    "candidateId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "headline" TEXT,
    "skillsSummary" TEXT,
    "credentialsSummary" TEXT,
    "locationRegion" TEXT,
    "ratingNumeric" DOUBLE PRECISION,
    "ratingLabel" TEXT,
    "rateMin" DOUBLE PRECISION,
    "rateMax" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateMarketProfile_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "public"."CandidatePoolVisibility" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "visibleToCompanyId" TEXT,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "CandidatePoolVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateStatusDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CandidateStatusDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateTrainingAssignment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "trainingModuleId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."CandidateTrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateTrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CandidateTrainingAttempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "public"."CandidateTrainingAttemptStatus" NOT NULL,
    "score" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateTrainingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CarrierContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CatDivision" (
    "id" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "divisionCode" TEXT NOT NULL,

    CONSTRAINT "CatDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CertificationType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "issuingAuthority" TEXT,
    "defaultValidityMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequiredDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificateTemplateHtml" TEXT,

    CONSTRAINT "CertificationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClaimJournalAttachment" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "storageKey" TEXT NOT NULL,
    "storageUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "ClaimJournalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClaimJournalEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entryType" "public"."ClaimJournalEntryType" NOT NULL,
    "direction" "public"."ClaimJournalDirection" NOT NULL,
    "carrierContactId" TEXT,
    "actorNameOverride" TEXT,
    "actorOrgOverride" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "amountDisputed" DECIMAL(12,2),
    "amountApproved" DECIMAL(12,2),
    "amountDenied" DECIMAL(12,2),
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "correctsEntryId" TEXT,

    CONSTRAINT "ClaimJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientSkillRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "clientCompanyId" TEXT,
    "ratedByUserId" TEXT,
    "level" INTEGER NOT NULL,
    "levelLabel" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reputationOverallAvg" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "reputationOverallCount" INTEGER NOT NULL DEFAULT 0,
    "reputationOverallOverride" INTEGER,
    "kind" "public"."CompanyKind" NOT NULL DEFAULT 'ORGANIZATION',
    "templateId" TEXT,
    "templateVersionId" TEXT,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "trialStatus" "public"."CompanyTrialStatus",
    "defaultPayrollConfig" JSONB,
    "defaultTimeZone" TEXT,
    "deletedAt" TIMESTAMP(3),
    "workerInviteToken" TEXT,
    "defaultOPRate" DOUBLE PRECISION DEFAULT 0.20,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'US',
    "email" TEXT,
    "phone" TEXT,
    "postalCode" TEXT,
    "state" TEXT,
    "tagline" TEXT,
    "website" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "CompanyInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyInvoiceCounter" (
    "companyId" TEXT NOT NULL,
    "lastInvoiceNo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastDraftNo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompanyInvoiceCounter_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "public"."CompanyMembership" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "public"."Role" NOT NULL,
    "profileId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "public"."CompanyOffice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "payrollConfig" JSONB,

    CONSTRAINT "CompanyOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyPriceList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "basePriceListId" TEXT,
    "label" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "effectiveDate" TIMESTAMP(3),
    "currency" TEXT DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyPriceListItem" (
    "id" TEXT NOT NULL,
    "companyPriceListId" TEXT NOT NULL,
    "priceListItemId" TEXT,
    "canonicalKeyHash" TEXT,
    "lineNo" INTEGER,
    "groupCode" TEXT,
    "groupDescription" TEXT,
    "description" TEXT,
    "cat" TEXT,
    "sel" TEXT,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "coverage" TEXT,
    "activity" TEXT,
    "owner" TEXT,
    "sourceVendor" TEXT,
    "sourceDate" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastKnownUnitPrice" DOUBLE PRECISION,
    "lastPriceChangedAt" TIMESTAMP(3),
    "lastPriceChangedByUserId" TEXT,
    "lastPriceChangedSource" TEXT,
    "lastPriceChangedSourceImportJobId" TEXT,
    "workersWage" DOUBLE PRECISION,
    "laborBurden" DOUBLE PRECISION,
    "laborOverhead" DOUBLE PRECISION,
    "materialCost" DOUBLE PRECISION,
    "equipmentCost" DOUBLE PRECISION,
    "divisionCode" TEXT,
    "sourceProjectId" TEXT,
    "sourceEstimateVersionId" TEXT,

    CONSTRAINT "CompanyPriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanySystemTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "systemTagId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySystemTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyUnitCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUnitCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompensationClassificationMapping" (
    "id" TEXT NOT NULL,
    "cpRole" TEXT,
    "workerClassCode" TEXT,
    "socCode" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationClassificationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ComponentAllocationRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT,
    "componentCode" TEXT NOT NULL,
    "targetCategoryCode" TEXT,
    "targetActivity" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentAllocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ComponentSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "taxStatus" TEXT,
    "contractorSupplied" BOOLEAN,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "requestThirdPartyPricing" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrossTenantInvite" (
    "id" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "inviteeUserId" TEXT,
    "inviteeEmail" TEXT NOT NULL,
    "inviteePhone" TEXT,
    "token" TEXT NOT NULL,
    "tenantToken" TEXT,
    "inviterPeopleToken" TEXT NOT NULL,
    "inviteePeopleToken" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'MEMBER',
    "status" "public"."CrossTenantInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossTenantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "tagsJson" TEXT,
    "weatherSummary" TEXT,
    "crewOnSite" TEXT,
    "workPerformed" TEXT,
    "issues" TEXT,
    "safetyIncidents" TEXT,
    "manpowerOnsite" TEXT,
    "personOnsite" TEXT,
    "confidentialNotes" TEXT,
    "shareInternal" BOOLEAN NOT NULL DEFAULT true,
    "shareSubs" BOOLEAN NOT NULL DEFAULT false,
    "shareClient" BOOLEAN NOT NULL DEFAULT false,
    "sharePrivate" BOOLEAN NOT NULL DEFAULT false,
    "notifyUserIdsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "effectiveShareClient" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."DailyLogStatus" NOT NULL DEFAULT 'SUBMITTED',
    "buildingId" TEXT,
    "roomParticleId" TEXT,
    "sowItemId" TEXT,
    "unitId" TEXT,
    "isDelayedPublish" BOOLEAN NOT NULL DEFAULT false,
    "delayedById" TEXT,
    "delayedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expenseAmount" DECIMAL(12,2),
    "expenseDate" TIMESTAMP(3),
    "expenseVendor" TEXT,
    "sourceBillId" TEXT,
    "type" "public"."DailyLogType" NOT NULL DEFAULT 'PUDL',

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyLogAttachment" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectFileId" TEXT,

    CONSTRAINT "DailyLogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyLogRevision" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changesJson" TEXT NOT NULL,
    "previousValuesJson" TEXT NOT NULL,

    CONSTRAINT "DailyLogRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyTimeEntry" (
    "id" TEXT NOT NULL,
    "timecardId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "locationCode" TEXT,
    "stHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dtHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyTimecard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DevMigrationTest" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevMigrationTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Division" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentScanJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scanPath" TEXT NOT NULL,
    "status" "public"."DocumentScanJobStatus" NOT NULL DEFAULT 'PENDING',
    "documentsFound" INTEGER NOT NULL DEFAULT 0,
    "documentsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentShareLink" (
    "id" TEXT NOT NULL,
    "systemDocumentId" TEXT,
    "manualId" TEXT,
    "shareType" "public"."ShareLinkType" NOT NULL DEFAULT 'PRIVATE_LINK',
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "passcode" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientEmail" TEXT,
    "recipientName" TEXT,

    CONSTRAINT "DocumentShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "public"."DocumentTemplateType" NOT NULL DEFAULT 'GENERIC',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "html" TEXT NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmployerSkillRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ratedByUserId" TEXT,
    "level" INTEGER NOT NULL,
    "levelLabel" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EstimateVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "estimateKind" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "defaultPayerType" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "importedByUserId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FieldSecurityAuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "policyId" TEXT,
    "resourceKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "previousJson" JSONB,
    "newJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldSecurityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FieldSecurityPermission" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FieldSecurityPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FieldSecurityPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldSecurityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoldenPriceUpdateLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "estimateVersionId" TEXT,
    "userId" TEXT,
    "updatedCount" INTEGER NOT NULL,
    "avgDelta" DOUBLE PRECISION NOT NULL,
    "avgPercentDelta" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "public"."GoldenPriceUpdateSource" NOT NULL DEFAULT 'XACT_ESTIMATE',

    CONSTRAINT "GoldenPriceUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "type" "public"."ImportJobType" NOT NULL,
    "status" "public"."ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "csvPath" TEXT,
    "estimateVersionId" TEXT,
    "resultJson" JSONB,
    "errorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "completedChunks" INTEGER,
    "fileUri" TEXT,
    "metaJson" JSONB,
    "totalChunks" INTEGER,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemType" "public"."InventoryItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "movedByUserId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "internalLaborCost" DECIMAL(14,2),
    "metadata" JSONB,
    "transportCost" DECIMAL(14,2),

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryParticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentEntityType" TEXT NOT NULL,
    "parentEntityId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "virtualLocationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryParticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryPosition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemType" "public"."InventoryItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobStatus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "public"."LocationType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentLocationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceReviewSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "intervalValue" INTEGER NOT NULL,
    "intervalUnit" "public"."MaintenanceIntervalUnit" NOT NULL,
    "nextReviewAt" TIMESTAMP(3),
    "lastReviewAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceReviewSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceTodo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT,
    "scheduleId" TEXT,
    "ruleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."MaintenanceTodoStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "assignedToRole" "public"."Role",
    "priority" INTEGER,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Manual" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."ManualStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "publicSlug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publishToAllTenants" BOOLEAN NOT NULL DEFAULT false,
    "coverImageUrl" TEXT,
    "iconEmoji" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isNexusInternal" BOOLEAN NOT NULL DEFAULT false,
    "ownerCompanyId" TEXT,
    "requiredGlobalRoles" "public"."GlobalRole"[],

    CONSTRAINT "Manual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManualChapter" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManualDocument" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "chapterId" TEXT,
    "systemDocumentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "displayTitleOverride" TEXT,
    "addedInManualVersion" INTEGER NOT NULL,
    "removedInManualVersion" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "includeInToc" BOOLEAN NOT NULL DEFAULT true,
    "includeInPrint" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ManualDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManualTargetTag" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "systemTagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualTargetTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManualVersion" (
    "id" TEXT NOT NULL,
    "manualId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeType" "public"."ManualVersionChangeType" NOT NULL,
    "changeNotes" TEXT,
    "structureSnapshot" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaterialLot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "currentLocationId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderEmail" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedWithSubject" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "public"."AttachmentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "assetId" TEXT,
    "projectFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "headerRole" "public"."MessageHeaderRole" NOT NULL DEFAULT 'TO',
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageRecipientGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRecipientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageRecipientGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MessageRecipientGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "subject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "type" "public"."MessageThreadType" NOT NULL DEFAULT 'DIRECT',
    "subjectUserId" TEXT,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NameAlias" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NameAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NexNetCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "public"."NexNetSource" NOT NULL DEFAULT 'REFERRAL',
    "status" "public"."NexNetStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "isDeletedSoft" BOOLEAN NOT NULL DEFAULT false,
    "isHiddenFromDefaultViews" BOOLEAN NOT NULL DEFAULT false,
    "visibilityScope" "public"."CandidateVisibilityScope" NOT NULL DEFAULT 'TENANT_ONLY',

    CONSTRAINT "NexNetCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT,
    "kind" "public"."NotificationKind" NOT NULL DEFAULT 'GENERIC',
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NttTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "initiatorUserId" TEXT NOT NULL,
    "subjectType" "public"."NttSubjectType" NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."NttStatus" NOT NULL DEFAULT 'NEW',
    "severity" "public"."TaskPriority",
    "pagePath" TEXT,
    "pageLabel" TEXT,
    "contextJson" JSONB,
    "noteThreadId" TEXT,
    "primaryFaqId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "NttTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingBankInfo" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "accountHolderName" TEXT,
    "routingNumberMasked" TEXT,
    "accountNumberMasked" TEXT,
    "bankName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingBankInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingDocument" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "public"."OnboardingDocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingProfile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "dob" TIMESTAMP(3),

    CONSTRAINT "OnboardingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "public"."OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "checklistJson" TEXT,
    "assignedHiringManagerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "detailStatusCode" TEXT,
    "invitedByUserId" TEXT,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingSkillRating" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrgInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "public"."OrgInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "acceptedUserId" TEXT,
    "companyId" TEXT,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationModuleOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "configJson" JSONB,

    CONSTRAINT "OrganizationModuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "OrganizationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationTemplateArticle" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationTemplateArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationTemplateModule" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,

    CONSTRAINT "OrganizationTemplateModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationTemplateRolePermission" (
    "id" TEXT NOT NULL,
    "templateRoleProfileId" TEXT NOT NULL,
    "resourceCode" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canViewAll" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrganizationTemplateRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationTemplateRoleProfile" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrganizationTemplateRoleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "dayKey" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "OrganizationTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Parcel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parcelCode" TEXT,
    "status" "public"."ParcelStatus" NOT NULL DEFAULT 'PLANNED',
    "areaSqFt" DOUBLE PRECISION,
    "zoning" TEXT,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectParticleId" TEXT,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayrollWeekRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectCode" TEXT,
    "workerId" TEXT,
    "employeeId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "ssn" TEXT,
    "classCode" TEXT,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "employmentType" TEXT NOT NULL,
    "baseHourlyRate" DOUBLE PRECISION,
    "dayRate" DOUBLE PRECISION,
    "dayRateBaseHours" DOUBLE PRECISION,
    "totalPay" DOUBLE PRECISION NOT NULL,
    "totalHoursSt" DOUBLE PRECISION,
    "totalHoursOt" DOUBLE PRECISION,
    "totalHoursDt" DOUBLE PRECISION,
    "dailyHoursJson" JSONB,
    "weekCode" TEXT,

    CONSTRAINT "PayrollWeekRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermissionResource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PermissionResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PersonLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "PersonLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PersonalContact" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "public"."PersonalContactSource" NOT NULL DEFAULT 'UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allEmails" JSONB,
    "allPhones" JSONB,

    CONSTRAINT "PersonalContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PersonalContactLink" (
    "id" TEXT NOT NULL,
    "personalContactId" TEXT NOT NULL,
    "subjectType" "public"."PersonalContactSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "tenantId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalContactLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlEditChange" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlEditChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlEditSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ncc-petl-ui',
    "meta" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlEditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlPercentUpdate" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "targetType" "public"."PetlPercentUpdateTargetType" NOT NULL,
    "sowItemId" TEXT,
    "reconEntryId" TEXT,
    "oldPercent" DOUBLE PRECISION NOT NULL,
    "newPercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetlPercentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlPercentUpdateSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'field',
    "metaJson" JSONB,
    "status" "public"."PetlPercentUpdateSessionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "PetlPercentUpdateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlReconciliationAttachment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "projectFileId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetlReconciliationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlReconciliationCase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sowItemId" TEXT,
    "logicalItemId" TEXT,
    "noteThreadId" TEXT,
    "status" "public"."PetlReconciliationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlReconciliationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlReconciliationEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "parentSowItemId" TEXT,
    "projectParticleId" TEXT NOT NULL,
    "kind" "public"."PetlReconciliationEntryKind" NOT NULL DEFAULT 'NOTE_ONLY',
    "description" TEXT,
    "categoryCode" TEXT,
    "selectionCode" TEXT,
    "unit" TEXT,
    "qty" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "itemAmount" DOUBLE PRECISION,
    "salesTaxAmount" DOUBLE PRECISION,
    "opAmount" DOUBLE PRECISION,
    "rcvAmount" DOUBLE PRECISION,
    "rcvComponentsJson" JSONB,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPercentCompleteLocked" BOOLEAN NOT NULL DEFAULT false,
    "companyPriceListItemId" TEXT,
    "sourceSnapshotJson" JSONB,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tag" "public"."PetlReconciliationEntryTag",
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "status" "public"."PetlReconciliationEntryStatus" NOT NULL DEFAULT 'PENDING',
    "originEstimateVersionId" TEXT,
    "originSowItemId" TEXT,
    "originLineNo" INTEGER,
    "carriedForwardFromEntryId" TEXT,
    "carryForwardCount" INTEGER NOT NULL DEFAULT 0,
    "workersWage" DOUBLE PRECISION,
    "laborBurden" DOUBLE PRECISION,
    "laborOverhead" DOUBLE PRECISION,
    "materialCost" DOUBLE PRECISION,
    "equipmentCost" DOUBLE PRECISION,
    "activity" "public"."PetlActivity",
    "sourceActivity" TEXT,
    "isStandaloneChangeOrder" BOOLEAN NOT NULL DEFAULT false,
    "coSequenceNo" INTEGER,

    CONSTRAINT "PetlReconciliationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PetlReconciliationEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entryId" TEXT,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetlReconciliationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PnpDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "public"."PnpCategory" NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PnpDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PnpDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "releaseNotes" TEXT,
    "htmlContent" TEXT NOT NULL,
    "contentHash" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PnpDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceList" (
    "id" TEXT NOT NULL,
    "kind" "public"."PriceListKind" NOT NULL DEFAULT 'GOLDEN',
    "code" TEXT,
    "label" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "currency" TEXT DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceListComponent" (
    "id" TEXT NOT NULL,
    "priceListItemId" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "material" DOUBLE PRECISION,
    "labor" DOUBLE PRECISION,
    "equipment" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceListComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "lineNo" INTEGER,
    "groupCode" TEXT,
    "groupDescription" TEXT,
    "description" TEXT,
    "cat" TEXT,
    "sel" TEXT,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "coverage" TEXT,
    "activity" TEXT,
    "owner" TEXT,
    "sourceVendor" TEXT,
    "sourceDate" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastKnownUnitPrice" DOUBLE PRECISION,
    "canonicalKeyHash" TEXT,
    "divisionCode" TEXT,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT DEFAULT 'US',
    "createdByUserId" TEXT,
    "geocodedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "postalCode" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactName" TEXT,
    "primaryContactPhone" TEXT,
    "state" TEXT NOT NULL,
    "externalId" TEXT,
    "taxJurisdictionId" TEXT,
    "groupId" TEXT,
    "tenantClientId" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectBill" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "billNumber" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "public"."ProjectBillStatus" NOT NULL DEFAULT 'DRAFT',
    "memo" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "markupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceDailyLogId" TEXT,
    "targetInvoiceId" TEXT,

    CONSTRAINT "ProjectBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectBillAttachment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "projectFileId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBillAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectBillLineItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "kind" "public"."ProjectBillLineItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "amountSource" "public"."ProjectBillLineItemAmountSource" NOT NULL DEFAULT 'MANUAL',
    "amount" DOUBLE PRECISION NOT NULL,
    "timecardStartDate" TIMESTAMP(3),
    "timecardEndDate" TIMESTAMP(3),
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBillLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectBuilding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectCategoryAdjustment" (
    "id" TEXT NOT NULL,
    "regionalFactorsId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "activity" TEXT,
    "avgPriceVariance" DOUBLE PRECISION NOT NULL,
    "medianPriceVariance" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "laborAdjustment" DOUBLE PRECISION,
    "materialAdjustment" DOUBLE PRECISION,
    "equipmentAdjustment" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCategoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "folderId" TEXT,
    "storageUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "contentHash" TEXT,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectFileFolder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFileFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectFinancialSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "totalRcvClaim" DOUBLE PRECISION NOT NULL,
    "totalAcvClaim" DOUBLE PRECISION NOT NULL,
    "workCompleteRcv" DOUBLE PRECISION NOT NULL,
    "acvReturn" DOUBLE PRECISION NOT NULL,
    "opRate" DOUBLE PRECISION NOT NULL,
    "acvOP" DOUBLE PRECISION NOT NULL,
    "totalDueWorkBillable" DOUBLE PRECISION NOT NULL,
    "depositRate" DOUBLE PRECISION NOT NULL,
    "depositBaseline" DOUBLE PRECISION NOT NULL,
    "billedToDate" DOUBLE PRECISION NOT NULL,
    "duePayable" DOUBLE PRECISION NOT NULL,
    "dueAmount" DOUBLE PRECISION NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "clientName" TEXT,
    "gcName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "public"."ProjectInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceSequenceNo" INTEGER,
    "invoiceNo" TEXT,
    "billToName" TEXT,
    "billToEmail" TEXT,
    "memo" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" "public"."ProjectInvoiceCategory" NOT NULL DEFAULT 'PETL',
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "unlockHistory" JSONB,
    "draftSequenceNo" INTEGER,
    "billToAddress" TEXT,
    "billToCity" TEXT,
    "billToPhone" TEXT,
    "billToState" TEXT,
    "billToZip" TEXT,

    CONSTRAINT "ProjectInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectInvoiceApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceInvoiceId" TEXT NOT NULL,
    "targetInvoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvoiceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectInvoiceAttachment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "projectFileId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvoiceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectInvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kind" "public"."ProjectInvoiceLineItemKind" NOT NULL DEFAULT 'MANUAL',
    "companyPriceListItemId" TEXT,
    "billingTag" "public"."ProjectInvoicePetlLineBillingTag" NOT NULL DEFAULT 'NONE',
    "sourceBillId" TEXT,
    "unitCode" TEXT,

    CONSTRAINT "ProjectInvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectInvoicePetlLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "public"."ProjectInvoicePetlLineKind" NOT NULL DEFAULT 'BASE',
    "parentLineId" TEXT,
    "estimateVersionId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "logicalItemId" TEXT NOT NULL,
    "projectParticleId" TEXT NOT NULL,
    "projectParticleLabelSnapshot" TEXT,
    "projectUnitIdSnapshot" TEXT,
    "projectUnitLabelSnapshot" TEXT,
    "projectBuildingIdSnapshot" TEXT,
    "projectBuildingLabelSnapshot" TEXT,
    "projectTreePathSnapshot" TEXT,
    "lineNoSnapshot" INTEGER NOT NULL,
    "categoryCodeSnapshot" TEXT,
    "selectionCodeSnapshot" TEXT,
    "descriptionSnapshot" TEXT NOT NULL,
    "unitSnapshot" TEXT,
    "percentCompleteSnapshot" DOUBLE PRECISION NOT NULL,
    "contractItemAmount" DOUBLE PRECISION NOT NULL,
    "contractTaxAmount" DOUBLE PRECISION NOT NULL,
    "contractOpAmount" DOUBLE PRECISION NOT NULL,
    "contractTotal" DOUBLE PRECISION NOT NULL,
    "earnedItemAmount" DOUBLE PRECISION NOT NULL,
    "earnedTaxAmount" DOUBLE PRECISION NOT NULL,
    "earnedOpAmount" DOUBLE PRECISION NOT NULL,
    "earnedTotal" DOUBLE PRECISION NOT NULL,
    "prevBilledItemAmount" DOUBLE PRECISION NOT NULL,
    "prevBilledTaxAmount" DOUBLE PRECISION NOT NULL,
    "prevBilledOpAmount" DOUBLE PRECISION NOT NULL,
    "prevBilledTotal" DOUBLE PRECISION NOT NULL,
    "thisInvItemAmount" DOUBLE PRECISION NOT NULL,
    "thisInvTaxAmount" DOUBLE PRECISION NOT NULL,
    "thisInvOpAmount" DOUBLE PRECISION NOT NULL,
    "thisInvTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingTag" "public"."ProjectInvoicePetlLineBillingTag" NOT NULL DEFAULT 'NONE',
    "sourceLineNoSnapshot" INTEGER,
    "anchorGroupSubIndex" INTEGER,
    "anchorKind" TEXT,
    "anchorRootSourceLineNo" INTEGER,
    "anchorSubIndex" INTEGER,
    "displayLineNo" TEXT,

    CONSTRAINT "ProjectInvoicePetlLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectMembership" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "public"."ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" "public"."ProjectParticipantScope" NOT NULL DEFAULT 'OWNER_MEMBER',
    "visibility" "public"."ProjectVisibilityLevel" NOT NULL DEFAULT 'FULL',

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "public"."ProjectParticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT,
    "unitId" TEXT,
    "type" "public"."ProjectParticleType" NOT NULL DEFAULT 'ROOM',
    "name" TEXT NOT NULL,
    "fullLabel" TEXT NOT NULL,
    "externalGroupCode" TEXT,
    "externalGroupDescription" TEXT,
    "parentParticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectParticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" "public"."ProjectPaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "method" "public"."ProjectPaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectPaymentApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPaymentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectPetlArchive" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectFileId" TEXT NOT NULL,
    "sourceEstimateVersionId" TEXT NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "restoredEstimateVersionId" TEXT,
    "restoredByUserId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPetlArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectRegionalFactors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "aggregateTaxRate" DOUBLE PRECISION NOT NULL,
    "aggregateOPRate" DOUBLE PRECISION NOT NULL,
    "avgLaborRatio" DOUBLE PRECISION,
    "avgMaterialRatio" DOUBLE PRECISION,
    "avgEquipmentRatio" DOUBLE PRECISION,
    "totalItemAmount" DOUBLE PRECISION NOT NULL,
    "totalLineItems" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRegionalFactors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectScheduleChangeLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "scheduleTaskId" TEXT NOT NULL,
    "taskSyntheticId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousStartDate" TIMESTAMP(3),
    "previousEndDate" TIMESTAMP(3),
    "previousDurationDays" DOUBLE PRECISION,
    "newStartDate" TIMESTAMP(3),
    "newEndDate" TIMESTAMP(3),
    "newDurationDays" DOUBLE PRECISION,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectScheduleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectScheduleTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "syntheticId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "room" TEXT,
    "trade" TEXT NOT NULL,
    "phaseCode" INTEGER NOT NULL,
    "phaseLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" DOUBLE PRECISION NOT NULL,
    "totalLaborHours" DOUBLE PRECISION,
    "crewSize" INTEGER,
    "predecessorIds" JSONB,
    "projectUnitId" TEXT,
    "projectParticleId" TEXT,
    "orgGroupCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectScheduleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectTaxConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxZipCode" TEXT,
    "taxCity" TEXT,
    "taxState" TEXT,
    "learnedTaxRate" DOUBLE PRECISION,
    "learnedFromEstimateId" TEXT,
    "cachedStateTaxRate" DOUBLE PRECISION,
    "cachedCountyTaxRate" DOUBLE PRECISION,
    "cachedCityTaxRate" DOUBLE PRECISION,
    "taxRateSource" TEXT,
    "taxRateLastUpdated" TIMESTAMP(3),
    "taxRateConfidence" DOUBLE PRECISION,
    "manualTaxRateOverride" DOUBLE PRECISION,
    "useManualTaxRate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTaxConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectUnit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT,
    "externalCode" TEXT,
    "label" TEXT NOT NULL,
    "floor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PublicationGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PublicationGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawComponentRow" (
    "id" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "taxStatus" TEXT,
    "contractorSuppliedRaw" TEXT,
    "quantityRaw" TEXT,
    "unitRaw" TEXT,
    "unitPriceRaw" TEXT,
    "totalRaw" TEXT,
    "requestThirdPartyPricingRaw" TEXT,
    "rawRowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawComponentRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawXactRow" (
    "id" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "groupCode" TEXT,
    "groupDescription" TEXT,
    "desc" TEXT,
    "age" DOUBLE PRECISION,
    "condition" TEXT,
    "qty" DOUBLE PRECISION,
    "itemAmount" DOUBLE PRECISION,
    "reportedCost" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "unit" TEXT,
    "coverage" TEXT,
    "activity" TEXT,
    "workersWage" DOUBLE PRECISION,
    "laborBurden" DOUBLE PRECISION,
    "laborOverhead" DOUBLE PRECISION,
    "material" DOUBLE PRECISION,
    "equipment" DOUBLE PRECISION,
    "marketConditions" DOUBLE PRECISION,
    "laborMinimum" DOUBLE PRECISION,
    "salesTax" DOUBLE PRECISION,
    "rcv" DOUBLE PRECISION,
    "life" INTEGER,
    "depreciationType" TEXT,
    "depreciationAmount" DOUBLE PRECISION,
    "recoverable" BOOLEAN,
    "acv" DOUBLE PRECISION,
    "tax" DOUBLE PRECISION,
    "replaceFlag" BOOLEAN,
    "cat" TEXT,
    "sel" TEXT,
    "owner" TEXT,
    "originalVendor" TEXT,
    "sourceName" TEXT,
    "sourceDate" TIMESTAMP(3),
    "note1" TEXT,
    "adjSource" TEXT,
    "rawRowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawXactRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReaderGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReaderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReaderGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReaderGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptOcrResult" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT,
    "billId" TEXT,
    "projectFileId" TEXT NOT NULL,
    "status" "public"."OcrStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "vendorName" TEXT,
    "vendorAddress" TEXT,
    "receiptDate" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2),
    "taxAmount" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'USD',
    "paymentMethod" TEXT,
    "lineItemsJson" TEXT,
    "rawResponseJson" TEXT,
    "confidence" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptOcrResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "prospectName" TEXT,
    "prospectEmail" TEXT,
    "prospectPhone" TEXT,
    "token" TEXT NOT NULL,
    "candidateId" TEXT,
    "refereeUserId" TEXT,
    "referralConfirmedByReferee" BOOLEAN NOT NULL DEFAULT false,
    "referralConfirmedAt" TIMESTAMP(3),
    "referralRejectedByReferee" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."ReferralStatus" NOT NULL DEFAULT 'INVITED',
    "referralStartDate" TIMESTAMP(3),
    "referralEndDate" TIMESTAMP(3),
    "incentiveRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "personalContactId" TEXT,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReferralRelationship" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "refereeUserId" TEXT NOT NULL,
    "companyId" TEXT,
    "type" "public"."ReferralRelationshipType" NOT NULL,
    "referralId" TEXT,
    "companyInviteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReputationRating" (
    "id" TEXT NOT NULL,
    "subjectType" "public"."ReputationSubjectType" NOT NULL,
    "subjectUserId" TEXT,
    "subjectCompanyId" TEXT,
    "raterUserId" TEXT,
    "raterCompanyId" TEXT,
    "sourceType" "public"."ReputationSourceType" NOT NULL,
    "dimension" "public"."ReputationDimension" NOT NULL DEFAULT 'OVERALL',
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "moderationStatus" "public"."ReputationModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedByUserId" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReputationRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RolePermission" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canViewAll" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoleProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavedPhrase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "category" "public"."SavedPhraseCategory" NOT NULL DEFAULT 'GENERAL',
    "phrase" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SkillCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SkillDefinition" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tradeLabel" TEXT,

    CONSTRAINT "SkillDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SowComponentAllocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "componentSummaryId" TEXT,
    "code" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "allocationBasis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowComponentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SowItem" (
    "id" TEXT NOT NULL,
    "sowId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "rawRowId" TEXT NOT NULL,
    "logicalItemId" TEXT NOT NULL,
    "projectParticleId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "unitCost" DOUBLE PRECISION,
    "itemAmount" DOUBLE PRECISION,
    "rcvAmount" DOUBLE PRECISION,
    "acvAmount" DOUBLE PRECISION,
    "depreciationAmount" DOUBLE PRECISION,
    "salesTaxAmount" DOUBLE PRECISION,
    "categoryCode" TEXT,
    "selectionCode" TEXT,
    "activity" TEXT,
    "materialAmount" DOUBLE PRECISION,
    "equipmentAmount" DOUBLE PRECISION,
    "payerType" TEXT NOT NULL,
    "performed" BOOLEAN NOT NULL DEFAULT false,
    "eligibleForAcvRefund" BOOLEAN NOT NULL DEFAULT false,
    "acvRefundAmount" DOUBLE PRECISION,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isAcvOnly" BOOLEAN NOT NULL DEFAULT false,
    "originalQty" DOUBLE PRECISION,
    "qtyFieldNotes" TEXT,
    "qtyFieldReported" DOUBLE PRECISION,
    "qtyFieldReportedAt" TIMESTAMP(3),
    "qtyFieldReportedByUserId" TEXT,
    "qtyFlaggedIncorrect" BOOLEAN NOT NULL DEFAULT false,
    "qtyReviewStatus" TEXT,
    "sourceLineNo" INTEGER,
    "itemNote" TEXT,
    "isStandaloneChangeOrder" BOOLEAN NOT NULL DEFAULT false,
    "coSequenceNo" INTEGER,
    "coSourceLineNo" INTEGER,

    CONSTRAINT "SowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SowLogicalItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectParticleId" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowLogicalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StagedDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "breadcrumb" TEXT[],
    "fileType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT,
    "thumbnailUrl" TEXT,
    "status" "public"."StagedDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "importedAt" TIMESTAMP(3),
    "importedByUserId" TEXT,
    "importedToType" TEXT,
    "importedToCategory" TEXT,
    "displayTitle" TEXT,
    "displayDescription" TEXT,
    "oshaReference" TEXT,
    "sortOrder" INTEGER,
    "metadata" JSONB,
    "tags" TEXT[],
    "category" TEXT,
    "subcategory" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "revisionDate" TIMESTAMP(3),
    "revisionNotes" TEXT,
    "revisionHistory" JSONB,
    "documentTypeGuess" "public"."DocumentTypeGuess",
    "classificationScore" DOUBLE PRECISION,
    "classificationReason" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "textContent" TEXT,
    "originalPath" TEXT,
    "htmlContent" TEXT,
    "conversionStatus" "public"."HtmlConversionStatus",
    "conversionError" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StateOccupationalWage" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "socCode" TEXT NOT NULL,
    "occupationName" TEXT NOT NULL,
    "employment" INTEGER,
    "hourlyMean" DOUBLE PRECISION,
    "annualMean" DOUBLE PRECISION,
    "hourlyP10" DOUBLE PRECISION,
    "hourlyP25" DOUBLE PRECISION,
    "hourlyMedian" DOUBLE PRECISION,
    "hourlyP75" DOUBLE PRECISION,
    "hourlyP90" DOUBLE PRECISION,
    "annualP10" DOUBLE PRECISION,
    "annualP25" DOUBLE PRECISION,
    "annualMedian" DOUBLE PRECISION,
    "annualP75" DOUBLE PRECISION,
    "annualP90" DOUBLE PRECISION,
    "employmentPerThousand" DOUBLE PRECISION,
    "locationQuotient" DOUBLE PRECISION,

    CONSTRAINT "StateOccupationalWage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StateOccupationalWageSnapshot" (
    "id" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BLS_OES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StateOccupationalWageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'US',
    "defaultContactName" TEXT,
    "defaultContactEmail" TEXT,
    "defaultContactPhone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierTag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "public"."SupplierTagCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierTagAssignment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,
    "publicSlug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemDocumentPublication" (
    "id" TEXT NOT NULL,
    "systemDocumentId" TEXT NOT NULL,
    "systemDocumentVersionId" TEXT NOT NULL,
    "targetType" "public"."SystemDocumentPublicationTarget" NOT NULL,
    "targetCompanyId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT NOT NULL,
    "retractedAt" TIMESTAMP(3),
    "retractedByUserId" TEXT,

    CONSTRAINT "SystemDocumentPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemDocumentVersion" (
    "id" TEXT NOT NULL,
    "systemDocumentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "contentHash" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemTag" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TagAssignment" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "priority" "public"."TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "projectParticleId" TEXT,
    "createdByUserId" TEXT,
    "lastReminderAt" TIMESTAMP(3),
    "relatedEntityId" TEXT,
    "relatedEntityType" TEXT,
    "reminderIntervalMinutes" INTEGER,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaxJurisdiction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "state" TEXT NOT NULL,
    "county" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "postalPrefix" TEXT,
    "fedRate" DOUBLE PRECISION NOT NULL,
    "ficaRate" DOUBLE PRECISION NOT NULL,
    "medicareRate" DOUBLE PRECISION NOT NULL,
    "stateRate" DOUBLE PRECISION NOT NULL,
    "localRate" DOUBLE PRECISION NOT NULL,
    "representational" BOOLEAN NOT NULL DEFAULT true,
    "source" "public"."TaxRateSource" NOT NULL DEFAULT 'TAPOUT_BASELINE',
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxJurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantClient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "additionalEmails" JSONB,
    "additionalPhones" JSONB,
    "company" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "TenantClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantDocumentCopy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceSystemDocumentId" TEXT NOT NULL,
    "sourceVersionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "status" "public"."TenantDocumentStatus" NOT NULL DEFAULT 'UNRELEASED',
    "copiedByUserId" TEXT NOT NULL,
    "copiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "internalNotes" TEXT,
    "hasNewerSystemVersion" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantDocumentCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantDocumentCopyVersion" (
    "id" TEXT NOT NULL,
    "tenantDocumentCopyId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "contentHash" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDocumentCopyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantManualCopy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceManualId" TEXT NOT NULL,
    "sourceManualVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "public"."TenantDocumentStatus" NOT NULL DEFAULT 'UNRELEASED',
    "hasNewerSourceVersion" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "internalNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantManualCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantPnpDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "public"."PnpCategory" NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,
    "sourcePnpDocumentId" TEXT,
    "sourceVersionId" TEXT,
    "isFork" BOOLEAN NOT NULL DEFAULT false,
    "forkedAt" TIMESTAMP(3),
    "forkedByUserId" TEXT,
    "reviewStatus" "public"."PnpReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantPnpDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantPnpDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "notes" TEXT,
    "htmlContent" TEXT NOT NULL,
    "contentHash" TEXT,
    "disclaimerHtml" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPnpDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantPriceUpdateLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyPriceListId" TEXT NOT NULL,
    "companyPriceListItemId" TEXT NOT NULL,
    "canonicalKeyHash" TEXT,
    "oldUnitPrice" DOUBLE PRECISION,
    "newUnitPrice" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sourceImportJobId" TEXT,
    "projectId" TEXT,
    "estimateVersionId" TEXT,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPriceUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TimecardEditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timecardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "oldWorkerId" TEXT NOT NULL,
    "newWorkerId" TEXT NOT NULL,
    "locationCode" TEXT,
    "oldStHours" DOUBLE PRECISION NOT NULL,
    "oldOtHours" DOUBLE PRECISION NOT NULL,
    "oldDtHours" DOUBLE PRECISION NOT NULL,
    "newStHours" DOUBLE PRECISION NOT NULL,
    "newOtHours" DOUBLE PRECISION NOT NULL,
    "newDtHours" DOUBLE PRECISION NOT NULL,
    "editedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimecardEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrainingModule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequiredDefault" BOOLEAN NOT NULL DEFAULT false,
    "externalLmsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "globalRole" "public"."GlobalRole" NOT NULL DEFAULT 'NONE',
    "userType" "public"."UserType" NOT NULL DEFAULT 'INTERNAL',
    "reputationOverallAvg" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "reputationOverallCount" INTEGER NOT NULL DEFAULT 0,
    "reputationOverallOverride" INTEGER,
    "firstName" TEXT,
    "lastName" TEXT,
    "profileCompletionPercent" INTEGER NOT NULL DEFAULT 10,
    "profileCompletionUpdatedAt" TIMESTAMP(3),
    "profileReminderLastSentAt" TIMESTAMP(3),
    "profileReminderStartAt" TIMESTAMP(3),
    "syncToken" TEXT,
    "peopleToken" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserEmailAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkEventId" TEXT,

    CONSTRAINT "UserEmailAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPortfolio" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPortfolioHr" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "encryptedJson" BYTEA NOT NULL,
    "ssnLast4" TEXT,
    "itinLast4" TEXT,
    "bankAccountLast4" TEXT,
    "bankRoutingLast4" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPortfolioHr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSkillRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "selfLevel" INTEGER NOT NULL,
    "selfLevelLabel" TEXT,
    "yearsExperience" INTEGER,
    "notes" TEXT,
    "employerAvgLevel" DOUBLE PRECISION,
    "employerRatingCount" INTEGER,
    "adminOverrideLevel" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientAvgLevel" DOUBLE PRECISION,
    "clientRatingCount" INTEGER,

    CONSTRAINT "UserSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSkillSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "categoryLabel" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSkillSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Worker" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "ssnHash" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "gender" TEXT,
    "ethnicity" TEXT,
    "primaryClassCode" TEXT,
    "defaultProjectCode" TEXT,
    "dateHired" TIMESTAMP(3),
    "status" TEXT,
    "isForeman" BOOLEAN NOT NULL DEFAULT false,
    "defaultPayRate" DOUBLE PRECISION,
    "unionLocal" TEXT,
    "firstSeenWeekEnd" TIMESTAMP(3),
    "lastSeenWeekEnd" TIMESTAMP(3),
    "totalHoursCbs" DOUBLE PRECISION DEFAULT 0,
    "totalHoursCct" DOUBLE PRECISION DEFAULT 0,
    "notes" TEXT,
    "billRate" DOUBLE PRECISION,
    "cpRate" DOUBLE PRECISION,
    "cpRole" TEXT,
    "cpFringeRate" DOUBLE PRECISION,
    "defaultHoursPerDay" DOUBLE PRECISION DEFAULT 10,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkerWeek" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "projectCode" TEXT NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "totalHoursSt" DOUBLE PRECISION,
    "totalHoursOt" DOUBLE PRECISION,
    "sourceFile" TEXT,

    CONSTRAINT "WorkerWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_MessageToMessageParticipant" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MessageToMessageParticipant_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AccountLinkEvent_email_idx" ON "public"."AccountLinkEvent"("linkedEmail" ASC);

-- CreateIndex
CREATE INDEX "AccountLinkEvent_phone_idx" ON "public"."AccountLinkEvent"("phone" ASC);

-- CreateIndex
CREATE INDEX "AccountLinkEvent_primary_user_idx" ON "public"."AccountLinkEvent"("primaryUserId" ASC);

-- CreateIndex
CREATE INDEX "AccountLinkEvent_status_created_idx" ON "public"."AccountLinkEvent"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AccountLinkEvent_triggeredByInviteId_key" ON "public"."AccountLinkEvent"("triggeredByInviteId" ASC);

-- CreateIndex
CREATE INDEX "Asset_companyId_currentLocationId_idx" ON "public"."Asset"("companyId" ASC, "currentLocationId" ASC);

-- CreateIndex
CREATE INDEX "Asset_company_type_idx" ON "public"."Asset"("companyId" ASC, "assetType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AssetMaintenanceSchedule_assetId_ruleId_key" ON "public"."AssetMaintenanceSchedule"("assetId" ASC, "ruleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AssetMaintenanceTemplate_companyId_code_key" ON "public"."AssetMaintenanceTemplate"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "AssetMeterReading_assetId_meterType_recordedAt_idx" ON "public"."AssetMeterReading"("assetId" ASC, "meterType" ASC, "recordedAt" ASC);

-- CreateIndex
CREATE INDEX "AssetTransaction_asset_created_idx" ON "public"."AssetTransaction"("assetId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AssetTransaction_company_created_idx" ON "public"."AssetTransaction"("companyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AssetUsage_asset_status_idx" ON "public"."AssetUsage"("assetId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "AssetUsage_company_project_idx" ON "public"."AssetUsage"("companyId" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "BidRequest_company_project_idx" ON "public"."BidRequest"("companyId" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "BidRequest_company_status_due_idx" ON "public"."BidRequest"("companyId" ASC, "status" ASC, "dueDate" ASC);

-- CreateIndex
CREATE INDEX "BidRequest_project_status_idx" ON "public"."BidRequest"("projectId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "BidRequestItem_request_sort_idx" ON "public"."BidRequestItem"("bidRequestId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "BidRecipient_request_status_idx" ON "public"."BidRequestRecipient"("bidRequestId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BidRecipient_request_supplier_key" ON "public"."BidRequestRecipient"("bidRequestId" ASC, "supplierId" ASC);

-- CreateIndex
CREATE INDEX "BidRecipient_supplier_idx" ON "public"."BidRequestRecipient"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "BidRecipient_token_idx" ON "public"."BidRequestRecipient"("accessToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BidRequestRecipient_accessToken_key" ON "public"."BidRequestRecipient"("accessToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BidResponse_recipient_key" ON "public"."BidResponse"("recipientId" ASC);

-- CreateIndex
CREATE INDEX "BidResponse_request_status_idx" ON "public"."BidResponse"("bidRequestId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "BidResponse_supplier_idx" ON "public"."BidResponse"("supplierId" ASC);

-- CreateIndex
CREATE INDEX "BidResponseItem_response_idx" ON "public"."BidResponseItem"("bidResponseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BidResponseItem_response_item_key" ON "public"."BidResponseItem"("bidResponseId" ASC, "bidRequestItemId" ASC);

-- CreateIndex
CREATE INDEX "CandidateCertification_candidate_idx" ON "public"."CandidateCertification"("candidateId" ASC);

-- CreateIndex
CREATE INDEX "CandidateCertification_type_idx" ON "public"."CandidateCertification"("certificationTypeId" ASC);

-- CreateIndex
CREATE INDEX "CandidateCertDocument_cert_idx" ON "public"."CandidateCertificationDocument"("candidateCertificationId" ASC);

-- CreateIndex
CREATE INDEX "CandidateInterest_candidate_idx" ON "public"."CandidateInterest"("candidateId" ASC);

-- CreateIndex
CREATE INDEX "CandidateInterest_requesting_company_idx" ON "public"."CandidateInterest"("requestingCompanyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateMarketProfile_publicId_key" ON "public"."CandidateMarketProfile"("publicId" ASC);

-- CreateIndex
CREATE INDEX "CandidatePoolVisibility_candidate_idx" ON "public"."CandidatePoolVisibility"("candidateId" ASC);

-- CreateIndex
CREATE INDEX "CandidatePoolVisibility_visible_company_idx" ON "public"."CandidatePoolVisibility"("visibleToCompanyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateStatusDefinition_companyId_code_key" ON "public"."CandidateStatusDefinition"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "CandidateTrainingAssignment_candidate_idx" ON "public"."CandidateTrainingAssignment"("candidateId" ASC);

-- CreateIndex
CREATE INDEX "CandidateTrainingAssignment_training_idx" ON "public"."CandidateTrainingAssignment"("trainingModuleId" ASC);

-- CreateIndex
CREATE INDEX "CandidateTrainingAttempt_assignment_idx" ON "public"."CandidateTrainingAttempt"("assignmentId" ASC);

-- CreateIndex
CREATE INDEX "CarrierContact_company_active_idx" ON "public"."CarrierContact"("companyId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "CarrierContact_company_carrier_idx" ON "public"."CarrierContact"("companyId" ASC, "carrierName" ASC);

-- CreateIndex
CREATE INDEX "CarrierContact_company_idx" ON "public"."CarrierContact"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CatDivision_cat_key" ON "public"."CatDivision"("cat" ASC);

-- CreateIndex
CREATE INDEX "CatDivision_division_code_idx" ON "public"."CatDivision"("divisionCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CertificationType_companyId_code_key" ON "public"."CertificationType"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalAttachment_entry_idx" ON "public"."ClaimJournalAttachment"("journalEntryId" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalAttachment_uploader_idx" ON "public"."ClaimJournalAttachment"("uploadedById" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalEntry_contact_idx" ON "public"."ClaimJournalEntry"("carrierContactId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimJournalEntry_correctsEntryId_key" ON "public"."ClaimJournalEntry"("correctsEntryId" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalEntry_creator_idx" ON "public"."ClaimJournalEntry"("createdById" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalEntry_project_idx" ON "public"."ClaimJournalEntry"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalEntry_project_occurred_idx" ON "public"."ClaimJournalEntry"("projectId" ASC, "occurredAt" ASC);

-- CreateIndex
CREATE INDEX "ClaimJournalEntry_project_type_idx" ON "public"."ClaimJournalEntry"("projectId" ASC, "entryType" ASC);

-- CreateIndex
CREATE INDEX "ClientSkillRating_company_idx" ON "public"."ClientSkillRating"("clientCompanyId" ASC);

-- CreateIndex
CREATE INDEX "ClientSkillRating_user_skill_idx" ON "public"."ClientSkillRating"("userId" ASC, "skillId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Company_workerInviteToken_key" ON "public"."Company"("workerInviteToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvite_token_key" ON "public"."CompanyInvite"("token" ASC);

-- CreateIndex
CREATE INDEX "CompanyOffice_company_deleted_idx" ON "public"."CompanyOffice"("companyId" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "CompanyPriceList_companyId_isActive_revision_idx" ON "public"."CompanyPriceList"("companyId" ASC, "isActive" ASC, "revision" ASC);

-- CreateIndex
CREATE INDEX "CompanyPriceListItem_companyPriceListId_canonicalKeyHash_idx" ON "public"."CompanyPriceListItem"("companyPriceListId" ASC, "canonicalKeyHash" ASC);

-- CreateIndex
CREATE INDEX "CompanyPriceListItem_companyPriceListId_cat_sel_idx" ON "public"."CompanyPriceListItem"("companyPriceListId" ASC, "cat" ASC, "sel" ASC);

-- CreateIndex
CREATE INDEX "CompanyPriceListItem_divisionCode_idx" ON "public"."CompanyPriceListItem"("divisionCode" ASC);

-- CreateIndex
CREATE INDEX "CompanyPriceListItem_sourceProjectId_idx" ON "public"."CompanyPriceListItem"("sourceProjectId" ASC);

-- CreateIndex
CREATE INDEX "CompanySystemTag_company_idx" ON "public"."CompanySystemTag"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanySystemTag_company_tag_key" ON "public"."CompanySystemTag"("companyId" ASC, "systemTagId" ASC);

-- CreateIndex
CREATE INDEX "CompanySystemTag_tag_idx" ON "public"."CompanySystemTag"("systemTagId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUnitCode_company_code_key" ON "public"."CompanyUnitCode"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "CompanyUnitCode_company_sort_idx" ON "public"."CompanyUnitCode"("companyId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "CompClass_cpRole_idx" ON "public"."CompensationClassificationMapping"("cpRole" ASC);

-- CreateIndex
CREATE INDEX "CompClass_socCode_idx" ON "public"."CompensationClassificationMapping"("socCode" ASC);

-- CreateIndex
CREATE INDEX "CompClass_workerClass_idx" ON "public"."CompensationClassificationMapping"("workerClassCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CompensationClassificationMapping_cpRole_workerClassCode_so_key" ON "public"."CompensationClassificationMapping"("cpRole" ASC, "workerClassCode" ASC, "socCode" ASC);

-- CreateIndex
CREATE INDEX "ComponentAllocationRule_estimate_idx" ON "public"."ComponentAllocationRule"("estimateVersionId" ASC);

-- CreateIndex
CREATE INDEX "ComponentAllocationRule_project_code_idx" ON "public"."ComponentAllocationRule"("projectId" ASC, "componentCode" ASC);

-- CreateIndex
CREATE INDEX "ComponentSummary_project_estimate_code_idx" ON "public"."ComponentSummary"("projectId" ASC, "estimateVersionId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "CrossTenantInvite_company_status_idx" ON "public"."CrossTenantInvite"("targetCompanyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "CrossTenantInvite_email_idx" ON "public"."CrossTenantInvite"("inviteeEmail" ASC);

-- CreateIndex
CREATE INDEX "CrossTenantInvite_invitee_idx" ON "public"."CrossTenantInvite"("inviteeUserId" ASC);

-- CreateIndex
CREATE INDEX "CrossTenantInvite_inviter_idx" ON "public"."CrossTenantInvite"("inviterUserId" ASC);

-- CreateIndex
CREATE INDEX "CrossTenantInvite_phone_idx" ON "public"."CrossTenantInvite"("inviteePhone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CrossTenantInvite_token_key" ON "public"."CrossTenantInvite"("token" ASC);

-- CreateIndex
CREATE INDEX "DailyLog_delayed_idx" ON "public"."DailyLog"("isDelayedPublish" ASC);

-- CreateIndex
CREATE INDEX "DailyLog_project_idx" ON "public"."DailyLog"("projectId" ASC);

-- CreateIndex
CREATE INDEX "DailyLog_project_room_idx" ON "public"."DailyLog"("projectId" ASC, "roomParticleId" ASC);

-- CreateIndex
CREATE INDEX "DailyLog_project_sow_idx" ON "public"."DailyLog"("projectId" ASC, "sowItemId" ASC);

-- CreateIndex
CREATE INDEX "DailyLog_project_type_idx" ON "public"."DailyLog"("projectId" ASC, "type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_sourceBillId_key" ON "public"."DailyLog"("sourceBillId" ASC);

-- CreateIndex
CREATE INDEX "DailyLogAttachment_log_idx" ON "public"."DailyLogAttachment"("dailyLogId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLogRevision_dailyLogId_revisionNumber_key" ON "public"."DailyLogRevision"("dailyLogId" ASC, "revisionNumber" ASC);

-- CreateIndex
CREATE INDEX "DailyLogRevision_log_idx" ON "public"."DailyLogRevision"("dailyLogId" ASC);

-- CreateIndex
CREATE INDEX "DailyTimeEntry_timecard_worker_idx" ON "public"."DailyTimeEntry"("timecardId" ASC, "workerId" ASC);

-- CreateIndex
CREATE INDEX "DailyTimeEntry_worker_idx" ON "public"."DailyTimeEntry"("workerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DailyTimecard_companyId_projectId_date_key" ON "public"."DailyTimecard"("companyId" ASC, "projectId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "DailyTimecard_company_date_idx" ON "public"."DailyTimecard"("companyId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Division_code_key" ON "public"."Division"("code" ASC);

-- CreateIndex
CREATE INDEX "DocumentScanJob_company_status_idx" ON "public"."DocumentScanJob"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "DocumentScanJob_user_idx" ON "public"."DocumentScanJob"("createdByUserId" ASC);

-- CreateIndex
CREATE INDEX "DocShareLink_doc_idx" ON "public"."DocumentShareLink"("systemDocumentId" ASC);

-- CreateIndex
CREATE INDEX "DocShareLink_manual_idx" ON "public"."DocumentShareLink"("manualId" ASC);

-- CreateIndex
CREATE INDEX "DocShareLink_recipient_email_idx" ON "public"."DocumentShareLink"("recipientEmail" ASC);

-- CreateIndex
CREATE INDEX "DocShareLink_token_idx" ON "public"."DocumentShareLink"("accessToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShareLink_accessToken_key" ON "public"."DocumentShareLink"("accessToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_company_code_key" ON "public"."DocumentTemplate"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "DocumentTemplate_company_idx" ON "public"."DocumentTemplate"("companyId" ASC);

-- CreateIndex
CREATE INDEX "DocumentTemplate_company_type_idx" ON "public"."DocumentTemplate"("companyId" ASC, "type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_currentVersionId_key" ON "public"."DocumentTemplate"("currentVersionId" ASC);

-- CreateIndex
CREATE INDEX "DocTemplateVersion_template_idx" ON "public"."DocumentTemplateVersion"("templateId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DocTemplateVersion_template_version_no" ON "public"."DocumentTemplateVersion"("templateId" ASC, "versionNo" ASC);

-- CreateIndex
CREATE INDEX "EmployerSkillRating_company_idx" ON "public"."EmployerSkillRating"("companyId" ASC);

-- CreateIndex
CREATE INDEX "EmployerSkillRating_user_skill_idx" ON "public"."EmployerSkillRating"("userId" ASC, "skillId" ASC);

-- CreateIndex
CREATE INDEX "EstimateVersion_project_sequence_idx" ON "public"."EstimateVersion"("projectId" ASC, "sequenceNo" ASC);

-- CreateIndex
CREATE INDEX "FieldSecurityAuditLog_company_created_idx" ON "public"."FieldSecurityAuditLog"("companyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "FieldSecurityAuditLog_policy_idx" ON "public"."FieldSecurityAuditLog"("policyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FieldSecurityPermission_policyId_roleCode_key" ON "public"."FieldSecurityPermission"("policyId" ASC, "roleCode" ASC);

-- CreateIndex
CREATE INDEX "FieldSecurityPermission_policy_idx" ON "public"."FieldSecurityPermission"("policyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FieldSecurityPolicy_companyId_resourceKey_key" ON "public"."FieldSecurityPolicy"("companyId" ASC, "resourceKey" ASC);

-- CreateIndex
CREATE INDEX "FieldSecurityPolicy_company_idx" ON "public"."FieldSecurityPolicy"("companyId" ASC);

-- CreateIndex
CREATE INDEX "GoldenPriceUpdateLog_company_created_idx" ON "public"."GoldenPriceUpdateLog"("companyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "GoldenPriceUpdateLog_project_created_idx" ON "public"."GoldenPriceUpdateLog"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ImportJob_company_created_idx" ON "public"."ImportJob"("companyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ImportJob_project_created_idx" ON "public"."ImportJob"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ImportJob_status_created_idx" ON "public"."ImportJob"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_itemType_itemId_idx" ON "public"."InventoryMovement"("companyId" ASC, "itemType" ASC, "itemId" ASC);

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_toLocationId_movedAt_idx" ON "public"."InventoryMovement"("companyId" ASC, "toLocationId" ASC, "movedAt" ASC);

-- CreateIndex
CREATE INDEX "InventoryParticle_companyId_locationId_idx" ON "public"."InventoryParticle"("companyId" ASC, "locationId" ASC);

-- CreateIndex
CREATE INDEX "InventoryParticle_companyId_parentEntityType_parentEntityId_idx" ON "public"."InventoryParticle"("companyId" ASC, "parentEntityType" ASC, "parentEntityId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPosition_companyId_itemType_itemId_locationId_key" ON "public"."InventoryPosition"("companyId" ASC, "itemType" ASC, "itemId" ASC, "locationId" ASC);

-- CreateIndex
CREATE INDEX "InventoryPosition_companyId_locationId_idx" ON "public"."InventoryPosition"("companyId" ASC, "locationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "JobStatus_code_key" ON "public"."JobStatus"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_code_key" ON "public"."Location"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "Location_companyId_type_idx" ON "public"."Location"("companyId" ASC, "type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceReviewSettings_companyId_key" ON "public"."MaintenanceReviewSettings"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Manual_code_key" ON "public"."Manual"("code" ASC);

-- CreateIndex
CREATE INDEX "Manual_nexus_internal_idx" ON "public"."Manual"("isNexusInternal" ASC);

-- CreateIndex
CREATE INDEX "Manual_owner_idx" ON "public"."Manual"("ownerCompanyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Manual_publicSlug_key" ON "public"."Manual"("publicSlug" ASC);

-- CreateIndex
CREATE INDEX "Manual_public_idx" ON "public"."Manual"("isPublic" ASC);

-- CreateIndex
CREATE INDEX "Manual_status_idx" ON "public"."Manual"("status" ASC);

-- CreateIndex
CREATE INDEX "ManualChapter_manual_order_idx" ON "public"."ManualChapter"("manualId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "ManualDocument_chapter_order_idx" ON "public"."ManualDocument"("manualId" ASC, "chapterId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "ManualDocument_doc_idx" ON "public"."ManualDocument"("systemDocumentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ManualDocument_manual_doc_version_key" ON "public"."ManualDocument"("manualId" ASC, "systemDocumentId" ASC, "removedInManualVersion" ASC);

-- CreateIndex
CREATE INDEX "ManualTargetTag_manual_idx" ON "public"."ManualTargetTag"("manualId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ManualTargetTag_manual_tag_key" ON "public"."ManualTargetTag"("manualId" ASC, "systemTagId" ASC);

-- CreateIndex
CREATE INDEX "ManualTargetTag_tag_idx" ON "public"."ManualTargetTag"("systemTagId" ASC);

-- CreateIndex
CREATE INDEX "ManualVersion_manual_idx" ON "public"."ManualVersion"("manualId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ManualVersion_manual_version_key" ON "public"."ManualVersion"("manualId" ASC, "version" ASC);

-- CreateIndex
CREATE INDEX "MaterialLot_companyId_currentLocationId_idx" ON "public"."MaterialLot"("companyId" ASC, "currentLocationId" ASC);

-- CreateIndex
CREATE INDEX "MaterialLot_companyId_sku_idx" ON "public"."MaterialLot"("companyId" ASC, "sku" ASC);

-- CreateIndex
CREATE INDEX "Message_thread_created_idx" ON "public"."Message"("threadId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "MessageAttachment_message_idx" ON "public"."MessageAttachment"("messageId" ASC);

-- CreateIndex
CREATE INDEX "MessageParticipant_thread_idx" ON "public"."MessageParticipant"("threadId" ASC);

-- CreateIndex
CREATE INDEX "MessageParticipant_user_idx" ON "public"."MessageParticipant"("userId" ASC);

-- CreateIndex
CREATE INDEX "MessageRecipientGroup_company_owner_idx" ON "public"."MessageRecipientGroup"("companyId" ASC, "ownerId" ASC);

-- CreateIndex
CREATE INDEX "MessageRecipientGroupMember_group_idx" ON "public"."MessageRecipientGroupMember"("groupId" ASC);

-- CreateIndex
CREATE INDEX "MessageRecipientGroupMember_user_idx" ON "public"."MessageRecipientGroupMember"("userId" ASC);

-- CreateIndex
CREATE INDEX "MessageThread_company_subject_user_type_idx" ON "public"."MessageThread"("companyId" ASC, "subjectUserId" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "MessageThread_company_type_updated_idx" ON "public"."MessageThread"("companyId" ASC, "type" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "MessageThread_company_updated_idx" ON "public"."MessageThread"("companyId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "MessageThread_project_type_updated_idx" ON "public"."MessageThread"("projectId" ASC, "type" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NexNetCandidate_userId_key" ON "public"."NexNetCandidate"("userId" ASC);

-- CreateIndex
CREATE INDEX "Notification_company_created_idx" ON "public"."Notification"("companyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_project_created_idx" ON "public"."Notification"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_user_read_created_idx" ON "public"."Notification"("userId" ASC, "isRead" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NttTicket_company_status_created_idx" ON "public"."NttTicket"("companyId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NttTicket_initiator_created_idx" ON "public"."NttTicket"("initiatorUserId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingBankInfo_sessionId_key" ON "public"."OnboardingBankInfo"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "OnboardingDocument_session_idx" ON "public"."OnboardingDocument"("sessionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProfile_sessionId_key" ON "public"."OnboardingProfile"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "OnboardingSession_company_created_idx" ON "public"."OnboardingSession"("companyId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "OnboardingSession_company_detail_status_idx" ON "public"."OnboardingSession"("companyId" ASC, "detailStatusCode" ASC);

-- CreateIndex
CREATE INDEX "OnboardingSession_invited_by_idx" ON "public"."OnboardingSession"("invitedByUserId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_token_key" ON "public"."OnboardingSession"("token" ASC);

-- CreateIndex
CREATE INDEX "OnboardingSession_user_idx" ON "public"."OnboardingSession"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSkillRating_sessionId_skillId_key" ON "public"."OnboardingSkillRating"("sessionId" ASC, "skillId" ASC);

-- CreateIndex
CREATE INDEX "OrgInvite_email_status_idx" ON "public"."OrgInvite"("email" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_token_key" ON "public"."OrgInvite"("token" ASC);

-- CreateIndex
CREATE INDEX "OrgModuleOverride_company_idx" ON "public"."OrganizationModuleOverride"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationModuleOverride_companyId_moduleCode_key" ON "public"."OrganizationModuleOverride"("companyId" ASC, "moduleCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplate_code_key" ON "public"."OrganizationTemplate"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplate_currentVersionId_key" ON "public"."OrganizationTemplate"("currentVersionId" ASC);

-- CreateIndex
CREATE INDEX "OrgTemplateArticle_version_idx" ON "public"."OrganizationTemplateArticle"("templateVersionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateArticle_templateVersionId_slug_key" ON "public"."OrganizationTemplateArticle"("templateVersionId" ASC, "slug" ASC);

-- CreateIndex
CREATE INDEX "OrgTemplateModule_version_idx" ON "public"."OrganizationTemplateModule"("templateVersionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateModule_templateVersionId_moduleCode_key" ON "public"."OrganizationTemplateModule"("templateVersionId" ASC, "moduleCode" ASC);

-- CreateIndex
CREATE INDEX "OrgTemplateRolePermission_profile_idx" ON "public"."OrganizationTemplateRolePermission"("templateRoleProfileId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateRolePermission_templateRoleProfileId_re_key" ON "public"."OrganizationTemplateRolePermission"("templateRoleProfileId" ASC, "resourceCode" ASC);

-- CreateIndex
CREATE INDEX "OrgTemplateRoleProfile_version_idx" ON "public"."OrganizationTemplateRoleProfile"("templateVersionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateRoleProfile_templateVersionId_code_key" ON "public"."OrganizationTemplateRoleProfile"("templateVersionId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "OrgTemplateVersion_template_idx" ON "public"."OrganizationTemplateVersion"("templateId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateVersion_templateId_dayKey_key" ON "public"."OrganizationTemplateVersion"("templateId" ASC, "dayKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTemplateVersion_templateId_versionNo_key" ON "public"."OrganizationTemplateVersion"("templateId" ASC, "versionNo" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollWeekRecord_companyId_projectCode_weekEndDate_employe_key" ON "public"."PayrollWeekRecord"("companyId" ASC, "projectCode" ASC, "weekEndDate" ASC, "employeeId" ASC);

-- CreateIndex
CREATE INDEX "PayrollWeekRecord_company_projcode_week_idx" ON "public"."PayrollWeekRecord"("companyId" ASC, "projectCode" ASC, "weekEndDate" ASC);

-- CreateIndex
CREATE INDEX "PayrollWeekRecord_company_week_idx" ON "public"."PayrollWeekRecord"("companyId" ASC, "weekEndDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionResource_code_key" ON "public"."PermissionResource"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PersonLocation_companyId_userId_key" ON "public"."PersonLocation"("companyId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "PersonalContact_owner_email_idx" ON "public"."PersonalContact"("ownerUserId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "PersonalContact_owner_phone_idx" ON "public"."PersonalContact"("ownerUserId" ASC, "phone" ASC);

-- CreateIndex
CREATE INDEX "PersonalContactLink_contact_idx" ON "public"."PersonalContactLink"("personalContactId" ASC);

-- CreateIndex
CREATE INDEX "PersonalContactLink_subject_idx" ON "public"."PersonalContactLink"("subjectType" ASC, "subjectId" ASC);

-- CreateIndex
CREATE INDEX "PetlPercentUpdate_reconEntry_idx" ON "public"."PetlPercentUpdate"("reconEntryId" ASC);

-- CreateIndex
CREATE INDEX "PetlPercentUpdate_session_idx" ON "public"."PetlPercentUpdate"("sessionId" ASC);

-- CreateIndex
CREATE INDEX "PetlPercentUpdate_sowItem_idx" ON "public"."PetlPercentUpdate"("sowItemId" ASC);

-- CreateIndex
CREATE INDEX "PetlPercentUpdateSession_project_status_created_idx" ON "public"."PetlPercentUpdateSession"("projectId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "PetlReconAttachment_entry_idx" ON "public"."PetlReconciliationAttachment"("entryId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconAttachment_project_file_idx" ON "public"."PetlReconciliationAttachment"("projectFileId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconCase_project_estimate_idx" ON "public"."PetlReconciliationCase"("projectId" ASC, "estimateVersionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PetlReconCase_project_logical_key" ON "public"."PetlReconciliationCase"("projectId" ASC, "logicalItemId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PetlReconCase_project_sow_key" ON "public"."PetlReconciliationCase"("projectId" ASC, "sowItemId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEntry_case_idx" ON "public"."PetlReconciliationEntry"("caseId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEntry_origin_estimate_idx" ON "public"."PetlReconciliationEntry"("originEstimateVersionId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEntry_particle_idx" ON "public"."PetlReconciliationEntry"("projectParticleId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEntry_project_estimate_idx" ON "public"."PetlReconciliationEntry"("projectId" ASC, "estimateVersionId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEvent_case_created_idx" ON "public"."PetlReconciliationEvent"("caseId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEvent_entry_idx" ON "public"."PetlReconciliationEvent"("entryId" ASC);

-- CreateIndex
CREATE INDEX "PetlReconEvent_project_estimate_created_idx" ON "public"."PetlReconciliationEvent"("projectId" ASC, "estimateVersionId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PnpDocument_code_key" ON "public"."PnpDocument"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PnpDocument_currentVersionId_key" ON "public"."PnpDocument"("currentVersionId" ASC);

-- CreateIndex
CREATE INDEX "PnpDocVersion_doc_idx" ON "public"."PnpDocumentVersion"("documentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PnpDocumentVersion_documentId_versionNo_key" ON "public"."PnpDocumentVersion"("documentId" ASC, "versionNo" ASC);

-- CreateIndex
CREATE INDEX "PriceList_kind_active_revision_idx" ON "public"."PriceList"("kind" ASC, "isActive" ASC, "revision" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PLComponent_item_code_key" ON "public"."PriceListComponent"("priceListItemId" ASC, "componentCode" ASC);

-- CreateIndex
CREATE INDEX "PriceListComponent_code_idx" ON "public"."PriceListComponent"("componentCode" ASC);

-- CreateIndex
CREATE INDEX "PriceListComponent_item_idx" ON "public"."PriceListComponent"("priceListItemId" ASC);

-- CreateIndex
CREATE INDEX "PriceListItem_division_code_idx" ON "public"."PriceListItem"("divisionCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceList_canonical_hash_key" ON "public"."PriceListItem"("priceListId" ASC, "canonicalKeyHash" ASC);

-- CreateIndex
CREATE INDEX "PriceListItem_priceList_cat_sel_idx" ON "public"."PriceListItem"("priceListId" ASC, "cat" ASC, "sel" ASC);

-- CreateIndex
CREATE INDEX "Project_company_group_idx" ON "public"."Project"("companyId" ASC, "groupId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Project_externalId_key" ON "public"."Project"("externalId" ASC);

-- CreateIndex
CREATE INDEX "Project_tenant_client_idx" ON "public"."Project"("tenantClientId" ASC);

-- CreateIndex
CREATE INDEX "ProjectBill_company_project_date_idx" ON "public"."ProjectBill"("companyId" ASC, "projectId" ASC, "billDate" ASC);

-- CreateIndex
CREATE INDEX "ProjectBill_project_date_idx" ON "public"."ProjectBill"("projectId" ASC, "billDate" ASC);

-- CreateIndex
CREATE INDEX "ProjectBill_source_daily_log_idx" ON "public"."ProjectBill"("sourceDailyLogId" ASC);

-- CreateIndex
CREATE INDEX "ProjectBill_target_invoice_idx" ON "public"."ProjectBill"("targetInvoiceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBillAttachment_bill_file_key" ON "public"."ProjectBillAttachment"("billId" ASC, "projectFileId" ASC);

-- CreateIndex
CREATE INDEX "ProjectBillAttachment_bill_idx" ON "public"."ProjectBillAttachment"("billId" ASC);

-- CreateIndex
CREATE INDEX "ProjectBillAttachment_project_file_idx" ON "public"."ProjectBillAttachment"("projectFileId" ASC);

-- CreateIndex
CREATE INDEX "ProjectBillLineItem_bill_idx" ON "public"."ProjectBillLineItem"("billId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCategoryAdjustment_regionalFactorsId_categoryCode_ac_key" ON "public"."ProjectCategoryAdjustment"("regionalFactorsId" ASC, "categoryCode" ASC, "activity" ASC);

-- CreateIndex
CREATE INDEX "ProjectCategoryAdjustment_regionalFactorsId_idx" ON "public"."ProjectCategoryAdjustment"("regionalFactorsId" ASC);

-- CreateIndex
CREATE INDEX "ProjectFile_company_project_hash_idx" ON "public"."ProjectFile"("companyId" ASC, "projectId" ASC, "contentHash" ASC);

-- CreateIndex
CREATE INDEX "ProjectFile_company_project_idx" ON "public"."ProjectFile"("companyId" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectFileFolder_company_project_idx" ON "public"."ProjectFileFolder"("companyId" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectFinancialSnapshot_project_estimate_date_idx" ON "public"."ProjectFinancialSnapshot"("projectId" ASC, "estimateVersionId" ASC, "snapshotDate" ASC);

-- CreateIndex
CREATE INDEX "ProjectGroup_company_label_idx" ON "public"."ProjectGroup"("companyId" ASC, "label" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoice_companyId_invoiceSequenceNo_key" ON "public"."ProjectInvoice"("companyId" ASC, "invoiceSequenceNo" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoice_company_project_status_idx" ON "public"."ProjectInvoice"("companyId" ASC, "projectId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceApplication_company_project_applied_idx" ON "public"."ProjectInvoiceApplication"("companyId" ASC, "projectId" ASC, "appliedAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceApplication_source_invoice_idx" ON "public"."ProjectInvoiceApplication"("sourceInvoiceId" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceApplication_target_invoice_idx" ON "public"."ProjectInvoiceApplication"("targetInvoiceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoiceAttachment_invoice_file_key" ON "public"."ProjectInvoiceAttachment"("invoiceId" ASC, "projectFileId" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceAttachment_invoice_idx" ON "public"."ProjectInvoiceAttachment"("invoiceId" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceAttachment_project_file_idx" ON "public"."ProjectInvoiceAttachment"("projectFileId" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_company_price_item_idx" ON "public"."ProjectInvoiceLineItem"("companyPriceListItemId" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_invoice_billing_tag_idx" ON "public"."ProjectInvoiceLineItem"("invoiceId" ASC, "billingTag" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_invoice_kind_idx" ON "public"."ProjectInvoiceLineItem"("invoiceId" ASC, "kind" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_invoice_sort_idx" ON "public"."ProjectInvoiceLineItem"("invoiceId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_source_bill_idx" ON "public"."ProjectInvoiceLineItem"("sourceBillId" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoicePetlLine_invoiceId_projectParticleId_idx" ON "public"."ProjectInvoicePetlLine"("invoiceId" ASC, "projectParticleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoicePetlLine_invoiceId_sowItemId_kind_key" ON "public"."ProjectInvoicePetlLine"("invoiceId" ASC, "sowItemId" ASC, "kind" ASC);

-- CreateIndex
CREATE INDEX "ProjectInvoicePetlLine_parentLineId_idx" ON "public"."ProjectInvoicePetlLine"("parentLineId" ASC);

-- CreateIndex
CREATE INDEX "ProjectPayment_company_project_paid_idx" ON "public"."ProjectPayment"("companyId" ASC, "projectId" ASC, "paidAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectPayment_invoice_idx" ON "public"."ProjectPayment"("invoiceId" ASC);

-- CreateIndex
CREATE INDEX "ProjectPaymentApplication_company_project_applied_idx" ON "public"."ProjectPaymentApplication"("companyId" ASC, "projectId" ASC, "appliedAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectPaymentApplication_invoice_idx" ON "public"."ProjectPaymentApplication"("invoiceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPaymentApplication_paymentId_invoiceId_key" ON "public"."ProjectPaymentApplication"("paymentId" ASC, "invoiceId" ASC);

-- CreateIndex
CREATE INDEX "ProjectPaymentApplication_payment_idx" ON "public"."ProjectPaymentApplication"("paymentId" ASC);

-- CreateIndex
CREATE INDEX "ProjectPetlArchive_company_project_created_idx" ON "public"."ProjectPetlArchive"("companyId" ASC, "projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectPetlArchive_project_created_idx" ON "public"."ProjectPetlArchive"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectRegionalFactors_estimateVersionId_idx" ON "public"."ProjectRegionalFactors"("estimateVersionId" ASC);

-- CreateIndex
CREATE INDEX "ProjectRegionalFactors_projectId_idx" ON "public"."ProjectRegionalFactors"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRegionalFactors_projectId_key" ON "public"."ProjectRegionalFactors"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleChangeLog_project_estimate_created_idx" ON "public"."ProjectScheduleChangeLog"("projectId" ASC, "estimateVersionId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleChangeLog_task_created_idx" ON "public"."ProjectScheduleChangeLog"("scheduleTaskId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_estimate_idx" ON "public"."ProjectScheduleTask"("projectId" ASC, "estimateVersionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScheduleTask_project_estimate_synth_idx" ON "public"."ProjectScheduleTask"("projectId" ASC, "estimateVersionId" ASC, "syntheticId" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_orggroup_idx" ON "public"."ProjectScheduleTask"("projectId" ASC, "orgGroupCode" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_particle_idx" ON "public"."ProjectScheduleTask"("projectId" ASC, "projectParticleId" ASC);

-- CreateIndex
CREATE INDEX "ProjectScheduleTask_project_unit_idx" ON "public"."ProjectScheduleTask"("projectId" ASC, "projectUnitId" ASC);

-- CreateIndex
CREATE INDEX "ProjectTaxConfig_companyId_idx" ON "public"."ProjectTaxConfig"("companyId" ASC);

-- CreateIndex
CREATE INDEX "ProjectTaxConfig_projectId_idx" ON "public"."ProjectTaxConfig"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTaxConfig_projectId_key" ON "public"."ProjectTaxConfig"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUnit_projectId_label_key" ON "public"."ProjectUnit"("projectId" ASC, "label" ASC);

-- CreateIndex
CREATE INDEX "PublicationGroup_code_idx" ON "public"."PublicationGroup"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PublicationGroup_code_key" ON "public"."PublicationGroup"("code" ASC);

-- CreateIndex
CREATE INDEX "PublicationGroupMember_company_idx" ON "public"."PublicationGroupMember"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PublicationGroupMember_group_company_key" ON "public"."PublicationGroupMember"("groupId" ASC, "companyId" ASC);

-- CreateIndex
CREATE INDEX "PublicationGroupMember_group_idx" ON "public"."PublicationGroupMember"("groupId" ASC);

-- CreateIndex
CREATE INDEX "RawComponentRow_estimate_idx" ON "public"."RawComponentRow"("estimateVersionId" ASC);

-- CreateIndex
CREATE INDEX "RawXactRow_estimate_cat_sel_idx" ON "public"."RawXactRow"("estimateVersionId" ASC, "cat" ASC, "sel" ASC);

-- CreateIndex
CREATE INDEX "RawXactRow_estimate_line_idx" ON "public"."RawXactRow"("estimateVersionId" ASC, "lineNo" ASC);

-- CreateIndex
CREATE INDEX "ReaderGroup_name_idx" ON "public"."ReaderGroup"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ReaderGroupMember_group_email_key" ON "public"."ReaderGroupMember"("groupId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "ReaderGroupMember_group_idx" ON "public"."ReaderGroupMember"("groupId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptOcrResult_billId_key" ON "public"."ReceiptOcrResult"("billId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptOcrResult_dailyLogId_key" ON "public"."ReceiptOcrResult"("dailyLogId" ASC);

-- CreateIndex
CREATE INDEX "ReceiptOcrResult_project_file_idx" ON "public"."ReceiptOcrResult"("projectFileId" ASC);

-- CreateIndex
CREATE INDEX "ReceiptOcrResult_status_idx" ON "public"."ReceiptOcrResult"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_token_key" ON "public"."Referral"("token" ASC);

-- CreateIndex
CREATE INDEX "ReferralRel_company_idx" ON "public"."ReferralRelationship"("companyId" ASC);

-- CreateIndex
CREATE INDEX "ReferralRel_referee_idx" ON "public"."ReferralRelationship"("refereeUserId" ASC);

-- CreateIndex
CREATE INDEX "ReferralRel_referrer_idx" ON "public"."ReferralRelationship"("referrerUserId" ASC);

-- CreateIndex
CREATE INDEX "ReputationRating_subject_company_idx" ON "public"."ReputationRating"("subjectCompanyId" ASC);

-- CreateIndex
CREATE INDEX "ReputationRating_subject_user_idx" ON "public"."ReputationRating"("subjectUserId" ASC);

-- CreateIndex
CREATE INDEX "RolePermission_profile_idx" ON "public"."RolePermission"("profileId" ASC);

-- CreateIndex
CREATE INDEX "RolePermission_resource_idx" ON "public"."RolePermission"("resourceId" ASC);

-- CreateIndex
CREATE INDEX "RoleProfile_company_idx" ON "public"."RoleProfile"("companyId" ASC);

-- CreateIndex
CREATE INDEX "SavedPhrase_company_cat_idx" ON "public"."SavedPhrase"("companyId" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "SavedPhrase_company_user_cat_idx" ON "public"."SavedPhrase"("companyId" ASC, "userId" ASC, "category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SkillCategory_code_key" ON "public"."SkillCategory"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SkillDefinition_code_key" ON "public"."SkillDefinition"("code" ASC);

-- CreateIndex
CREATE INDEX "SowComponentAllocation_project_estimate_code_idx" ON "public"."SowComponentAllocation"("projectId" ASC, "estimateVersionId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "SowComponentAllocation_sowItem_idx" ON "public"."SowComponentAllocation"("sowItemId" ASC);

-- CreateIndex
CREATE INDEX "SowItem_cat_sel_idx" ON "public"."SowItem"("categoryCode" ASC, "selectionCode" ASC);

-- CreateIndex
CREATE INDEX "SowItem_estimate_particle_idx" ON "public"."SowItem"("estimateVersionId" ASC, "projectParticleId" ASC);

-- CreateIndex
CREATE INDEX "SowItem_particle_idx" ON "public"."SowItem"("projectParticleId" ASC);

-- CreateIndex
CREATE INDEX "StagedDocument_company_category_idx" ON "public"."StagedDocument"("companyId" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "StagedDocument_company_status_idx" ON "public"."StagedDocument"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "StagedDocument_company_type_idx" ON "public"."StagedDocument"("companyId" ASC, "fileType" ASC);

-- CreateIndex
CREATE INDEX "StagedDocument_imported_idx" ON "public"."StagedDocument"("companyId" ASC, "importedToType" ASC, "importedToCategory" ASC);

-- CreateIndex
CREATE INDEX "StagedDocument_job_idx" ON "public"."StagedDocument"("scanJobId" ASC);

-- CreateIndex
CREATE INDEX "StateOccWage_snapshot_soc_idx" ON "public"."StateOccupationalWage"("snapshotId" ASC, "socCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StateOccupationalWageSnapshot_stateCode_year_source_key" ON "public"."StateOccupationalWageSnapshot"("stateCode" ASC, "year" ASC, "source" ASC);

-- CreateIndex
CREATE INDEX "Supplier_company_active_idx" ON "public"."Supplier"("companyId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "Supplier_company_name_idx" ON "public"."Supplier"("companyId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "SupplierContact_supplier_primary_idx" ON "public"."SupplierContact"("supplierId" ASC, "isPrimary" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTag_company_cat_code_key" ON "public"."SupplierTag"("companyId" ASC, "category" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "SupplierTag_company_cat_idx" ON "public"."SupplierTag"("companyId" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "SupplierTagAssignment_supplier_idx" ON "public"."SupplierTagAssignment"("supplierId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTagAssignment_supplier_tag_key" ON "public"."SupplierTagAssignment"("supplierId" ASC, "tagId" ASC);

-- CreateIndex
CREATE INDEX "SupplierTagAssignment_tag_idx" ON "public"."SupplierTagAssignment"("tagId" ASC);

-- CreateIndex
CREATE INDEX "SystemDocument_active_idx" ON "public"."SystemDocument"("active" ASC);

-- CreateIndex
CREATE INDEX "SystemDocument_category_idx" ON "public"."SystemDocument"("category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocument_code_key" ON "public"."SystemDocument"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocument_currentVersionId_key" ON "public"."SystemDocument"("currentVersionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocument_publicSlug_key" ON "public"."SystemDocument"("publicSlug" ASC);

-- CreateIndex
CREATE INDEX "SystemDocument_public_idx" ON "public"."SystemDocument"("isPublic" ASC);

-- CreateIndex
CREATE INDEX "SystemDocPub_company_idx" ON "public"."SystemDocumentPublication"("targetCompanyId" ASC);

-- CreateIndex
CREATE INDEX "SystemDocPub_doc_idx" ON "public"."SystemDocumentPublication"("systemDocumentId" ASC);

-- CreateIndex
CREATE INDEX "SystemDocPub_target_active_idx" ON "public"."SystemDocumentPublication"("targetType" ASC, "retractedAt" ASC);

-- CreateIndex
CREATE INDEX "SystemDocVersion_doc_idx" ON "public"."SystemDocumentVersion"("systemDocumentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemDocVersion_doc_version_key" ON "public"."SystemDocumentVersion"("systemDocumentId" ASC, "versionNo" ASC);

-- CreateIndex
CREATE INDEX "SystemTag_active_idx" ON "public"."SystemTag"("active" ASC);

-- CreateIndex
CREATE INDEX "SystemTag_category_idx" ON "public"."SystemTag"("category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemTag_code_key" ON "public"."SystemTag"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_companyId_code_key" ON "public"."Tag"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "TagAssignment_entity_idx" ON "public"."TagAssignment"("companyId" ASC, "entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "TagAssignment_tag_idx" ON "public"."TagAssignment"("companyId" ASC, "tagId" ASC);

-- CreateIndex
CREATE INDEX "Task_related_entity_idx" ON "public"."Task"("companyId" ASC, "relatedEntityType" ASC, "relatedEntityId" ASC);

-- CreateIndex
CREATE INDEX "TaxJurisdiction_companyId_state_county_idx" ON "public"."TaxJurisdiction"("companyId" ASC, "state" ASC, "county" ASC);

-- CreateIndex
CREATE INDEX "TaxJurisdiction_companyId_state_postalCode_idx" ON "public"."TaxJurisdiction"("companyId" ASC, "state" ASC, "postalCode" ASC);

-- CreateIndex
CREATE INDEX "TaxJurisdiction_companyId_state_postalPrefix_idx" ON "public"."TaxJurisdiction"("companyId" ASC, "state" ASC, "postalPrefix" ASC);

-- CreateIndex
CREATE INDEX "TenantClient_company_email_idx" ON "public"."TenantClient"("companyId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "TenantClient_company_idx" ON "public"."TenantClient"("companyId" ASC);

-- CreateIndex
CREATE INDEX "TenantClient_company_name_idx" ON "public"."TenantClient"("companyId" ASC, "lastName" ASC, "firstName" ASC);

-- CreateIndex
CREATE INDEX "TenantClient_company_phone_idx" ON "public"."TenantClient"("companyId" ASC, "phone" ASC);

-- CreateIndex
CREATE INDEX "TenantClient_user_idx" ON "public"."TenantClient"("userId" ASC);

-- CreateIndex
CREATE INDEX "TenantDocCopy_company_idx" ON "public"."TenantDocumentCopy"("companyId" ASC);

-- CreateIndex
CREATE INDEX "TenantDocCopy_source_idx" ON "public"."TenantDocumentCopy"("sourceSystemDocumentId" ASC);

-- CreateIndex
CREATE INDEX "TenantDocCopy_status_idx" ON "public"."TenantDocumentCopy"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "TenantDocCopy_updates_idx" ON "public"."TenantDocumentCopy"("companyId" ASC, "hasNewerSystemVersion" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TenantDocumentCopy_currentVersionId_key" ON "public"."TenantDocumentCopy"("currentVersionId" ASC);

-- CreateIndex
CREATE INDEX "TenantDocCopyVersion_copy_idx" ON "public"."TenantDocumentCopyVersion"("tenantDocumentCopyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TenantDocCopyVersion_copy_version_key" ON "public"."TenantDocumentCopyVersion"("tenantDocumentCopyId" ASC, "versionNo" ASC);

-- CreateIndex
CREATE INDEX "TenantManualCopy_company_idx" ON "public"."TenantManualCopy"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TenantManualCopy_company_manual_key" ON "public"."TenantManualCopy"("companyId" ASC, "sourceManualId" ASC);

-- CreateIndex
CREATE INDEX "TenantManualCopy_manual_idx" ON "public"."TenantManualCopy"("sourceManualId" ASC);

-- CreateIndex
CREATE INDEX "TenantManualCopy_status_idx" ON "public"."TenantManualCopy"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPnpDocument_companyId_code_key" ON "public"."TenantPnpDocument"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "TenantPnpDocument_company_category_idx" ON "public"."TenantPnpDocument"("companyId" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "TenantPnpDocument_company_status_idx" ON "public"."TenantPnpDocument"("companyId" ASC, "reviewStatus" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPnpDocument_currentVersionId_key" ON "public"."TenantPnpDocument"("currentVersionId" ASC);

-- CreateIndex
CREATE INDEX "TenantPnpDocument_source_idx" ON "public"."TenantPnpDocument"("sourcePnpDocumentId" ASC);

-- CreateIndex
CREATE INDEX "TenantPnpDocVersion_doc_idx" ON "public"."TenantPnpDocumentVersion"("documentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPnpDocumentVersion_documentId_versionNo_key" ON "public"."TenantPnpDocumentVersion"("documentId" ASC, "versionNo" ASC);

-- CreateIndex
CREATE INDEX "TenantPriceUpdateLog_company_changed_idx" ON "public"."TenantPriceUpdateLog"("companyId" ASC, "changedAt" ASC);

-- CreateIndex
CREATE INDEX "TenantPriceUpdateLog_item_changed_idx" ON "public"."TenantPriceUpdateLog"("companyPriceListItemId" ASC, "changedAt" ASC);

-- CreateIndex
CREATE INDEX "TimecardEditLog_company_project_date_idx" ON "public"."TimecardEditLog"("companyId" ASC, "projectId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingModule_companyId_code_key" ON "public"."TrainingModule"("companyId" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_peopleToken_key" ON "public"."User"("peopleToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_syncToken_key" ON "public"."User"("syncToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserEmailAlias_email_key" ON "public"."UserEmailAlias"("email" ASC);

-- CreateIndex
CREATE INDEX "UserEmailAlias_user_idx" ON "public"."UserEmailAlias"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserPortfolio_companyId_userId_key" ON "public"."UserPortfolio"("companyId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "UserPortfolio_company_idx" ON "public"."UserPortfolio"("companyId" ASC);

-- CreateIndex
CREATE INDEX "UserPortfolio_user_idx" ON "public"."UserPortfolio"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserPortfolioHr_portfolioId_key" ON "public"."UserPortfolioHr"("portfolioId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserSkillRating_userId_skillId_key" ON "public"."UserSkillRating"("userId" ASC, "skillId" ASC);

-- CreateIndex
CREATE INDEX "UserSkillSuggestion_status_idx" ON "public"."UserSkillSuggestion"("status" ASC);

-- CreateIndex
CREATE INDEX "UserSkillSuggestion_user_idx" ON "public"."UserSkillSuggestion"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_fullName_key" ON "public"."Worker"("fullName" ASC);

-- CreateIndex
CREATE INDEX "WorkerWeek_week_scope_idx" ON "public"."WorkerWeek"("weekEndDate" ASC, "projectCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerWeek_workerId_weekEndDate_projectCode_key" ON "public"."WorkerWeek"("workerId" ASC, "weekEndDate" ASC, "projectCode" ASC);

-- CreateIndex
CREATE INDEX "_MessageToMessageParticipant_B_index" ON "public"."_MessageToMessageParticipant"("B" ASC);

-- AddForeignKey
ALTER TABLE "public"."AccountLinkEvent" ADD CONSTRAINT "AccountLinkEvent_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountLinkEvent" ADD CONSTRAINT "AccountLinkEvent_triggeredByInviteId_fkey" FOREIGN KEY ("triggeredByInviteId") REFERENCES "public"."CrossTenantInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "public"."PriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetMaintenanceRule" ADD CONSTRAINT "AssetMaintenanceRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."AssetMaintenanceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetMaintenanceSchedule" ADD CONSTRAINT "AssetMaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetMaintenanceSchedule" ADD CONSTRAINT "AssetMaintenanceSchedule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AssetMaintenanceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetMaintenanceTemplate" ADD CONSTRAINT "AssetMaintenanceTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetMeterReading" ADD CONSTRAINT "AssetMeterReading_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetMeterReading" ADD CONSTRAINT "AssetMeterReading_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetTransaction" ADD CONSTRAINT "AssetTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetTransaction" ADD CONSTRAINT "AssetTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetTransaction" ADD CONSTRAINT "AssetTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetTransaction" ADD CONSTRAINT "AssetTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetTransaction" ADD CONSTRAINT "AssetTransaction_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "public"."AssetUsage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetUsage" ADD CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetUsage" ADD CONSTRAINT "AssetUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetUsage" ADD CONSTRAINT "AssetUsage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetUsage" ADD CONSTRAINT "AssetUsage_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "public"."DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetUsage" ADD CONSTRAINT "AssetUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssetUsage" ADD CONSTRAINT "AssetUsage_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "public"."SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequest" ADD CONSTRAINT "BidRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequest" ADD CONSTRAINT "BidRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequest" ADD CONSTRAINT "BidRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequestItem" ADD CONSTRAINT "BidRequestItem_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "public"."BidRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequestRecipient" ADD CONSTRAINT "BidRequestRecipient_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "public"."BidRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequestRecipient" ADD CONSTRAINT "BidRequestRecipient_supplierContactId_fkey" FOREIGN KEY ("supplierContactId") REFERENCES "public"."SupplierContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidRequestRecipient" ADD CONSTRAINT "BidRequestRecipient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidResponse" ADD CONSTRAINT "BidResponse_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "public"."BidRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidResponse" ADD CONSTRAINT "BidResponse_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."BidRequestRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidResponse" ADD CONSTRAINT "BidResponse_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidResponseItem" ADD CONSTRAINT "BidResponseItem_bidRequestItemId_fkey" FOREIGN KEY ("bidRequestItemId") REFERENCES "public"."BidRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BidResponseItem" ADD CONSTRAINT "BidResponseItem_bidResponseId_fkey" FOREIGN KEY ("bidResponseId") REFERENCES "public"."BidResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CarrierContact" ADD CONSTRAINT "CarrierContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatDivision" ADD CONSTRAINT "CatDivision_divisionCode_fkey" FOREIGN KEY ("divisionCode") REFERENCES "public"."Division"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClaimJournalAttachment" ADD CONSTRAINT "ClaimJournalAttachment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "public"."ClaimJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClaimJournalAttachment" ADD CONSTRAINT "ClaimJournalAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClaimJournalEntry" ADD CONSTRAINT "ClaimJournalEntry_carrierContactId_fkey" FOREIGN KEY ("carrierContactId") REFERENCES "public"."CarrierContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClaimJournalEntry" ADD CONSTRAINT "ClaimJournalEntry_correctsEntryId_fkey" FOREIGN KEY ("correctsEntryId") REFERENCES "public"."ClaimJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClaimJournalEntry" ADD CONSTRAINT "ClaimJournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClaimJournalEntry" ADD CONSTRAINT "ClaimJournalEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Company" ADD CONSTRAINT "Company_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."OrganizationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Company" ADD CONSTRAINT "Company_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "public"."OrganizationTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyInvite" ADD CONSTRAINT "CompanyInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyInvite" ADD CONSTRAINT "CompanyInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyInvoiceCounter" ADD CONSTRAINT "CompanyInvoiceCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyMembership" ADD CONSTRAINT "CompanyMembership_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."RoleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyOffice" ADD CONSTRAINT "CompanyOffice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceList" ADD CONSTRAINT "CompanyPriceList_basePriceListId_fkey" FOREIGN KEY ("basePriceListId") REFERENCES "public"."PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceList" ADD CONSTRAINT "CompanyPriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_companyPriceListId_fkey" FOREIGN KEY ("companyPriceListId") REFERENCES "public"."CompanyPriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_divisionCode_fkey" FOREIGN KEY ("divisionCode") REFERENCES "public"."Division"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "public"."PriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_sourceEstimateVersionId_fkey" FOREIGN KEY ("sourceEstimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanySystemTag" ADD CONSTRAINT "CompanySystemTag_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanySystemTag" ADD CONSTRAINT "CompanySystemTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanySystemTag" ADD CONSTRAINT "CompanySystemTag_systemTagId_fkey" FOREIGN KEY ("systemTagId") REFERENCES "public"."SystemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyUnitCode" ADD CONSTRAINT "CompanyUnitCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComponentAllocationRule" ADD CONSTRAINT "ComponentAllocationRule_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComponentAllocationRule" ADD CONSTRAINT "ComponentAllocationRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComponentSummary" ADD CONSTRAINT "ComponentSummary_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComponentSummary" ADD CONSTRAINT "ComponentSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrossTenantInvite" ADD CONSTRAINT "CrossTenantInvite_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrossTenantInvite" ADD CONSTRAINT "CrossTenantInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrossTenantInvite" ADD CONSTRAINT "CrossTenantInvite_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "public"."ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_delayedById_fkey" FOREIGN KEY ("delayedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_roomParticleId_fkey" FOREIGN KEY ("roomParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "public"."ProjectBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "public"."SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLog" ADD CONSTRAINT "DailyLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."ProjectUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLogAttachment" ADD CONSTRAINT "DailyLogAttachment_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "public"."DailyLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLogAttachment" ADD CONSTRAINT "DailyLogAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLogRevision" ADD CONSTRAINT "DailyLogRevision_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "public"."DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyLogRevision" ADD CONSTRAINT "DailyLogRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyTimeEntry" ADD CONSTRAINT "DailyTimeEntry_timecardId_fkey" FOREIGN KEY ("timecardId") REFERENCES "public"."DailyTimecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyTimeEntry" ADD CONSTRAINT "DailyTimeEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyTimecard" ADD CONSTRAINT "DailyTimecard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyTimecard" ADD CONSTRAINT "DailyTimecard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyTimecard" ADD CONSTRAINT "DailyTimecard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentScanJob" ADD CONSTRAINT "DocumentScanJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentScanJob" ADD CONSTRAINT "DocumentScanJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "public"."Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "public"."SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentTemplateVersion" ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EstimateVersion" ADD CONSTRAINT "EstimateVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldSecurityPermission" ADD CONSTRAINT "FieldSecurityPermission_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."FieldSecurityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldSecurityPolicy" ADD CONSTRAINT "FieldSecurityPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoldenPriceUpdateLog" ADD CONSTRAINT "GoldenPriceUpdateLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoldenPriceUpdateLog" ADD CONSTRAINT "GoldenPriceUpdateLog_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoldenPriceUpdateLog" ADD CONSTRAINT "GoldenPriceUpdateLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoldenPriceUpdateLog" ADD CONSTRAINT "GoldenPriceUpdateLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ImportJob" ADD CONSTRAINT "ImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ImportJob" ADD CONSTRAINT "ImportJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ImportJob" ADD CONSTRAINT "ImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryParticle" ADD CONSTRAINT "InventoryParticle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryParticle" ADD CONSTRAINT "InventoryParticle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryParticle" ADD CONSTRAINT "InventoryParticle_virtualLocationId_fkey" FOREIGN KEY ("virtualLocationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryPosition" ADD CONSTRAINT "InventoryPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryPosition" ADD CONSTRAINT "InventoryPosition_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Location" ADD CONSTRAINT "Location_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceReviewSettings" ADD CONSTRAINT "MaintenanceReviewSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."AssetMaintenanceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."AssetMaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manual" ADD CONSTRAINT "Manual_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Manual" ADD CONSTRAINT "Manual_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualChapter" ADD CONSTRAINT "ManualChapter_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "public"."Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualDocument" ADD CONSTRAINT "ManualDocument_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "public"."ManualChapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualDocument" ADD CONSTRAINT "ManualDocument_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "public"."Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualDocument" ADD CONSTRAINT "ManualDocument_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "public"."SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualTargetTag" ADD CONSTRAINT "ManualTargetTag_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "public"."Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualTargetTag" ADD CONSTRAINT "ManualTargetTag_systemTagId_fkey" FOREIGN KEY ("systemTagId") REFERENCES "public"."SystemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualVersion" ADD CONSTRAINT "ManualVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualVersion" ADD CONSTRAINT "ManualVersion_manualId_fkey" FOREIGN KEY ("manualId") REFERENCES "public"."Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialLot" ADD CONSTRAINT "MaterialLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaterialLot" ADD CONSTRAINT "MaterialLot_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageAttachment" ADD CONSTRAINT "MessageAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageParticipant" ADD CONSTRAINT "MessageParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageParticipant" ADD CONSTRAINT "MessageParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRecipientGroupMember" ADD CONSTRAINT "MessageRecipientGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."MessageRecipientGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRecipientGroupMember" ADD CONSTRAINT "MessageRecipientGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageThread" ADD CONSTRAINT "MessageThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageThread" ADD CONSTRAINT "MessageThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageThread" ADD CONSTRAINT "MessageThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NexNetCandidate" ADD CONSTRAINT "NexNetCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NttTicket" ADD CONSTRAINT "NttTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NttTicket" ADD CONSTRAINT "NttTicket_initiatorUserId_fkey" FOREIGN KEY ("initiatorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NttTicket" ADD CONSTRAINT "NttTicket_noteThreadId_fkey" FOREIGN KEY ("noteThreadId") REFERENCES "public"."MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingBankInfo" ADD CONSTRAINT "OnboardingBankInfo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingProfile" ADD CONSTRAINT "OnboardingProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingSession" ADD CONSTRAINT "OnboardingSession_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingSession" ADD CONSTRAINT "OnboardingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingSkillRating" ADD CONSTRAINT "OnboardingSkillRating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationModuleOverride" ADD CONSTRAINT "OrganizationModuleOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationTemplate" ADD CONSTRAINT "OrganizationTemplate_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."OrganizationTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationTemplateArticle" ADD CONSTRAINT "OrganizationTemplateArticle_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "public"."OrganizationTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationTemplateModule" ADD CONSTRAINT "OrganizationTemplateModule_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "public"."OrganizationTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationTemplateRolePermission" ADD CONSTRAINT "OrganizationTemplateRolePermission_templateRoleProfileId_fkey" FOREIGN KEY ("templateRoleProfileId") REFERENCES "public"."OrganizationTemplateRoleProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationTemplateRoleProfile" ADD CONSTRAINT "OrganizationTemplateRoleProfile_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "public"."OrganizationTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationTemplateVersion" ADD CONSTRAINT "OrganizationTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."OrganizationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Parcel" ADD CONSTRAINT "Parcel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Parcel" ADD CONSTRAINT "Parcel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Parcel" ADD CONSTRAINT "Parcel_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollWeekRecord" ADD CONSTRAINT "PayrollWeekRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollWeekRecord" ADD CONSTRAINT "PayrollWeekRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonLocation" ADD CONSTRAINT "PersonLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonLocation" ADD CONSTRAINT "PersonLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonLocation" ADD CONSTRAINT "PersonLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonalContact" ADD CONSTRAINT "PersonalContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonalContactLink" ADD CONSTRAINT "PersonalContactLink_personalContactId_fkey" FOREIGN KEY ("personalContactId") REFERENCES "public"."PersonalContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlEditChange" ADD CONSTRAINT "PetlEditChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."PetlEditSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlEditChange" ADD CONSTRAINT "PetlEditChange_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "public"."SowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlEditSession" ADD CONSTRAINT "PetlEditSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdate" ADD CONSTRAINT "PetlPercentUpdate_reconEntryId_fkey" FOREIGN KEY ("reconEntryId") REFERENCES "public"."PetlReconciliationEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdate" ADD CONSTRAINT "PetlPercentUpdate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."PetlPercentUpdateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdate" ADD CONSTRAINT "PetlPercentUpdate_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "public"."SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlPercentUpdateSession" ADD CONSTRAINT "PetlPercentUpdateSession_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationAttachment" ADD CONSTRAINT "PetlReconciliationAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."PetlReconciliationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationAttachment" ADD CONSTRAINT "PetlReconciliationAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_logicalItemId_fkey" FOREIGN KEY ("logicalItemId") REFERENCES "public"."SowLogicalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_noteThreadId_fkey" FOREIGN KEY ("noteThreadId") REFERENCES "public"."MessageThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationCase" ADD CONSTRAINT "PetlReconciliationCase_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "public"."SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."PetlReconciliationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "public"."CompanyPriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_parentSowItemId_fkey" FOREIGN KEY ("parentSowItemId") REFERENCES "public"."SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."PetlReconciliationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."PetlReconciliationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PetlReconciliationEvent" ADD CONSTRAINT "PetlReconciliationEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PnpDocument" ADD CONSTRAINT "PnpDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."PnpDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PnpDocumentVersion" ADD CONSTRAINT "PnpDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."PnpDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceListComponent" ADD CONSTRAINT "PriceListComponent_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "public"."PriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceListItem" ADD CONSTRAINT "PriceListItem_divisionCode_fkey" FOREIGN KEY ("divisionCode") REFERENCES "public"."Division"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "public"."PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."ProjectGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_taxJurisdictionId_fkey" FOREIGN KEY ("taxJurisdictionId") REFERENCES "public"."TaxJurisdiction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_tenantClientId_fkey" FOREIGN KEY ("tenantClientId") REFERENCES "public"."TenantClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBill" ADD CONSTRAINT "ProjectBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBill" ADD CONSTRAINT "ProjectBill_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBill" ADD CONSTRAINT "ProjectBill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBill" ADD CONSTRAINT "ProjectBill_targetInvoiceId_fkey" FOREIGN KEY ("targetInvoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBillAttachment" ADD CONSTRAINT "ProjectBillAttachment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "public"."ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBillAttachment" ADD CONSTRAINT "ProjectBillAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBillLineItem" ADD CONSTRAINT "ProjectBillLineItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "public"."ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBuilding" ADD CONSTRAINT "ProjectBuilding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectBuilding" ADD CONSTRAINT "ProjectBuilding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectCategoryAdjustment" ADD CONSTRAINT "ProjectCategoryAdjustment_regionalFactorsId_fkey" FOREIGN KEY ("regionalFactorsId") REFERENCES "public"."ProjectRegionalFactors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectFile" ADD CONSTRAINT "ProjectFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectFile" ADD CONSTRAINT "ProjectFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."ProjectFileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectFileFolder" ADD CONSTRAINT "ProjectFileFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectFileFolder" ADD CONSTRAINT "ProjectFileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."ProjectFileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectFileFolder" ADD CONSTRAINT "ProjectFileFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectGroup" ADD CONSTRAINT "ProjectGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceApplication" ADD CONSTRAINT "ProjectInvoiceApplication_targetInvoiceId_fkey" FOREIGN KEY ("targetInvoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceAttachment" ADD CONSTRAINT "ProjectInvoiceAttachment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceAttachment" ADD CONSTRAINT "ProjectInvoiceAttachment_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "public"."CompanyPriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "public"."ProjectBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoicePetlLine" ADD CONSTRAINT "ProjectInvoicePetlLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectInvoicePetlLine" ADD CONSTRAINT "ProjectInvoicePetlLine_parentLineId_fkey" FOREIGN KEY ("parentLineId") REFERENCES "public"."ProjectInvoicePetlLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectMembership" ADD CONSTRAINT "ProjectMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectParticle" ADD CONSTRAINT "ProjectParticle_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "public"."ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectParticle" ADD CONSTRAINT "ProjectParticle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectParticle" ADD CONSTRAINT "ProjectParticle_parentParticleId_fkey" FOREIGN KEY ("parentParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectParticle" ADD CONSTRAINT "ProjectParticle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectParticle" ADD CONSTRAINT "ProjectParticle_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."ProjectUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPayment" ADD CONSTRAINT "ProjectPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPayment" ADD CONSTRAINT "ProjectPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPayment" ADD CONSTRAINT "ProjectPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPayment" ADD CONSTRAINT "ProjectPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."ProjectInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."ProjectPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPaymentApplication" ADD CONSTRAINT "ProjectPaymentApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_restoredByUserId_fkey" FOREIGN KEY ("restoredByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_restoredEstimateVersionId_fkey" FOREIGN KEY ("restoredEstimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPetlArchive" ADD CONSTRAINT "ProjectPetlArchive_sourceEstimateVersionId_fkey" FOREIGN KEY ("sourceEstimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectRegionalFactors" ADD CONSTRAINT "ProjectRegionalFactors_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectRegionalFactors" ADD CONSTRAINT "ProjectRegionalFactors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectScheduleChangeLog" ADD CONSTRAINT "ProjectScheduleChangeLog_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "public"."ProjectScheduleTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectScheduleTask" ADD CONSTRAINT "ProjectScheduleTask_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectScheduleTask" ADD CONSTRAINT "ProjectScheduleTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectTaxConfig" ADD CONSTRAINT "ProjectTaxConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectTaxConfig" ADD CONSTRAINT "ProjectTaxConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectUnit" ADD CONSTRAINT "ProjectUnit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "public"."ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectUnit" ADD CONSTRAINT "ProjectUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectUnit" ADD CONSTRAINT "ProjectUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PublicationGroup" ADD CONSTRAINT "PublicationGroup_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PublicationGroupMember" ADD CONSTRAINT "PublicationGroupMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PublicationGroupMember" ADD CONSTRAINT "PublicationGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."PublicationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawComponentRow" ADD CONSTRAINT "RawComponentRow_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawXactRow" ADD CONSTRAINT "RawXactRow_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReaderGroup" ADD CONSTRAINT "ReaderGroup_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReaderGroupMember" ADD CONSTRAINT "ReaderGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."ReaderGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_billId_fkey" FOREIGN KEY ("billId") REFERENCES "public"."ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "public"."DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "public"."ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."NexNetCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_personalContactId_fkey" FOREIGN KEY ("personalContactId") REFERENCES "public"."PersonalContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReferralRelationship" ADD CONSTRAINT "ReferralRelationship_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReferralRelationship" ADD CONSTRAINT "ReferralRelationship_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReferralRelationship" ADD CONSTRAINT "ReferralRelationship_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."RoleProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "public"."PermissionResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoleProfile" ADD CONSTRAINT "RoleProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedPhrase" ADD CONSTRAINT "SavedPhrase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedPhrase" ADD CONSTRAINT "SavedPhrase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sow" ADD CONSTRAINT "Sow_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sow" ADD CONSTRAINT "Sow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_componentSummaryId_fkey" FOREIGN KEY ("componentSummaryId") REFERENCES "public"."ComponentSummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowComponentAllocation" ADD CONSTRAINT "SowComponentAllocation_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "public"."SowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowItem" ADD CONSTRAINT "SowItem_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowItem" ADD CONSTRAINT "SowItem_logicalItemId_fkey" FOREIGN KEY ("logicalItemId") REFERENCES "public"."SowLogicalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowItem" ADD CONSTRAINT "SowItem_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowItem" ADD CONSTRAINT "SowItem_rawRowId_fkey" FOREIGN KEY ("rawRowId") REFERENCES "public"."RawXactRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowItem" ADD CONSTRAINT "SowItem_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "public"."Sow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowLogicalItem" ADD CONSTRAINT "SowLogicalItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SowLogicalItem" ADD CONSTRAINT "SowLogicalItem_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StagedDocument" ADD CONSTRAINT "StagedDocument_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StagedDocument" ADD CONSTRAINT "StagedDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StagedDocument" ADD CONSTRAINT "StagedDocument_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StagedDocument" ADD CONSTRAINT "StagedDocument_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StagedDocument" ADD CONSTRAINT "StagedDocument_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "public"."DocumentScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StagedDocument" ADD CONSTRAINT "StagedDocument_scannedByUserId_fkey" FOREIGN KEY ("scannedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StateOccupationalWage" ADD CONSTRAINT "StateOccupationalWage_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "public"."StateOccupationalWageSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierTag" ADD CONSTRAINT "SupplierTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierTagAssignment" ADD CONSTRAINT "SupplierTagAssignment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierTagAssignment" ADD CONSTRAINT "SupplierTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."SupplierTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocument" ADD CONSTRAINT "SystemDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocument" ADD CONSTRAINT "SystemDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."SystemDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_retractedByUserId_fkey" FOREIGN KEY ("retractedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "public"."SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_systemDocumentVersionId_fkey" FOREIGN KEY ("systemDocumentVersionId") REFERENCES "public"."SystemDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentPublication" ADD CONSTRAINT "SystemDocumentPublication_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentVersion" ADD CONSTRAINT "SystemDocumentVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemDocumentVersion" ADD CONSTRAINT "SystemDocumentVersion_systemDocumentId_fkey" FOREIGN KEY ("systemDocumentId") REFERENCES "public"."SystemDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SystemTag" ADD CONSTRAINT "SystemTag_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tag" ADD CONSTRAINT "Tag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagAssignment" ADD CONSTRAINT "TagAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagAssignment" ADD CONSTRAINT "TagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "public"."ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaxJurisdiction" ADD CONSTRAINT "TaxJurisdiction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantClient" ADD CONSTRAINT "TenantClient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantClient" ADD CONSTRAINT "TenantClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_copiedByUserId_fkey" FOREIGN KEY ("copiedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."TenantDocumentCopyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopy" ADD CONSTRAINT "TenantDocumentCopy_sourceSystemDocumentId_fkey" FOREIGN KEY ("sourceSystemDocumentId") REFERENCES "public"."SystemDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopyVersion" ADD CONSTRAINT "TenantDocumentCopyVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantDocumentCopyVersion" ADD CONSTRAINT "TenantDocumentCopyVersion_tenantDocumentCopyId_fkey" FOREIGN KEY ("tenantDocumentCopyId") REFERENCES "public"."TenantDocumentCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantManualCopy" ADD CONSTRAINT "TenantManualCopy_sourceManualId_fkey" FOREIGN KEY ("sourceManualId") REFERENCES "public"."Manual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPnpDocument" ADD CONSTRAINT "TenantPnpDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPnpDocument" ADD CONSTRAINT "TenantPnpDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."TenantPnpDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPnpDocument" ADD CONSTRAINT "TenantPnpDocument_sourcePnpDocumentId_fkey" FOREIGN KEY ("sourcePnpDocumentId") REFERENCES "public"."PnpDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPnpDocument" ADD CONSTRAINT "TenantPnpDocument_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "public"."PnpDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPnpDocumentVersion" ADD CONSTRAINT "TenantPnpDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."TenantPnpDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_companyPriceListId_fkey" FOREIGN KEY ("companyPriceListId") REFERENCES "public"."CompanyPriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "public"."CompanyPriceListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "public"."EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimecardEditLog" ADD CONSTRAINT "TimecardEditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimecardEditLog" ADD CONSTRAINT "TimecardEditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimecardEditLog" ADD CONSTRAINT "TimecardEditLog_timecardId_fkey" FOREIGN KEY ("timecardId") REFERENCES "public"."DailyTimecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserEmailAlias" ADD CONSTRAINT "UserEmailAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPortfolio" ADD CONSTRAINT "UserPortfolio_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPortfolio" ADD CONSTRAINT "UserPortfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPortfolioHr" ADD CONSTRAINT "UserPortfolioHr_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "public"."UserPortfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkerWeek" ADD CONSTRAINT "WorkerWeek_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_MessageToMessageParticipant" ADD CONSTRAINT "_MessageToMessageParticipant_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_MessageToMessageParticipant" ADD CONSTRAINT "_MessageToMessageParticipant_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."MessageParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

