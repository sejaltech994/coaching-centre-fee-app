"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getCentre, type CentreResponse } from "./api";
import { clearSession, ensureAccessToken } from "./session";

export type Session = { token: string | null; centre: CentreResponse["centre"] | null };

/**
 * For signed-in pages: restores the session (or sends the visitor to /login)
 * and loads the owner's centre. Both stay null until ready.
 */
export function useSession(): Session {
  const router = useRouter();
  // Read through a ref so a re-render can't re-run the load.
  const routerRef = useRef(router);
  const [session, setSession] = useState<Session>({ token: null, centre: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await ensureAccessToken();
      if (!token) return routerRef.current.replace("/login");
      try {
        const { centre } = await getCentre(token);
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
