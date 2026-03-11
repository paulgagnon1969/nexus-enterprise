import { create, open, type LinkSuccess, type LinkExit } from "react-native-plaid-link-sdk";
import { apiJson } from "../api/client";
import { upsertAccount, upsertSyncState } from "../db/database";
import { syncAccount } from "./sync";
import type { Account } from "../types/models";

// ── Types (from NCC API responses) ──────────────────────────

interface NccBankConnection {
  id: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string | null;
  accountSubtype: string | null;
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface PlaidConnectPayload {
  publicToken: string;
  account: {
    id: string;
    name?: string;
    mask?: string;
    type?: string;
    subtype?: string;
  };
  institution?: {
    institution_id?: string;
    name?: string;
  };
}

// ── Plaid Link Flow ─────────────────────────────────────────

/**
 * Opens Plaid Link and returns a promise that resolves with the
 * new local Account (already saved to SQLite) or rejects on error/exit.
 */
export function openPlaidLink(): Promise<Account> {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Get link token from NCC API
      const { linkToken } = await apiJson<{ linkToken: string }>("/banking/link-token", {
        method: "POST",
      });

      // 2. Configure Plaid SDK
      create({ token: linkToken });

      // 3. Open Plaid Link
      open({
        onSuccess: async (success: LinkSuccess) => {
          try {
            const plaidAccount = success.metadata.accounts[0];
            const institution = success.metadata.institution;
            if (!plaidAccount) {
              reject(new Error("No account selected"));
              return;
            }

            // 4. Exchange token via NCC API
            const payload: PlaidConnectPayload = {
              publicToken: success.publicToken,
              account: {
                id: plaidAccount.id,
                name: plaidAccount.name ?? undefined,
                mask: plaidAccount.mask ?? undefined,
                type: String(plaidAccount.type ?? "") || undefined,
                subtype: String(plaidAccount.subtype ?? "") || undefined,
              },
              institution: institution
                ? { institution_id: institution.id ?? undefined, name: institution.name ?? undefined }
                : undefined,
            };

            const nccConnection = await apiJson<NccBankConnection>("/banking/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            // 5. Save to local SQLite
            const localAccount: Account = {
              id: nccConnection.id,
              source: "plaid",
              sourceId: plaidAccount.id,
              institutionName: nccConnection.institutionName ?? institution?.name ?? "Bank",
              accountName: nccConnection.accountName ?? plaidAccount.name ?? "Account",
              mask: nccConnection.accountMask ?? plaidAccount.mask ?? null,
              type: mapAccountType(nccConnection.accountType),
              currentBalance: null,
              currency: "USD",
              lastSyncedAt: null,
              createdAt: nccConnection.createdAt,
            };

            await upsertAccount(localAccount);
            await upsertSyncState({
              accountId: localAccount.id,
              cursor: null,
              lastSyncAt: null,
            });

            // 6. Initial sync — pull transactions into local DB
            await syncAccount(localAccount.id);

            resolve(localAccount);
          } catch (err) {
            reject(err);
          }
        },
        onExit: (exit: LinkExit) => {
          if (exit.error) {
            reject(new Error(exit.error.displayMessage || exit.error.errorMessage || "Plaid Link error"));
          } else {
            reject(new Error("Plaid Link dismissed"));
          }
        },
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────

function mapAccountType(type: string | null): Account["type"] {
  switch (type?.toLowerCase()) {
    case "credit": return "credit";
    case "depository": return "checking";
    case "savings": return "savings";
    case "investment": return "investment";
    case "loan": return "loan";
    default: return "other";
  }
}
