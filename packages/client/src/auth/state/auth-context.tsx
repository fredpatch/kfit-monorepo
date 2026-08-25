import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BootstrapRequest, CurrentSessionResponse, LoginRequest } from "@kfit/shared";
import { authApiClient, type AuthApiClient } from "../api/auth-api.js";

type AuthContextValue = {
  session: CurrentSessionResponse | null;
  bootstrapRequired: boolean;
  isLoading: boolean;
  login(input: LoginRequest): Promise<void>;
  bootstrap(input: BootstrapRequest): Promise<void>;
  logout(): Promise<void>;
  refreshSession(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const sessionQueryKey = ["auth", "session"] as const;
const bootstrapQueryKey = ["auth", "bootstrap-status"] as const;

export function AuthProvider({ children, api = authApiClient }: { children: ReactNode; api?: AuthApiClient }) {
  const queryClient = useQueryClient();

  const bootstrapStatus = useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: () => api.bootstrapStatus(),
  });

  const session = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => api.currentSession(),
    enabled: bootstrapStatus.data?.required === false,
  });

  const login = useMutation({
    mutationFn: (input: LoginRequest) => api.login(input),
    onSuccess: (data) => queryClient.setQueryData(sessionQueryKey, data),
  });

  const bootstrap = useMutation({
    mutationFn: (input: BootstrapRequest) => api.bootstrap(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bootstrapQueryKey });
    },
  });

  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => queryClient.setQueryData(sessionQueryKey, null),
  });

  const value = useMemo<AuthContextValue>(() => ({
    session: session.data ?? null,
    bootstrapRequired: bootstrapStatus.data?.required ?? false,
    isLoading: bootstrapStatus.isLoading || session.isLoading || login.isPending || bootstrap.isPending || logout.isPending,
    async login(input) {
      await login.mutateAsync(input);
    },
    async bootstrap(input) {
      await bootstrap.mutateAsync(input);
    },
    async logout() {
      await logout.mutateAsync();
    },
    async refreshSession() {
      const refreshed = await api.refresh();
      queryClient.setQueryData(sessionQueryKey, refreshed);
    },
  }), [api, bootstrap, bootstrapStatus.data?.required, bootstrapStatus.isLoading, login, logout, queryClient, session.data, session.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
