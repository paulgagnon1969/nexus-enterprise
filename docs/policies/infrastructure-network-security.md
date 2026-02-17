---
title: "Infrastructure and Network Security"
module: security
revision: "1.0"
tags: [policy, security, infrastructure, network, tls, encryption, api-security, admin]
status: published
created: 2026-02-16
updated: 2026-02-16
author: NFS Group
---

# Infrastructure and Network Security

**Nexus Contractor Connect (NCC)**
**NFS Group**

**Effective Date:** February 16, 2026
**Last Updated:** February 16, 2026
**Version:** 1.0

---

## 1. Purpose

This document defines the infrastructure and network security controls for Nexus Contractor Connect (NCC), ensuring secure communication between clients, servers, and services. It covers encryption in transit, network architecture, API security, and infrastructure hardening.

---

## 2. Scope

This policy applies to:
- All network communications to and from NCC systems
- API endpoints (REST, WebSocket)
- Mobile application communications
- Internal service-to-service communications
- Third-party integrations
- Development, staging, and production environments

---

## 3. Encryption in Transit

### 3.1 TLS Requirements

All data transmitted to or from NCC systems must be encrypted using Transport Layer Security (TLS).

| Requirement | Specification |
|-------------|---------------|
| **Minimum TLS Version** | TLS 1.2 |
| **Recommended TLS Version** | TLS 1.3 |
| **Certificate Authority** | Trusted public CA (e.g., Let's Encrypt, DigiCert) |
| **Certificate Validity** | Maximum 1 year, auto-renewal enabled |
| **Key Size** | RSA 2048-bit minimum, or ECDSA P-256 |

### 3.2 Cipher Suites

**Allowed Cipher Suites (TLS 1.3):**
- TLS_AES_256_GCM_SHA384
- TLS_AES_128_GCM_SHA256
- TLS_CHACHA20_POLY1305_SHA256

**Allowed Cipher Suites (TLS 1.2):**
- ECDHE-RSA-AES256-GCM-SHA384
- ECDHE-RSA-AES128-GCM-SHA256
- ECDHE-ECDSA-AES256-GCM-SHA384
- ECDHE-ECDSA-AES128-GCM-SHA256

**Prohibited:**
- SSLv2, SSLv3, TLS 1.0, TLS 1.1
- RC4, DES, 3DES, MD5-based MACs
- Export-grade ciphers
- NULL ciphers

### 3.3 HTTPS Enforcement

| Control | Implementation |
|---------|----------------|
| **HTTPS Only** | All HTTP requests redirected to HTTPS (301) |
| **HSTS** | Strict-Transport-Security header enabled |
| **HSTS Max-Age** | 31536000 seconds (1 year) |
| **HSTS Preload** | Submitted to browser preload lists |
| **Mixed Content** | Blocked; all resources loaded over HTTPS |

### 3.4 Certificate Management

- **Automated Renewal:** Certificates auto-renew via ACME protocol
- **Monitoring:** Certificate expiration monitored with 30-day alerts
- **Revocation:** Compromised certificates revoked immediately via CRL/OCSP
- **Key Storage:** Private keys stored securely, never in source control

---

## 4. Network Architecture

### 4.1 Production Environment

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS (443)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    CDN / Edge Network                        │
│                 (Vercel Edge, Cloudflare)                   │
│  • DDoS protection                                          │
│  • WAF rules                                                │
│  • Geographic distribution                                  │
│  • SSL termination                                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌──────────────────┐            ┌──────────────────┐
│    Web App       │            │    API Server    │
│  (Next.js/Vercel)│            │  (NestJS/Render) │
│                  │            │                  │
│  • Static assets │            │  • REST API      │
│  • SSR pages     │◄──────────►│  • Auth services │
│  • Client app    │   HTTPS    │  • Business logic│
└──────────────────┘            └────────┬─────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
          ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
          │  PostgreSQL  │     │    Redis     │     │ File Storage │
          │  (Managed)   │     │  (Managed)   │     │   (S3/R2)    │
          │              │     │              │     │              │
          │ • Encrypted  │     │ • In-memory  │     │ • Encrypted  │
          │ • VPC-only   │     │ • VPC-only   │     │ • Signed URLs│
          └──────────────┘     └──────────────┘     └──────────────┘
```

### 4.2 Network Segmentation

| Zone | Purpose | Access |
|------|---------|--------|
| **Public Edge** | CDN, load balancers | Internet-facing |
| **Application Tier** | Web servers, API servers | Edge only |
| **Data Tier** | Databases, caches | Application tier only |
| **Management** | Admin tools, monitoring | VPN/bastion only |

### 4.3 Firewall Rules

**Ingress (Inbound):**
| Source | Destination | Port | Protocol | Action |
|--------|-------------|------|----------|--------|
| Any | Edge/CDN | 443 | HTTPS | Allow |
| Any | Edge/CDN | 80 | HTTP | Redirect to 443 |
| Edge | API servers | 8000 | HTTPS | Allow |
| API servers | Database | 5432 | PostgreSQL | Allow |
| API servers | Redis | 6379 | Redis | Allow |
| All other | * | * | * | Deny |

**Egress (Outbound):**
| Source | Destination | Port | Protocol | Purpose |
|--------|-------------|------|----------|---------|
| API servers | SMTP relay | 587 | TLS | Email delivery |
| API servers | External APIs | 443 | HTTPS | Integrations |

---

## 5. API Security

### 5.1 Authentication

All API requests require authentication except explicitly public endpoints.

| Method | Use Case |
|--------|----------|
| **JWT Bearer Token** | Standard API authentication |
| **Device Sync Token** | Mobile offline-first sync |
| **API Key** | Service-to-service (internal) |

### 5.2 Request Security

| Control | Implementation |
|---------|----------------|
| **Input Validation** | All inputs validated via NestJS ValidationPipe |
| **Whitelist Mode** | Only explicitly allowed fields processed |
| **Request Size Limit** | 10MB maximum body size |
| **Content-Type Validation** | Strict content-type checking |

### 5.3 Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 10 requests | 1 minute |
| MFA Verification | 5 attempts | 15 minutes |
| Standard API | 100 requests | 1 minute |
| File Upload | 20 requests | 1 minute |
| Bulk Operations | 10 requests | 1 minute |

### 5.4 CORS Policy

```
Access-Control-Allow-Origin: https://ncc-nexus-contractor-connect.com
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

### 5.5 Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | max-age=31536000; includeSubDomains | Force HTTPS |
| `X-Content-Type-Options` | nosniff | Prevent MIME sniffing |
| `X-Frame-Options` | DENY | Prevent clickjacking |
| `X-XSS-Protection` | 1; mode=block | XSS filter |
| `Content-Security-Policy` | default-src 'self'; ... | Content restrictions |
| `Referrer-Policy` | strict-origin-when-cross-origin | Referrer control |

---

## 6. Infrastructure Security

### 6.1 Cloud Provider Security

| Provider | Service | Security Features |
|----------|---------|-------------------|
| **Vercel** | Web hosting | Edge network, DDoS protection, automatic HTTPS |
| **Render/Railway** | API hosting | Private networking, managed TLS |
| **Neon/Supabase** | PostgreSQL | Encryption at rest, connection pooling, VPC |
| **Upstash** | Redis | TLS connections, encryption at rest |
| **Cloudflare R2/S3** | File storage | Encryption at rest, signed URLs |

### 6.2 Environment Isolation

| Environment | Purpose | Data |
|-------------|---------|------|
| **Production** | Live customer data | Real data, full security |
| **Staging** | Pre-release testing | Anonymized/synthetic data |
| **Development** | Local development | Test data only |

**Controls:**
- Production credentials never shared with non-production
- Database connections restricted by environment
- Separate API keys per environment

### 6.3 Secrets Management

| Secret Type | Storage | Access |
|-------------|---------|--------|
| Database credentials | Environment variables | API servers only |
| JWT signing keys | Environment variables | API servers only |
| MFA encryption key | Environment variables | API servers only |
| Third-party API keys | Environment variables | As needed |

**Requirements:**
- Secrets never committed to source control
- Secrets rotated on suspected compromise
- Minimum necessary access principle
- Audit logging for secret access

### 6.4 DDoS Protection

| Layer | Protection |
|-------|------------|
| **L3/L4** | CDN-level traffic filtering, IP reputation |
| **L7** | Rate limiting, WAF rules, bot detection |
| **Application** | Request throttling, circuit breakers |

---

## 7. Mobile Application Security

### 7.1 Network Security

| Control | Implementation |
|---------|----------------|
| **Certificate Pinning** | Public key pinning for API endpoints |
| **TLS Validation** | Full certificate chain validation |
| **Proxy Detection** | Warning on detected MITM attempts |

### 7.2 Offline-First Sync

- Sync credentials (userToken + companyToken) transmitted over TLS
- Local data encrypted on device
- Sync conflicts resolved server-side
- Connection retry with exponential backoff

---

## 8. Monitoring and Logging

### 8.1 Network Monitoring

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Failed TLS handshakes | >100/min | Warning |
| 4xx error rate | >10% | Warning |
| 5xx error rate | >1% | Critical |
| Response latency P99 | >2s | Warning |
| Request volume spike | >200% baseline | Warning |

### 8.2 Security Event Logging

All security-relevant events are logged:
- Authentication attempts (success/failure)
- MFA verification attempts
- Rate limit triggers
- Invalid request rejections
- Certificate errors

---

## 9. Incident Response

### 9.1 Network Security Incidents

| Incident Type | Response |
|---------------|----------|
| **DDoS Attack** | Enable enhanced DDoS protection, block malicious IPs |
| **Certificate Compromise** | Revoke certificate, issue new certificate, rotate keys |
| **API Abuse** | Block offending IPs/tokens, review rate limits |
| **Data Breach Attempt** | Isolate affected systems, forensic analysis |

### 9.2 Contact

**Security Team:** support@nfsgrp.com

Report network security incidents immediately.

---

## 10. Compliance

This infrastructure security implementation aligns with:
- **SOC 2 Type II** - Security and availability principles
- **OWASP API Security Top 10** - API security best practices
- **CIS Controls** - Infrastructure hardening guidelines
- **PCI DSS** (where applicable) - Network segmentation requirements

---

## 11. Review and Updates

This policy is reviewed:
- Quarterly for technical accuracy
- After any security incident
- When infrastructure changes are made
- When new services are deployed

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
