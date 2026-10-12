/**
 * One short tap felt in the hand. Call it inside the tap handler itself, or iOS ignores it.
 *
 * Android and others vibrate for 10 ms. Safari has no vibrate; from iOS 18 a native switch
 * clicks the system haptic when toggled, so a hidden one is toggled through its label.
 * Anywhere else it stays silent.
 */
let switchLabel: HTMLLabelElement | null = null;

function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function hiddenSwitch(): HTMLLabelElement {
  if (switchLabel?.isConnected) return switchLabel;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  label.appendChild(input);
  label.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(label);
  switchLabel = label;
  return label;
}

export function tick() {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    if (isIos()) hiddenSwitch().click();
  } catch {
    // No haptic here; the visible response is enough.
  }
}
