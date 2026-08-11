import { NotBuilt } from "@/components/not-built";

export default function NotificationsPage() {
  return (
    <NotBuilt
      title="Notifications"
      summary="What the portal sends, to whom, and when it chases. Silence is a decision too, and it should be a configured one."
      willInclude={[
        "The events that notify, and the recipients each one reaches — including mandatory copy recipients who are named by office rather than by person",
        "Reminder schedules ahead of an expiry or a deadline, and the severity each step carries",
        "Escalation when a step is not actioned, and who it escalates to",
        "Delivery is logged per recipient, success and failure alike, because a notification nobody can prove was sent did not happen",
        "Where a governing document provides for no notification at all, that stays visible as a choice rather than an oversight",
      ]}
    />
  );
}
