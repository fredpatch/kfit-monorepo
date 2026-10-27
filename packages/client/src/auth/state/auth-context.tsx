import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isLoginOtpRequired,
  type BootstrapRequest,
  type CurrentSessionResponse,
  type LoginOtpRequiredResponse,
  type LoginRequest,
} from "@kfit/shared";
import { authApiClient, type AuthApiClient } from "../api/auth-api.js";

/** SEC-02: a trusted device is signed in at once; an unknown one gets a challenge for the « Nouvel appareil » step. */
export type LoginStep = { status: "authenticated" } | LoginOtpRequiredResponse;

type AuthContextValue = {
  session: CurrentSessionResponse | null;
  bootstrapRequired: boolean;
  /** BOOT-01 B4: production asks for « Jeton d'initialisation »; disabled while KFIT_BOOTSTRAP_TOKEN is unset. */
  bootstrapTokenRequired: boolean;
  bootstrapEnabled: boolean;
  bootstrapStatusError: boolean;
  isLoading: boolean;
  /** Initial bootstrap-status / session check only (not login or logout in flight): drives the full-screen loader. */
  isCheckingSession: boolean;
  login(input: LoginRequest): Promise<LoginStep>;
  verifyLogin(input: {
    challengeId: string;
    code: string;
    trustDevice: boolean;
  }): Promise<void>;
  resendLogin(challengeId: string): Promise<LoginOtpRequiredResponse>;
  bootstrap(input: BootstrapRequest, token?: string): Promise<void>;
  logout(): Promise<void>;
  refreshSession(): Promise<void>;
  retryBootstrapStatus(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const sessionQueryKey = ["auth", "session"] as const;
const bootstrapQueryKey = ["auth", "bootstrap-status"] as const;

export function AuthProvider({
  children,
  api = authApiClient,
}: {
  children: ReactNode;
  api?: AuthApiClient;
}) {
  const queryClient = useQueryClient();

  const bootstrapStatus = useQuery({
    queryKey: bootstrapQueryKey,
    queryFn: () => api.bootstrapStatus(),
  });

  const session = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => api.currentSession(),
    enabled:
      bootstrapStatus.data?.required === false && !bootstrapStatus.isError,
  });

  const login = useMutation({
    mutationFn: (input: LoginRequest) => api.login(input),
    onSuccess: (data) => {
      if (!isLoginOtpRequired(data))
        queryClient.setQueryData(sessionQueryKey, data);
    },
  });

  const verifyLogin = useMutation({
    mutationFn: (input: {
      challengeId: string;
      code: string;
      trustDevice: boolean;
    }) => api.verifyLogin(input),
    onSuccess: (data) => queryClient.setQueryData(sessionQueryKey, data),
  });

  const bootstrap = useMutation({
    mutationFn: ({
      input,
      token,
    }: {
      input: BootstrapRequest;
      token: string | undefined;
    }) => api.bootstrap(input, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bootstrapQueryKey });
    },
  });

  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => queryClient.setQueryData(sessionQueryKey, null),
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session: session.data ?? null,
      bootstrapRequired: bootstrapStatus.data?.required ?? false,
      bootstrapTokenRequired: bootstrapStatus.data?.tokenRequired ?? false,
      bootstrapEnabled: bootstrapStatus.data?.enabled ?? true,
      bootstrapStatusError: bootstrapStatus.isError,
      isLoading:
        bootstrapStatus.isLoading ||
        session.isLoading ||
        login.isPending ||
        bootstrap.isPending ||
        logout.isPending,
      isCheckingSession: bootstrapStatus.isLoading || session.isLoading,
      async login(input) {
        const result = await login.mutateAsync(input);
        return isLoginOtpRequired(result)
          ? result
          : { status: "authenticated" };
      },
      async verifyLogin(input) {
        await verifyLogin.mutateAsync(input);
      },
      resendLogin: (challengeId) => api.resendLogin(challengeId),
      async bootstrap(input, token) {
        await bootstrap.mutateAsync({ input, token });
      },
      async logout() {
        await logout.mutateAsync();
      },
      async refreshSession() {
        const refreshed = await api.refresh();
        queryClient.setQueryData(sessionQueryKey, refreshed);
      },
      async retryBootstrapStatus() {
        await bootstrapStatus.refetch();
      },
    }),
    [
      api,
      bootstrap,
      bootstrapStatus.data?.enabled,
      bootstrapStatus.data?.required,
      bootstrapStatus.data?.tokenRequired,
      bootstrapStatus.isError,
      bootstrapStatus.isLoading,
      bootstrapStatus.refetch,
      login,
      logout,
      queryClient,
      session.data,
      session.isLoading,
      verifyLogin,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
