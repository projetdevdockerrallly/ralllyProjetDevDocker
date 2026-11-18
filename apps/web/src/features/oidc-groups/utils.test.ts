import { describe, expect, it } from "vitest";
import {
  canCreatePolls,
  decodeJwtPayload,
  extractGroups,
  parseGroupList,
  resolveRole,
} from "./utils";

const toJwt = (payload: unknown) =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");

describe("parseGroupList", () => {
  it("returns an empty list when unset or blank", () => {
    expect(parseGroupList(undefined)).toEqual([]);
    expect(parseGroupList("")).toEqual([]);
    expect(parseGroupList(" , ")).toEqual([]);
  });

  it("splits and trims comma-separated groups", () => {
    expect(parseGroupList("rallly-admins, hr ,managers")).toEqual([
      "rallly-admins",
      "hr",
      "managers",
    ]);
  });
});

describe("decodeJwtPayload", () => {
  it("decodes the payload of a JWT", () => {
    expect(decodeJwtPayload(toJwt({ groups: ["a"] }))).toEqual({
      groups: ["a"],
    });
  });

  it("returns null for missing or malformed tokens", () => {
    expect(decodeJwtPayload(null)).toBeNull();
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.%%%.c")).toBeNull();
    expect(decodeJwtPayload(toJwt(["array"]))).toBeNull();
  });
});

describe("extractGroups", () => {
  it("reads an array claim", () => {
    expect(extractGroups({ groups: ["a", "b"] }, "groups")).toEqual(["a", "b"]);
  });

  it("supports nested claim paths", () => {
    expect(
      extractGroups({ realm_access: { roles: ["x"] } }, "realm_access.roles"),
    ).toEqual(["x"]);
  });

  it("accepts a single string and ignores non-string entries", () => {
    expect(extractGroups({ groups: "solo" }, "groups")).toEqual(["solo"]);
    expect(extractGroups({ groups: ["a", 1, null, " "] }, "groups")).toEqual([
      "a",
    ]);
  });

  it("returns no groups when the claim is missing", () => {
    expect(extractGroups({}, "groups")).toEqual([]);
    expect(extractGroups(null, "groups")).toEqual([]);
  });
});

describe("resolveRole", () => {
  it("leaves the role untouched when no admin groups are configured", () => {
    expect(resolveRole(["rallly-admins"], [])).toBeNull();
  });

  it("grants admin to members and user to everyone else", () => {
    expect(resolveRole(["rallly-admins"], ["rallly-admins"])).toBe("admin");
    expect(resolveRole(["rallly-users"], ["rallly-admins"])).toBe("user");
    expect(resolveRole([], ["rallly-admins"])).toBe("user");
  });
});

describe("canCreatePolls", () => {
  it("allows everyone when no creator groups are configured", () => {
    expect(
      canCreatePolls({ userGroups: [], role: "user", creatorGroups: [] }),
    ).toBe(true);
  });

  it("allows members of a creator group", () => {
    expect(
      canCreatePolls({
        userGroups: ["rallly-admins"],
        role: "user",
        creatorGroups: ["rallly-admins"],
      }),
    ).toBe(true);
  });

  it("allows instance admins regardless of groups", () => {
    expect(
      canCreatePolls({
        userGroups: [],
        role: "admin",
        creatorGroups: ["rallly-admins"],
      }),
    ).toBe(true);
  });

  it("denies everyone else", () => {
    expect(
      canCreatePolls({
        userGroups: ["rallly-users"],
        role: "user",
        creatorGroups: ["rallly-admins"],
      }),
    ).toBe(false);
  });
});
