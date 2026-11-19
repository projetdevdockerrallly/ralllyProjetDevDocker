"use client";

import { CalendarClockIcon } from "lucide-react";
import { EventMetaItem } from "@/features/poll/components/event-meta";
import { Trans } from "@/i18n/client";
import { Time } from "@/lib/datetime/time";

export function PollDeadlineMeta({ deadline }: { deadline: Date | null }) {
  if (!deadline) {
    return null;
  }

  return (
    <EventMetaItem>
      <CalendarClockIcon />
      <Trans
        i18nKey="pollDeadlineMeta"
        defaults="Voting closes <time />"
        components={{ time: <Time value={deadline} preset="datetime" /> }}
      />
    </EventMetaItem>
  );
}
