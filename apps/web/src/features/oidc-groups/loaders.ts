import "server-only";

import { cache } from "react";
import { getSession } from "@/lib/auth";
import { getCanUserCreatePolls } from "./data";

/**
 * Whether the current visitor may create polls (OIDC_POLL_CREATOR_GROUPS).
 * Guests and visitors without a session count as no user: they can create
 * polls only when the restriction is off.
 */
export const loadCanCreatePolls = cache(async () => {
  const session = await getSession();
  const userId =
    session?.user && !session.user.isGuest ? session.user.id : null;
  return getCanUserCreatePolls(userId);
});
