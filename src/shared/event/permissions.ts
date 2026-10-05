export const EVENT_PERMISSIONS = ["checkin", "guests", "payments", "analytics", "edit", "team"] as const;
export type EventPermission = (typeof EVENT_PERMISSIONS)[number];
export type EventPermissions = Record<EventPermission, boolean>;

export const PERMISSION_LABEL: Record<EventPermission, string> = {
  checkin: "Check-in",
  guests: "Guests & invites",
  payments: "Payments",
  analytics: "Analytics",
  edit: "Edit event",
  team: "Team",
};

export const MANAGE_SECTIONS = ["event", "invite", "guests", "payment", "managers", "checkin", "analytics", "edit"] as const;
export type ManageSection = (typeof MANAGE_SECTIONS)[number];

const SECTION_PERMISSION: Partial<Record<ManageSection, EventPermission>> = {
  guests: "guests",
  payment: "payments",
  managers: "team",
  checkin: "checkin",
  analytics: "analytics",
  edit: "edit",
};

const MANAGER_CAP = 5;

export function emptyPermissions(): EventPermissions {
  return { checkin: false, guests: false, payments: false, analytics: false, edit: false, team: false };
}

export function allPermissions(): EventPermissions {
  return { checkin: true, guests: true, payments: true, analytics: true, edit: true, team: true };
}

export function permissionsOf(raw: unknown): EventPermissions {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const permissions = emptyPermissions();
  for (const key of EVENT_PERMISSIONS) permissions[key] = source[key] === true;
  return permissions;
}

export function anyPermission(permissions: EventPermissions): boolean {
  return EVENT_PERMISSIONS.some((key) => permissions[key]);
}

export function accessLine(permissions: EventPermissions): string {
  return EVENT_PERMISSIONS.filter((key) => permissions[key])
    .map((key) => PERMISSION_LABEL[key])
    .join(", ");
}

/** Owner sees every section. A manager sees the sections their flags allow. */
export function visibleSections(role: "owner" | "manager", permissions: EventPermissions): ManageSection[] {
  if (role === "owner") return [...MANAGE_SECTIONS];
  return MANAGE_SECTIONS.filter((section) => {
    const permission = SECTION_PERMISSION[section];
    return permission ? permissions[permission] : false;
  });
}

export function managerCap(): number {
  return MANAGER_CAP;
}
