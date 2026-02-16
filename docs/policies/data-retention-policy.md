# Data Retention and Deletion Policy

**Nexus Contractor Connect (NCC)**
**NFS Group**

**Effective Date:** February 16, 2026
**Last Updated:** February 16, 2026
**Version:** 1.0
**Next Review Date:** February 16, 2027

---

## 1. Purpose

This Data Retention and Deletion Policy establishes guidelines for retaining, archiving, and deleting data within Nexus Contractor Connect (NCC) in compliance with applicable data privacy laws including GDPR, CCPA, and industry best practices.

---

## 2. Scope

This policy applies to:
- All data stored within the NCC platform
- All tenants (organizations) using NCC
- All data types including personal data, business records, and system logs
- All environments (production, staging, development)

---

## 3. Data Classification and Retention Periods

### 3.1 User Personal Data

| Data Type | Retention Period | Deletion Trigger |
|-----------|------------------|------------------|
| Active user accounts | Duration of employment/engagement + 3 years | User deletion request or account termination |
| Inactive user accounts | 2 years after last login | Automatic archival, then deletion |
| Authentication credentials | Until password change or account deletion | Immediate on change/deletion |
| Session tokens | 30 days (refresh tokens) | Automatic expiration |
| Password reset tokens | 15 minutes | Automatic expiration |

### 3.2 Business Operational Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| Project records | 7 years after project completion | Tax/legal requirements |
| Financial records (invoices, payments) | 7 years | Tax compliance (IRS) |
| Contracts and agreements | 10 years after expiration | Legal statute of limitations |
| Timecards and payroll data | 7 years | DOL/IRS requirements |
| Daily logs and site reports | 7 years | Construction liability |

### 3.3 System and Security Data

| Data Type | Retention Period | Purpose |
|-----------|------------------|---------|
| Audit logs (AdminAuditLog) | 7 years | Compliance and forensics |
| Activity logs | 3 years | Operational analysis |
| Error logs | 90 days | Debugging |
| Access logs | 1 year | Security monitoring |

### 3.4 Communication Data

| Data Type | Retention Period | Notes |
|-----------|------------------|-------|
| Internal messages | 3 years | Business communications |
| Notifications | 1 year | Transient data |
| Email records | 3 years | Business correspondence |

### 3.5 Uploaded Files and Documents

| Data Type | Retention Period | Notes |
|-----------|------------------|-------|
| Project documents | 7 years after project completion | Liability and compliance |
| HR documents | Duration of employment + 7 years | Employment records |
| Training records | 7 years | OSHA compliance |
| Certifications | Until expiration + 3 years | Verification purposes |

---

## 4. Data Deletion Procedures

### 4.1 Soft Deletion (Default)

NCC implements soft deletion as the default mechanism:
- Records are marked with a `deletedAt` timestamp
- Data remains in the database but is excluded from queries
- Allows for recovery within the retention period
- Maintains referential integrity

### 4.2 Hard Deletion (Permanent)

Permanent deletion occurs:
- After the retention period expires
- Upon verified data subject request (GDPR Article 17)
- When required by legal order
- During scheduled data purge cycles

### 4.3 Data Subject Deletion Requests

When a user requests deletion of their personal data:

1. **Verification**: Confirm the identity of the requestor
2. **Scope Assessment**: Identify all data associated with the user
3. **Legal Review**: Check for legal holds or retention requirements
4. **Execution**: 
   - Soft delete immediately (within 72 hours)
   - Hard delete after 30-day grace period
5. **Confirmation**: Notify the user of completion
6. **Documentation**: Log the request and actions taken

**Response Timeline**: Within 30 days of verified request (GDPR requirement)

### 4.4 Exceptions to Deletion

Data may be retained beyond the standard period when:
- Subject to active litigation or legal hold
- Required for ongoing regulatory investigation
- Necessary for tax or audit purposes
- Part of aggregated/anonymized datasets

---

## 5. Data Archival

### 5.1 Archival Process

Data approaching end of active use is archived:
- Moved to cold storage (reduced-cost tier)
- Compressed and encrypted
- Access restricted to authorized personnel
- Metadata retained for retrieval

### 5.2 Archived Data Access

Accessing archived data requires:
- Written justification
- Approval from Data Protection Officer or equivalent
- Audit log entry

---

## 6. Backup and Recovery

### 6.1 Backup Retention

| Backup Type | Retention Period |
|-------------|------------------|
| Daily backups | 30 days |
| Weekly backups | 90 days |
| Monthly backups | 1 year |
| Annual backups | 7 years |

### 6.2 Backup Deletion

Backups are included in data deletion scope:
- Deleted data is removed from future backups
- Existing backups with deleted data are retained per backup retention schedule
- After backup expiration, deleted data no longer exists anywhere

---

## 7. Tenant (Organization) Data

### 7.1 Active Tenants

Data retained according to standard retention periods.

### 7.2 Churned/Inactive Tenants

| Status | Timeline | Action |
|--------|----------|--------|
| Subscription ended | Immediate | Soft delete, data access disabled |
| 30 days post-churn | Grace period | Data recoverable on request |
| 90 days post-churn | Archive | Data moved to cold storage |
| 1 year post-churn | Deletion | Permanent deletion (unless legal hold) |

### 7.3 Tenant Data Export

Before deletion, tenants may request:
- Full data export in machine-readable format (JSON/CSV)
- Document downloads
- Audit log extract

---

## 8. Implementation

### 8.1 Technical Controls

NCC implements the following technical controls:

```
- Soft delete fields (deletedAt) on key entities
- Automated archival jobs (scheduled)
- Data purge procedures (manual trigger with approval)
- Encryption of archived data (AES-256)
- Access controls on archived data
```

### 8.2 Automated Retention Enforcement

| Process | Frequency | Description |
|---------|-----------|-------------|
| Inactive user identification | Weekly | Flag accounts with no login > 2 years |
| Session cleanup | Daily | Remove expired tokens |
| Log rotation | Daily | Archive and compress old logs |
| Backup pruning | Weekly | Remove expired backups |
| Data purge | Monthly | Permanent deletion of eligible records |

---

## 9. Roles and Responsibilities

| Role | Responsibility |
|------|----------------|
| **Data Protection Officer** | Policy oversight, deletion request approval |
| **System Administrators** | Execute data deletion, manage backups |
| **Tenant Administrators** | Submit deletion requests for their users |
| **Development Team** | Implement retention controls |
| **Legal/Compliance** | Define legal holds, review retention periods |

---

## 10. Compliance

### 10.1 Regulatory Alignment

This policy aligns with:
- **GDPR** (EU General Data Protection Regulation)
  - Article 5: Storage limitation principle
  - Article 17: Right to erasure
- **CCPA** (California Consumer Privacy Act)
  - Right to deletion
- **HIPAA** (if applicable to tenant data)
- **SOX** (financial record retention)
- **IRS Requirements** (7-year retention for tax records)
- **DOL Requirements** (payroll record retention)
- **OSHA Requirements** (training and safety records)

### 10.2 Construction Industry Requirements

Additional retention for construction-specific data:
- Project documentation: Statute of repose period (varies by state, typically 6-10 years)
- Safety records: OSHA requires 5+ years
- Certified payroll: Davis-Bacon requires 3 years after project completion

---

## 11. Policy Review

This policy is reviewed:
- **Annually** (minimum)
- After significant regulatory changes
- After data breaches or incidents
- When business requirements change

**Review Process**:
1. Legal/Compliance review of retention periods
2. Technical review of implementation
3. Gap analysis against current practices
4. Update policy and communicate changes
5. Train affected personnel

---

## 12. Violations

Failure to comply with this policy may result in:
- Regulatory fines and penalties
- Legal liability
- Reputational damage
- Disciplinary action for responsible personnel

---

## 13. Contact

For questions about this policy or to submit a data deletion request:

**Email:** support@nfsgrp.com
**Subject Line:** Data Retention/Deletion Request

---

## Revision History

| Version | Date | Changes | Approved By |
|---------|------|---------|-------------|
| 1.0 | 2026-02-16 | Initial release | NFS Group Leadership |

---

**Document Owner:** NFS Group Data Protection Officer
**Classification:** Internal
**Next Review:** February 2027

---

© 2026 NFS Group. All rights reserved.
