// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installDialogFocus } from "./dialog-focus";

/// Ruling 20bt: Tab cycles inside an open dialog, Escape closes it, focus returns to the opener.

let off: () => void;
beforeEach(() => {
  document.body.innerHTML = '<button id="opener">Open</button><button id="after">After</button>';
  off = installDialogFocus(document);
});
afterEach(() => off());

const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, shiftKey = false) => {
  const e = new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true });
  document.activeElement!.dispatchEvent(e);
  return e;
};

function openDialog(withControls = true) {
  const scrim = document.createElement("div");
  scrim.className = "fixed inset-0";
  scrim.innerHTML = `<aside role="alertdialog" aria-modal="true">${withControls ? '<button id="a">A</button><input id="b"><button id="c" disabled>C</button><button id="d">D</button>' : "<p>Words</p>"}</aside>`;
  document.body.append(scrim);
  return scrim;
}

describe("the dialog focus rule (20bt)", () => {
  it("moves focus in when a dialog opens, and Tab cycles forwards and Shift+Tab backwards, skipping disabled controls", async () => {
    document.getElementById("opener")!.focus();
    openDialog();
    await tick();
    expect(document.activeElement?.id).toBe("a");
    document.getElementById("d")!.focus();
    expect(key("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("a");
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("d");
    document.getElementById("b")!.focus();
    expect(key("Tab").defaultPrevented).toBe(false);
  });

  it("pulls focus back in when it has strayed outside", async () => {
    openDialog();
    await tick();
    document.getElementById("after")!.focus();
    key("Tab");
    expect(document.activeElement?.id).toBe("a");
  });

  it("holds focus on the dialog itself when it has nothing to focus", async () => {
    const scrim = openDialog(false);
    await tick();
    expect(document.activeElement).toBe(scrim.querySelector("aside"));
    key("Tab");
    expect(document.activeElement).toBe(scrim.querySelector("aside"));
  });

  it("returns focus to the opener when the dialog goes", async () => {
    document.getElementById("opener")!.focus();
    const scrim = openDialog();
    await tick();
    scrim.remove();
    await tick();
    expect(document.activeElement?.id).toBe("opener");
  });

  it("closes on Escape by pressing the scrim, once, when the dialog has not closed itself", async () => {
    vi.useFakeTimers();
    try {
      const scrim = openDialog();
      const pressed = vi.fn();
      scrim.addEventListener("pointerdown", (e) => e.target === scrim && pressed());
      await vi.advanceTimersByTimeAsync(1);
      key("Escape");
      await vi.advanceTimersByTimeAsync(200);
      expect(pressed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing on Escape when the dialog closed itself", async () => {
    vi.useFakeTimers();
    try {
      const scrim = openDialog();
      const pressed = vi.fn();
      scrim.addEventListener("pointerdown", pressed);
      await vi.advanceTimersByTimeAsync(1);
      key("Escape");
      scrim.remove();
      await vi.advanceTimersByTimeAsync(200);
      expect(pressed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing when no dialog is open", () => {
    document.getElementById("opener")!.focus();
    expect(key("Tab").defaultPrevented).toBe(false);
  });
});
