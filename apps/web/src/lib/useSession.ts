"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCentre, type CentreResponse } from "./api";
import { clearSession, ensureAccessToken, getCachedCentre, setCachedCentre } from "./session";

export type Session = { token: string | null; centre: CentreResponse["centre"] | null };

/**
 * For signed-in pages: restores the session (or sends the visitor to /login)
 * and loads the owner's centre. The token is handed over as soon as it's known,
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
      if (!token) return routerRef.current.replace("/login");
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
        routerRef.current.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}
