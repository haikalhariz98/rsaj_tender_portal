import { defineOperations } from "../_editors/define";

export const invitationOperations = defineOperations("invitation", "Invitation", {
  saveWindowPolicy: { label: "Save the window policy", load: () => import("./core").then((m) => m.saveWindowPolicy) },
  saveChannel: { label: "Save a publication channel", load: () => import("./core").then((m) => m.saveChannel) },
  setChannelRetired: { label: "Retire or restore a publication channel", load: () => import("./core").then((m) => m.setChannelRetired) },
  saveFeeFloor: { label: "Save a fee floor", load: () => import("./core").then((m) => m.saveFeeFloor) },
  removeFeeFloor: { label: "Remove a fee floor", load: () => import("./core").then((m) => m.removeFeeFloor) },
  saveCalendar: { label: "Save a calendar", load: () => import("./core").then((m) => m.saveCalendar) },
  setCalendarRetired: { label: "Retire or restore a calendar", load: () => import("./core").then((m) => m.setCalendarRetired) },
  saveCalendarYear: { label: "Save how a calendar year is maintained", load: () => import("./core").then((m) => m.saveCalendarYear) },
  saveHoliday: { label: "Add a public holiday", load: () => import("./core").then((m) => m.saveHoliday) },
  removeHoliday: { label: "Remove a public holiday", load: () => import("./core").then((m) => m.removeHoliday) },
  importHolidayYear: { label: "Import a year's public holidays", load: () => import("./core").then((m) => m.importHolidayYear) },
  saveMethodBidRule: { label: "Save the bid-receipt rules of a method", load: () => import("./core").then((m) => m.saveMethodBidRule) },
  saveMethodOpeningRule: { label: "Save the opening rules of a method", load: () => import("./core").then((m) => m.saveMethodOpeningRule) },
  saveOpeningPolicy: { label: "Save the opening policy", load: () => import("./core").then((m) => m.saveOpeningPolicy) },
});
