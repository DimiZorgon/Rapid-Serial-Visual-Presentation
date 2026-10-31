/**
 * Toast notification manager.
 * Displays subtle status messages with auto-dismiss at 2.2s.
 */

let toastTimer = null;

export function showStatusToast(message) {
  const el = document.getElementById("statusToast");
  if (!el) return;
  el.textContent = message;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 2200);
}
