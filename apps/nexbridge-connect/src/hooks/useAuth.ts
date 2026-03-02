import { useState, useEffect, useCallback } from "react";
import { loadAuth, clearAuth, clearCachedCredentials } from "../lib/auth";
import { setApiConfig, login as apiLogin, type LoginResponse } from "../lib/api";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  userEmail: string | null;
  companyName: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    userEmail: null,
    companyName: null,
  });

  // Restore session on mount (with timeout so app never hangs)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setState((s) => (s.loading ? { ...s, loading: false } : s));
    }, 5000);

    (async () => {
      try {
        const stored = await loadAuth();
        if (stored) {
          setApiConfig(stored.apiUrl, stored.accessToken);
          setState({
            loading: false,
            authenticated: true,
            userEmail: stored.userEmail,
            companyName: stored.companyName,
          });
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch {
        setState((s) => ({ ...s, loading: false }));
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => clearTimeout(timeout);
  }, []);

  const login = useCallback(
    async (apiUrl: string, email: string, password: string): Promise<LoginResponse> => {
      const data = await apiLogin(apiUrl, email, password);
      setState({
        loading: false,
        authenticated: true,
        userEmail: data.user.email,
        companyName: data.company.name,
      });
      return data;
    },
    [],
  );

  const logout = useCallback(async () => {
    await clearAuth();
    clearCachedCredentials();
    setState({
      loading: false,
      authenticated: false,
      userEmail: null,
      companyName: null,
    });
  }, []);

  return { ...state, login, logout };
}
