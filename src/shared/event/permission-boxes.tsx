"use client";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { EVENT_PERMISSIONS, PERMISSION_LABEL, type EventPermission, type EventPermissions } from "@/shared/event/permissions";

export function PermissionBoxes({
  permissions,
  disabled,
  onToggle,
  idPrefix,
}: {
  permissions: EventPermissions;
  disabled?: boolean;
  onToggle: (key: EventPermission, checked: boolean) => void;
  idPrefix: string;
}) {
  return (
    <ul>
      {EVENT_PERMISSIONS.map((key) => (
        <li key={key} className="py-1.5">
          <label htmlFor={`${idPrefix}-${key}`} className="flex items-center gap-3">
            <Checkbox
              id={`${idPrefix}-${key}`}
              checked={permissions[key]}
              disabled={disabled}
              onCheckedChange={(value) => onToggle(key, value === true)}
            />
            <span className="t-body text-[var(--ink)]">{PERMISSION_LABEL[key]}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
