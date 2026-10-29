"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCentre, type CentreResponse } from "./api";
import { loginUrl, takeReturn } from "./returnTo";
import { checkLogin, clearSession, ensureAccessToken, getCachedCentre, setCachedCentre } from "./session";

export type Session = { token: string | null; centre: CentreResponse["centre"] | null };

/**
 * For signed-in pages: restores the session (or sends the visitor to log in)
 * and loads the owner's centre. When the owner comes back to the tab, it checks
 * the login is still good, and logs out if it has ended. The token is handed over as soon as it's known,
 * so pages can start loading their own data while the centre is still loading;
 * the centre is remembered between pages.
 */
export function useSession(): Session {
  const router = useRouter();
  // Read through a ref so a re-render can't re-run the load.
  const routerRef = useRef(router);
  const [session, setSession] = useState<Session>(() => ({ token: null, centre: getCachedCentre() }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await ensureAccessToken();
      if (!token) return routerRef.current.replace(loginUrl("required"));
      // Just signed in after being sent away from a page: back to it.
      const back = takeReturn();
      if (back) routerRef.current.replace(back);
      if (cancelled) return;
      const cached = getCachedCentre();
      setSession({ token, centre: cached });
      if (cached) return;
      try {
        const { centre } = await getCentre(token);
        setCachedCentre(centre);
        if (!cancelled) setSession({ token, centre });
      } catch {
        clearSession();
        routerRef.current.replace(loginUrl("expired"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") void checkLogin();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  return session;
}
