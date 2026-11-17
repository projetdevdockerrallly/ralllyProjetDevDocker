import "server-only";

import { prisma } from "@rallly/database";
import { createLogger } from "@rallly/logger";
import { env } from "@/env";
import {
  decodeJwtPayload,
  extractGroups,
  parseGroupList,
  resolveRole,
} from "./utils";

const logger = createLogger("oidc-groups");

/** Better-Auth provider id of the generic OIDC provider (see lib/auth.ts). */
const OIDC_PROVIDER_ID = "oidc";

/**
 * Copies the user's groups from their latest OIDC ID token onto the user row
 * and, when OIDC_ADMIN_GROUPS is set, derives their instance role from them.
 *
 * Called on every session creation: Better-Auth stores the fresh ID token on
 * the account before creating the session, so this reflects the groups of the
 * sign-in that just happened. Users without an OIDC account are left alone.
 * Never throws: a failure here must not block the sign-in.
 */
export async function syncOidcGroups(userId: string) {
  try {
    const account = await prisma.account.findFirst({
      where: { userId, provider: OIDC_PROVIDER_ID },
      orderBy: { updatedAt: "desc" },
      select: { id_token: true },
    });
    if (!account?.id_token) {
      return;
    }

    const claims = decodeJwtPayload(account.id_token);
    if (!claims) {
      logger.warn({ userId }, "OIDC ID token could not be decoded");
      return;
    }

    const groups = extractGroups(claims, env.OIDC_GROUPS_CLAIM_PATH);
    const role = resolveRole(groups, parseGroupList(env.OIDC_ADMIN_GROUPS));

    await prisma.user.update({
      where: { id: userId },
      data: {
        oidcGroups: groups,
        ...(role ? { role } : {}),
      },
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to sync OIDC groups");
  }
}
