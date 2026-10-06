// The automation switches, free of imports so client components can list them.
export const AUTOMATIONS = [
  { key: "auto_approve_scales", label: "Release the next scale automatically when a student is ready" },
  { key: "auto_approve_applications", label: "Approve class applications automatically" },
] as const;

export type AutomationKey = (typeof AUTOMATIONS)[number]["key"];
