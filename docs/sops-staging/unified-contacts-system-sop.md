---
title: "Unified Contacts System SOP"
module: unified-contacts
revision: "1.0"
tags: [sop, contacts, directory, mobile, invite, referral, phone-sync, admin, operations, all-users]
status: draft
created: 2026-02-25
updated: 2026-02-25
author: Warp
visibility:
  public: false
  internal: true
  roles: [all]
---

<style>
  .uc-container { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1f2937; }
  .uc-header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; padding: 32px; border-radius: 12px; margin-bottom: 24px; }
  .uc-header h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; }
  .uc-header .subtitle { opacity: 0.9; font-size: 16px; }
  .uc-meta { display: flex; gap: 24px; margin-top: 16px; font-size: 13px; opacity: 0.8; flex-wrap: wrap; }
  .uc-intro { background: #f8fafc; border-left: 4px solid #0d47a1; padding: 16px 20px; margin-bottom: 24px; border-radius: 0 8px 8px 0; }
  .section { background: white; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
  .section-header { background: #f1f5f9; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; }
  .section-number { background: #0d47a1; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .section-title { font-size: 18px; font-weight: 600; color: #0f172a; margin: 0; }
  .section-content { padding: 20px; }
  .step { margin-bottom: 16px; padding-left: 20px; border-left: 2px solid #e5e7eb; }
  .step:last-child { margin-bottom: 0; }
  .step-title { font-weight: 600; color: #374151; margin-bottom: 4px; }
  .step-detail { color: #6b7280; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; margin-right: 4px; }
  .badge-ncc { background: #dbeafe; color: #1e40af; }
  .badge-personal { background: #ede9fe; color: #6d28d9; }
  .badge-phone { background: #dcfce7; color: #166534; }
  .table-wrap { overflow-x: auto; margin: 12px 0; }
  .info-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .info-table th { text-align: left; padding: 8px 12px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; color: #374151; }
  .info-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
  .callout { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 12px 0; font-size: 13px; }
  .callout-info { background: #eff6ff; border-color: #93c5fd; }
</style>

<div class="uc-container">

<div class="uc-header">
  <h1>Unified Contacts System</h1>
  <div class="subtitle">NCC Org Contacts + Personal Contacts + Phone Sync + Mobile Invite Workflow</div>
  <div class="uc-meta">
    <span>👥 All Users</span>
    <span>📱 Mobile + Web</span>
    <span>🔗 4 Contact Sources</span>
    <span>✉️ Invite + Referral</span>
  </div>
</div>

<div class="uc-intro">
  <strong>Purpose:</strong> The Unified Contacts System merges four contact sources into a single searchable directory available across mobile and web. NCC organizational contacts (team members, clients, subcontractors) are the primary source. Personal contacts provide supplementary convenience and can be toggled on/off. Phone contacts from the mobile device can be synced into NCC. Invites and referrals can be sent directly from the directory.
</div>

## Who Uses This

- **All authenticated users** — Browse the unified directory, search contacts, call/email/text
- **OWNER / ADMIN** — Send company invites to bring new members into the organization
- **Any user** — Send referrals to the NEXUS workforce network
- **Mobile users** — Import phone contacts, use native share sheet for invites

---

<div class="section">
  <div class="section-header">
    <div class="section-number">1</div>
    <h2 class="section-title">Contact Sources Overview</h2>
  </div>
  <div class="section-content">

The directory merges four sources, deduplicated by email:

<div class="table-wrap">
<table class="info-table">
  <thead>
    <tr>
      <th>Source</th>
      <th>Category</th>
      <th>Badge</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Company Members</strong></td>
      <td>internal</td>
      <td><span class="badge badge-ncc">NCC Team</span></td>
      <td>Users with active CompanyMembership in your tenant (employees, crew)</td>
    </tr>
    <tr>
      <td><strong>Tenant Clients</strong></td>
      <td>clients</td>
      <td><span class="badge badge-ncc">NCC Client</span></td>
      <td>TenantClient records — homeowners, adjusters, property managers</td>
    </tr>
    <tr>
      <td><strong>Subcontractors</strong></td>
      <td>subs</td>
      <td><span class="badge badge-ncc">NCC Sub</span></td>
      <td>Accepted cross-tenant invites — partner companies</td>
    </tr>
    <tr>
      <td><strong>Personal Contacts</strong></td>
      <td>personal</td>
      <td><span class="badge badge-personal">Personal</span></td>
      <td>Your private contact book — imported from phone, CSV, or manual entry</td>
    </tr>
  </tbody>
</table>
</div>

<div class="callout callout-info">
  <strong>Priority:</strong> NCC contacts always appear first. If a contact exists in both NCC and Personal (same email), the NCC version takes precedence and the personal duplicate is hidden.
</div>

  </div>
</div>

<div class="section">
  <div class="section-header">
    <div class="section-number">2</div>
    <h2 class="section-title">Browsing the Directory (Mobile)</h2>
  </div>
  <div class="section-content">
    <div class="step">
      <div class="step-title">Open the Directory Tab</div>
      <div class="step-detail">Tap the <strong>Directory</strong> tab in the bottom navigation bar. The unified contact list loads with NCC org contacts as the default view.</div>
    </div>
    <div class="step">
      <div class="step-title">Filter by Category</div>
      <div class="step-detail">Use the horizontal category tabs: <strong>All</strong>, <strong>Team</strong>, <strong>Clients</strong>, <strong>Subs</strong>, <strong>Personal</strong>. Selecting a tab filters to that source category.</div>
    </div>
    <div class="step">
      <div class="step-title">Toggle Personal Contacts</div>
      <div class="step-detail">Use the <strong>Personal</strong> switch (right side of the tabs row) to include or exclude your personal contacts from the list. This preference is remembered across sessions.</div>
    </div>
    <div class="step">
      <div class="step-title">Search</div>
      <div class="step-detail">Type in the search bar to filter by name, email, company, or role. Search applies across all visible categories.</div>
    </div>
    <div class="step">
      <div class="step-title">Quick Actions</div>
      <div class="step-detail">Each contact card shows action buttons: 📞 (call), 💬 (SMS), ✉️ (email). Tap to open the native dialer, messaging, or email app.</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-header">
    <div class="section-number">3</div>
    <h2 class="section-title">Importing Phone Contacts (Mobile)</h2>
  </div>
  <div class="section-content">
    <div class="step">
      <div class="step-title">Tap "📱 Import" in the Directory Header</div>
      <div class="step-detail">This opens the Phone Contacts screen. On first use, the app will request permission to access your device contacts.</div>
    </div>
    <div class="step">
      <div class="step-title">Grant Contacts Permission</div>
      <div class="step-detail">Tap <strong>Allow</strong> when prompted. If denied, go to device Settings → Nexus Mobile → Contacts to enable. The app will show a guidance message if permission is denied.</div>
    </div>
    <div class="step">
      <div class="step-title">Search and Select Contacts</div>
      <div class="step-detail">Browse or search your phone contacts. Tap individual contacts to select them, or use <strong>Select All</strong> for bulk selection. Selected contacts show a blue checkmark.</div>
    </div>
    <div class="step">
      <div class="step-title">Sync to NCC</div>
      <div class="step-detail">Tap <strong>"Sync N Contacts to NCC"</strong> at the bottom. The app sends selected contacts to the server. Existing contacts (matched by email or phone) are updated; new contacts are created. A summary shows how many were added vs. updated.</div>
    </div>

<div class="callout">
  <strong>Privacy:</strong> Phone contacts are synced into <em>your</em> personal contact book only. They are not visible to other users or your company. You control whether they appear in the directory via the Personal toggle.
</div>

  </div>
</div>

<div class="section">
  <div class="section-header">
    <div class="section-number">4</div>
    <h2 class="section-title">Inviting Contacts (Mobile)</h2>
  </div>
  <div class="section-content">
    <div class="step">
      <div class="step-title">Tap "+ Invite" in the Directory Header</div>
      <div class="step-detail">This opens the Invite screen, which loads all directory contacts (NCC + Personal).</div>
    </div>
    <div class="step">
      <div class="step-title">Choose Invite Mode</div>
      <div class="step-detail">
        <strong>Company Invite</strong> (OWNER/ADMIN only): Sends an email invitation to join your company on NEXUS with a MEMBER role. Recipients receive an accept link.<br>
        <strong>Referral</strong> (any user): Refers contacts to the NEXUS workforce network. Creates a NexNetCandidate and referral tracking record.
      </div>
    </div>
    <div class="step">
      <div class="step-title">Select Contacts</div>
      <div class="step-detail">Tap contacts to select them for invite. Contacts without an email address are greyed out and cannot be selected. A <span class="badge badge-ncc">●</span> blue dot = NCC source, <span class="badge badge-personal">●</span> purple dot = Personal source.</div>
    </div>
    <div class="step">
      <div class="step-title">Send Invites</div>
      <div class="step-detail">Tap <strong>"Send Invites"</strong> or <strong>"Send Referrals"</strong> to process all selected contacts. Each invite is sent individually; a summary shows success/failure count.</div>
    </div>
    <div class="step">
      <div class="step-title">Share Link (Company Invite Only)</div>
      <div class="step-detail">Tap <strong>"Share Link"</strong> to generate an invite URL and open the native share sheet (iMessage, WhatsApp, email, etc.). The link skips email delivery — the recipient clicks the shared link directly.</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-header">
    <div class="section-number">5</div>
    <h2 class="section-title">Using the Contact Picker (Web)</h2>
  </div>
  <div class="section-content">
    <div class="step">
      <div class="step-title">Open the Contact Picker Modal</div>
      <div class="step-detail">On the web, the contact picker appears as a modal dialog on the Referrals page or when inviting from project settings. It loads the unified directory.</div>
    </div>
    <div class="step">
      <div class="step-title">Filter by Category</div>
      <div class="step-detail">Use the pill-shaped category tabs at the top: All, Team, Clients, Subs, Personal. Check/uncheck <strong>"Include personal"</strong> to toggle personal contacts.</div>
    </div>
    <div class="step">
      <div class="step-title">Select Invite Mode</div>
      <div class="step-detail">Toggle between <strong>Paid referral</strong> (green highlight) and <strong>Company invite</strong> (amber highlight). Select contacts via checkboxes, then confirm to send.</div>
    </div>
    <div class="step">
      <div class="step-title">Source Badges</div>
      <div class="step-detail">Each contact shows a colored badge: <span class="badge badge-ncc">NCC Team</span>, <span class="badge badge-ncc">NCC Client</span>, <span class="badge badge-ncc">NCC Sub</span>, or <span class="badge badge-personal">Personal</span>. Additional flags show "Already referred" or "In your organization" when applicable.</div>
    </div>
  </div>
</div>

---

## System Architecture

<div class="mermaid">
graph TD
    A[GET /contacts/directory] --> B{Category Filter}
    B -->|internal| C[CompanyMembership + User]
    B -->|clients| D[TenantClient]
    B -->|subs| E[CrossTenantInvite - ACCEPTED]
    B -->|personal| F[PersonalContact]
    B -->|all| C & D & E

    F -->|includePersonal=true| G[Merge + Deduplicate by Email]
    C --> G
    D --> G
    E --> G

    G --> H[Search Filter]
    H --> I[Sort: NCC first, then Personal]
    I --> J[Return to Client]

    K[Mobile: PhoneContactsScreen] -->|expo-contacts| L[Device Address Book]
    L -->|Selected contacts| M[POST /personal-contacts/import]
    M --> F

    N[InviteScreen] -->|Company Invite| O[POST /companies/me/invites]
    N -->|Referral| P[POST /referrals]
    N -->|Share Link| Q[Native Share Sheet]

    style A fill:#dbeafe,stroke:#1e40af
    style K fill:#dcfce7,stroke:#166534
    style N fill:#fef3c7,stroke:#d97706
</div>

---

## API Endpoints

<div class="table-wrap">
<table class="info-table">
  <thead>
    <tr>
      <th>Method</th>
      <th>Path</th>
      <th>Purpose</th>
      <th>Auth</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>GET</td>
      <td>/contacts/directory</td>
      <td>Unified directory (search, category, includePersonal, projectId, limit)</td>
      <td>JWT</td>
    </tr>
    <tr>
      <td>POST</td>
      <td>/personal-contacts/import</td>
      <td>Import phone contacts into personal book</td>
      <td>JWT</td>
    </tr>
    <tr>
      <td>POST</td>
      <td>/companies/me/invites</td>
      <td>Send company invite (email, role, channel)</td>
      <td>JWT + OWNER/ADMIN</td>
    </tr>
    <tr>
      <td>POST</td>
      <td>/referrals</td>
      <td>Create referral to NEXUS workforce network</td>
      <td>JWT</td>
    </tr>
  </tbody>
</table>
</div>

---

## Key Features

- **Unified view** — One directory, four sources, zero duplication
- **NCC-first** — Organizational contacts are always the primary view
- **Personal toggle** — Personal contacts are opt-in, remembered per device
- **Phone sync** — Import from device address book with permission handling
- **Bulk invite** — Select multiple contacts and send invites or referrals in one action
- **Share sheet** — Native iOS/Android share for invite links (iMessage, WhatsApp, etc.)
- **Cross-platform** — Same directory data on mobile and web

## Related Modules

- [Personal Contacts](/settings/personal-contacts) — Manage personal contact book
- [Referrals](/referrals) — Track referral status and earnings
- [Company Users](/company/users) — Manage organization members and roles
- [Cross-Tenant Invites](/admin/cross-tenant) — Subcontractor invite management

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-25 | Initial release — unified directory, phone sync, mobile invite flow |

</div>
