import "server-only";

import { prisma } from "@rallly/database";
import { env } from "@/env";
import { canCreatePolls, parseGroupList } from "./utils";

/** Whether OIDC_POLL_CREATOR_GROUPS restricts poll creation on this instance. */
export function isPollCreationRestricted() {
  return parseGroupList(env.OIDC_POLL_CREATOR_GROUPS).length > 0;
}

/**
 * Whether the user may create polls under OIDC_POLL_CREATOR_GROUPS.
 * Guests (no user id) and unknown users cannot when the restriction is on.
 * Read from the database, never from the session cookie cache, so a group
 * change applies as soon as the user signs in again.
 */
export async function getCanUserCreatePolls(
  userId: string | null | undefined,
): Promise<boolean> {
  const creatorGroups = parseGroupList(env.OIDC_POLL_CREATOR_GROUPS);
  if (creatorGroups.length === 0) {
    return true;
  }
  if (!userId) {
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { oidcGroups: true, role: true },
  });
  if (!user) {
    return false;
  }
  return canCreatePolls({
    userGroups: user.oidcGroups,
    role: user.role,
    creatorGroups,
  });
}
