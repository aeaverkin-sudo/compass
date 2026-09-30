"use client";

import { PasswordForm } from "@/shared/components/password-form";

export default function ChangePasswordPage() {
  return (
    <PasswordForm
      title="Password"
      hint="This replaces the starter code. You stay on the same profile."
      fallbackHref="/profile"
    />
  );
}
