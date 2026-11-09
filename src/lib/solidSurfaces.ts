/** The "Solid surfaces" setting: every glass surface becomes opaque. Stored per device and read before first paint (THEME_BOOT_SCRIPT). */
export const SOLID_SURFACES_STORAGE_KEY = "bnp-solid-surfaces";
export const SOLID_SURFACES_ATTRIBUTE = "data-solid-surfaces";

export function readSolidSurfaces(): boolean {
  try {
    return localStorage.getItem(SOLID_SURFACES_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function applySolidSurfaces(on: boolean): void {
  const root = document.documentElement;
  if (on) root.setAttribute(SOLID_SURFACES_ATTRIBUTE, "on");
  else root.removeAttribute(SOLID_SURFACES_ATTRIBUTE);
  try {
    if (on) localStorage.setItem(SOLID_SURFACES_STORAGE_KEY, "on");
    else localStorage.removeItem(SOLID_SURFACES_STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; the setting then lasts for this page only.
  }
}

/** True while Solid surfaces is on, for code that would otherwise build a lens. */
export function solidSurfacesOn(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute(SOLID_SURFACES_ATTRIBUTE) === "on";
}
