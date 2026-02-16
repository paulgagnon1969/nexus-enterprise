# Information Security Policy

**Nexus Contractor Connect (NCC)**
**NFS Group**

**Effective Date:** February 16, 2026
**Last Updated:** February 16, 2026
**Version:** 1.0

---

## 1. Purpose

This Information Security Policy establishes the security framework for Nexus Contractor Connect (NCC), ensuring the confidentiality, integrity, and availability of all information assets. This policy applies to all users, administrators, and systems that access or process data within the NCC platform.

---

## 2. Scope

This policy covers:
- All data stored, processed, or transmitted by NCC
- All users including employees, contractors, and third-party integrations
- All systems including web applications, mobile applications, APIs, and databases
- All environments including production, staging, and development

---

## 3. Authentication & Access Control

### 3.1 Password Security

- **Hashing Algorithm:** All passwords are hashed using Argon2id, a memory-hard algorithm resistant to GPU and ASIC attacks
- **Legacy Migration:** Bcrypt hashes from legacy systems are automatically upgraded to Argon2 upon successful login
- **Password Requirements:** Passwords must meet minimum complexity requirements as enforced by the application
- **Password Reset:** Reset tokens expire after 15 minutes and are single-use

### 3.2 Token-Based Authentication

- **Access Tokens:** Short-lived JWT tokens used for API authentication
- **Refresh Tokens:** 30-day TTL, stored securely in Redis, rotated on each use
- **Token Revocation:** Tokens are invalidated upon logout or password change
- **Device Sync Tokens:** Permanent tokens for mobile offline-first synchronization, scoped to user and company

### 3.3 Role-Based Access Control (RBAC)

NCC implements a hierarchical role system:

**Global Roles (Platform-Wide):**
| Role | Level | Description |
|------|-------|-------------|
| SUPER_ADMIN | 100 | Full platform access, all companies |
| NCC_SYSTEM_DEVELOPER | 95 | Internal development access |
| SUPPORT | 85 | Customer support access |
| NONE | 0 | No elevated privileges |

**Company Roles (Tenant-Scoped):**
| Role | Level | Description |
|------|-------|-------------|
| OWNER | 90 | Full company administration |
| ADMIN | 80 | Company management, user administration |
| MEMBER | 40 | Standard internal user access |
| CLIENT | 10 | External client portal access |

**Profile-Based Permissions:**
| Profile | Level | Typical Use |
|---------|-------|-------------|
| EXECUTIVE | 70 | C-suite, executive oversight |
| PM | 60 | Project managers |
| SUPERINTENDENT | 58 | On-site leadership |
| HR | 55 | Human resources |
| FINANCE | 55 | Financial operations |
| FOREMAN | 50 | Crew leadership |
| CREW | 40 | Field workers |

### 3.4 Field-Level Security

NCC provides granular permission control at the field level:
- **View:** Ability to see field data
- **Edit:** Ability to modify field data
- **Export:** Ability to export/download field data

Administrators can configure these permissions per resource type per role, allowing fine-grained data access control.

### 3.5 Multi-Tenant Isolation

- All data is scoped to a specific company (tenant)
- Users can only access data within companies they have active memberships
- Cross-tenant data access is prevented at the database query level
- SUPER_ADMIN users have read access across tenants for support purposes

---

## 4. Data Protection

### 4.1 Encryption at Rest

- **Sensitive HR Data:** Encrypted using AES-256-GCM with authenticated encryption
- **Encryption Keys:** Derived from environment-configured secrets using SHA-256
- **Database:** PostgreSQL with encryption at rest (managed database provider)

### 4.2 Encryption in Transit

- **HTTPS/TLS:** All communications encrypted via TLS 1.2+
- **API Communications:** All API endpoints require HTTPS
- **Mobile Sync:** Device-to-server communication encrypted

### 4.3 Data Classification

| Classification | Description | Examples |
|----------------|-------------|----------|
| **Confidential** | Highly sensitive business data | Financial records, HR data, SSN |
| **Internal** | Business operational data | Project details, timecards, documents |
| **Public** | Non-sensitive information | Published SOPs, public landing pages |

### 4.4 Data Retention

- **Soft Deletes:** Company and user records use soft deletion (deletedAt timestamp)
- **Audit Logs:** Retained indefinitely for compliance purposes
- **Backup Retention:** Per database provider SLA (typically 30 days point-in-time recovery)

---

## 5. Session Management

### 5.1 Session Lifecycle

- **Session Initialization:** Created upon successful authentication
- **Session Refresh:** Access tokens refreshed automatically using refresh tokens
- **Session Termination:** Explicit logout clears all stored tokens
- **Idle Timeout:** Configurable per deployment

### 5.2 Concurrent Sessions

- Multiple device sessions are permitted
- Each device receives unique refresh tokens
- Session revocation is device-specific unless global logout is triggered

---

## 6. Audit & Logging

### 6.1 Administrative Audit Log

All administrative actions are logged with:
- Actor ID and email
- Actor's global role
- Action performed
- Target company/user (if applicable)
- Additional metadata
- Timestamp

**Logged Actions Include:**
- Company creation/modification
- User invitation/removal
- Role changes
- Permission modifications
- Data exports
- Configuration changes

### 6.2 Activity Logging

Operational activities are logged throughout the system:
- Project lifecycle events
- Document access and modifications
- Timecard submissions
- Financial transactions
- System configuration changes

### 6.3 Log Security

- Logs are write-only (no deletion capability for standard users)
- Access to audit logs restricted to SUPER_ADMIN and authorized personnel
- Logs include sufficient detail for forensic investigation

---

## 7. Infrastructure Security

### 7.1 API Security

- **Input Validation:** All inputs validated and sanitized using NestJS ValidationPipe
- **Whitelist Mode:** Only explicitly allowed fields are processed
- **Rate Limiting:** Configurable per endpoint (recommended for production)
- **CORS Policy:** Origin-based with credentials support for authenticated requests

### 7.2 File Upload Security

- **Size Limits:** Maximum 10MB per file upload
- **Type Validation:** File types validated on upload
- **Storage:** Files stored with access controls; public URLs require authentication

### 7.3 Deployment Security

- **Platform:** Vercel (web), managed cloud infrastructure
- **Environment Variables:** Secrets stored in environment configuration, never in code
- **CI/CD:** Automated deployments with security checks

---

## 8. Mobile Application Security

### 8.1 Nexus Mobile

- **Offline-First Architecture:** Data synced securely when connectivity available
- **Local Storage:** Sensitive data encrypted on device
- **Location Data:** Collected only when actively using the app with user permission
- **No Background Collection:** Location tracking stops when app is not in use

### 8.2 Device Authentication

- Device sync tokens provide persistent authentication
- Tokens scoped to specific user and company
- Token revocation supported for lost/stolen devices

---

## 9. Incident Response

### 9.1 Security Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Active breach, data exfiltration | Immediate |
| High | Vulnerability discovered, potential breach | 4 hours |
| Medium | Security misconfiguration | 24 hours |
| Low | Policy violation, minor issue | 72 hours |

### 9.2 Incident Response Procedure

1. **Detection:** Identify and classify the incident
2. **Containment:** Isolate affected systems/accounts
3. **Investigation:** Determine scope and impact
4. **Remediation:** Fix vulnerabilities, restore services
5. **Communication:** Notify affected parties as required
6. **Documentation:** Record incident details and lessons learned

### 9.3 Contact Information

**Security Team:** support@nfsgrp.com

Report security vulnerabilities or incidents immediately to the security team.

---

## 10. Compliance

### 10.1 Standards Alignment

This security implementation aligns with:
- SOC 2 Type II principles
- OWASP Top 10 security practices
- Apple App Store privacy guidelines

### 10.2 Privacy Compliance

- Privacy Policy published at /welcome#privacy and /privacy
- Location data handling complies with iOS Location Services requirements
- No third-party data sharing or tracking

---

## 11. User Responsibilities

All users of NCC are expected to:

1. **Protect Credentials:** Never share passwords or tokens
2. **Report Incidents:** Immediately report suspicious activity
3. **Secure Devices:** Maintain device security (screen locks, encryption)
4. **Follow Policy:** Adhere to this security policy and company guidelines
5. **Training:** Complete security awareness training as required

---

## 12. Policy Review

This policy is reviewed and updated:
- Annually at minimum
- After any significant security incident
- When major platform changes are implemented
- When regulatory requirements change

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-16 | Initial release |

---

**Document Owner:** NFS Group Security Team
**Approved By:** NFS Group Leadership
**Classification:** Internal

---

*For questions about this policy, contact support@nfsgrp.com*
