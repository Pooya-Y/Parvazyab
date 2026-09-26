import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { tokenFromHash } from "@/lib/auth-links";

/**
 * The token of an emailed link (`#token=…`). It is a credential, so once read
 * it is removed from the address bar and from history.
 */
export function useFragmentToken(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => tokenFromHash(location.hash));
  const hasHash = location.hash !== "";
  const { pathname, search, state } = location;

  useEffect(() => {
    if (hasHash) navigate({ pathname, search }, { replace: true, state });
  }, [hasHash, pathname, search, state, navigate]);

  return token;
}
