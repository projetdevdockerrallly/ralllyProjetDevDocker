import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

vi.mock("@rallly/database", () => ({
  prisma: {
    $transaction: (
      callback: (tx: { $queryRaw: typeof mockQueryRaw }) => unknown,
    ) => callback({ $queryRaw: mockQueryRaw }),
  },
}));

vi.mock("@/features/activity/mutations", () => ({
  recordPollActivities: vi.fn(),
}));

vi.mock("@/features/poll/invite/mutations", () => ({
  attachParticipantToInvite: vi.fn(),
  findPendingPollInvite: vi.fn(),
}));

vi.mock("@/features/poll/mutations", () => ({
  revalidatePollPages: vi.fn(),
}));

vi.mock("@/features/poll/utils", () => ({
  generateAccessToken: vi.fn(),
}));

vi.mock("@/features/webhook/mutations", () => ({
  scheduleWebhookDispatch: vi.fn(),
}));

import { updateParticipantVotes } from "./mutations";

describe("updateParticipantVotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses vote changes after the deadline even before the poll is closed", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        status: "open",
        deleted: false,
        allow_tentative_votes: true,
        deadline_passed: true,
      },
    ]);

    const result = await updateParticipantVotes({
      pollId: "poll-1",
      participantId: "participant-1",
      actorUserId: undefined,
      votes: [],
    });

    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(mockQueryRaw).toHaveBeenCalledOnce();
  });
});
