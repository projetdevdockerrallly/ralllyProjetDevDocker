ALTER TYPE "poll_closed_reason" ADD VALUE 'deadline';

CREATE INDEX "polls_deadline_idx" ON "polls"("deadline");
