import { PnpReviewStatus } from "@prisma/client";

export interface DisclaimerContext {
  reviewStatus: PnpReviewStatus;
  companyName: string;
  reviewerName?: string | null;
  reviewedAt?: Date | null;
  isFork?: boolean;
}

/**
 * Generate disclaimer HTML banner based on PnP document review status.
 * This disclaimer is injected at the top of rendered PnP documents to
 * clarify ownership, approval status, and liability.
 */
export function generateDisclaimerHtml(ctx: DisclaimerContext): string {
  const { reviewStatus, companyName, reviewerName, reviewedAt, isFork } = ctx;
  const dateStr = reviewedAt
    ? reviewedAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const styles = {
    base: `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 16px 20px;
      margin-bottom: 24px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.5;
    `,
    warning: `
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border: 1px solid #f59e0b;
      color: #92400e;
    `,
    approved: `
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      border: 1px solid #10b981;
      color: #065f46;
    `,
    modified: `
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      border: 1px solid #3b82f6;
      color: #1e40af;
    `,
    rejected: `
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      border: 1px solid #ef4444;
      color: #991b1b;
    `,
  };

  switch (reviewStatus) {
    case PnpReviewStatus.PENDING_REVIEW:
      return `
        <div class="pnp-disclaimer pnp-disclaimer--pending" style="${styles.base}${styles.warning}">
          <strong>⚠️ PENDING REVIEW</strong>
          <p style="margin: 8px 0 0 0;">
            This document has been provided by <strong>NEXUS</strong> as a reference template. 
            It has <strong>NOT</strong> been reviewed or approved by <strong>${escapeHtml(companyName)}</strong> 
            and should not be considered official policy until approved by an administrator.
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.85;">
            NEXUS provides this document as a starting point only. Your organization is responsible 
            for reviewing, customizing, and approving all policies before adoption.
          </p>
        </div>
      `;

    case PnpReviewStatus.APPROVED:
      return `
        <div class="pnp-disclaimer pnp-disclaimer--approved" style="${styles.base}${styles.approved}">
          <strong>✓ APPROVED POLICY</strong>
          <p style="margin: 8px 0 0 0;">
            This document was reviewed and approved by <strong>${escapeHtml(reviewerName || "Administrator")}</strong> 
            on <strong>${dateStr || "record"}</strong>. 
            <strong>${escapeHtml(companyName)}</strong> has adopted this policy as provided by NEXUS.
          </p>
        </div>
      `;

    case PnpReviewStatus.MODIFIED_APPROVED:
      return `
        <div class="pnp-disclaimer pnp-disclaimer--modified" style="${styles.base}${styles.modified}">
          <strong>✓ CUSTOMIZED & APPROVED</strong>
          <p style="margin: 8px 0 0 0;">
            This document was customized by <strong>${escapeHtml(companyName)}</strong> and approved by 
            <strong>${escapeHtml(reviewerName || "Administrator")}</strong> on <strong>${dateStr || "record"}</strong>.
          </p>
          <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.85;">
            <strong>Note:</strong> NEXUS is not responsible for modifications made to the original template. 
            ${escapeHtml(companyName)} assumes full responsibility for this customized policy.
          </p>
        </div>
      `;

    case PnpReviewStatus.REJECTED:
      return `
        <div class="pnp-disclaimer pnp-disclaimer--rejected" style="${styles.base}${styles.rejected}">
          <strong>✗ NOT ADOPTED</strong>
          <p style="margin: 8px 0 0 0;">
            This document was reviewed and <strong>not adopted</strong> by <strong>${escapeHtml(companyName)}</strong>. 
            It should not be referenced as official policy.
          </p>
        </div>
      `;

    default:
      return "";
  }
}

/**
 * Generate a compact disclaimer for document headers/footers.
 */
export function generateCompactDisclaimer(ctx: DisclaimerContext): string {
  const { reviewStatus, companyName, reviewedAt } = ctx;
  const dateStr = reviewedAt?.toLocaleDateString("en-US") || "N/A";

  switch (reviewStatus) {
    case PnpReviewStatus.PENDING_REVIEW:
      return `⚠️ PENDING REVIEW - Not approved by ${companyName}`;
    case PnpReviewStatus.APPROVED:
      return `✓ Approved by ${companyName} on ${dateStr}`;
    case PnpReviewStatus.MODIFIED_APPROVED:
      return `✓ Customized & Approved by ${companyName} on ${dateStr}`;
    case PnpReviewStatus.REJECTED:
      return `✗ Not adopted by ${companyName}`;
    default:
      return "";
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
