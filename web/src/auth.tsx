import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { config } from "./config";
import { getItem, removeItem, setItem } from "./storage";

type AuthState = {
  ready: boolean;
  signedIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const DEV_KEY = "cotsi:dev-user";
let supabase: SupabaseClient | null = null;
if (!config.devAuth && config.configured) {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** The bearer token for API calls, or null when signed out. */
export async function getToken(): Promise<string | null> {
  if (config.devAuth) {
    const name = getItem("local", DEV_KEY);
    return name ? `dev:${name}` : null;
  }
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const AuthContext = createContext<AuthState>({ ready: false, signedIn: false, signIn: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (config.devAuth) {
      setSignedIn(Boolean(getItem("local", DEV_KEY)));
      setReady(true);
      return;
    }
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      signedIn,
      async signIn() {
        if (config.devAuth) {
          setItem("local", DEV_KEY, "learner");
          setSignedIn(true);
          return;
        }
        await supabase?.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin + window.location.pathname },
        });
      },
      async signOut() {
        if (config.devAuth) removeItem("local", DEV_KEY);
        else await supabase?.auth.signOut();
        setSignedIn(false);
      },
    }),
    [ready, signedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
