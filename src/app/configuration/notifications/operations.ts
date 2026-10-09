import { defineOperations } from "../_editors/define";

export const notificationsOperations = defineOperations("notifications", "Notifications", {
  saveNotificationRule: { label: "Save a notification rule", load: () => import("./core").then((m) => m.saveNotificationRule) },
});
