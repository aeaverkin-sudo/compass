"use client";

import { PasswordForm } from "@/shared/components/password-form";

export default function ResetPasswordPage() {
  return (
    <PasswordForm
      title="New password"
      hint="Choose a password to replace the one from the email."
      exchangeCode
    />
  );
}
