import { apiJson } from "./client";
import type { AuthTokens } from "../types/api";
import { setTokens } from "../storage/tokens";

export interface SwitchCompanyResponse extends AuthTokens {
  user?: { id: string; email: string };
  company?: { id: string; name: string };
}

export async function switchCompany(companyId: string): Promise<SwitchCompanyResponse> {
  const res = await apiJson<SwitchCompanyResponse>("/auth/switch-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId }),
  });

  await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
  return res;
}
