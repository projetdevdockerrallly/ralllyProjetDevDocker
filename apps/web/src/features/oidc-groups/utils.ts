import { getValueByPath } from "@/lib/utils/get-value-by-path";

/**
 * Parses a comma-separated list of group names from an environment variable.
 * Blank entries are dropped; an unset or blank variable yields an empty list,
 * which means "feature off" for the caller.
 */
export function parseGroupList(value: string | undefined | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
}

/**
 * Reads the payload of a JWT without verifying it. Only used on the ID token
 * Better-Auth stored right after the code exchange with the provider, which is
 * already trusted at that point.
 */
export function decodeJwtPayload(
  token: string | null | undefined,
): Record<string, unknown> | null {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Extracts the group names from OIDC claims. Accepts an array of strings or a
 * single string; anything else yields no groups.
 */
export function extractGroups(
  claims: Record<string, unknown> | null,
  claimPath: string,
): string[] {
  if (!claims) {
    return [];
  }
  let value: unknown;
  try {
    value = getValueByPath(claims, claimPath);
  } catch {
    // getValueByPath throws when an intermediate segment is null
    return [];
  }
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((group): group is string => typeof group === "string")
      .map((group) => group.trim())
      .filter((group) => group.length > 0);
  }
  return [];
}

function intersects(userGroups: string[], allowedGroups: string[]) {
  return userGroups.some((group) => allowedGroups.includes(group));
}

/**
 * Role to store for a user after an OIDC sign-in, or `null` to leave the
 * current role untouched (mapping disabled).
 */
export function resolveRole(
  userGroups: string[],
  adminGroups: string[],
): "admin" | "user" | null {
  if (adminGroups.length === 0) {
    return null;
  }
  return intersects(userGroups, adminGroups) ? "admin" : "user";
}

/**
 * Whether a user may create polls. With no creator groups configured every
 * signed-in user can (upstream behavior); otherwise instance admins and
 * members of one of the creator groups can.
 */
export function canCreatePolls({
  userGroups,
  role,
  creatorGroups,
}: {
  userGroups: string[];
  role: string | null | undefined;
  creatorGroups: string[];
}): boolean {
  if (creatorGroups.length === 0) {
    return true;
  }
  if (role === "admin") {
    return true;
  }
  return intersects(userGroups, creatorGroups);
}
