import { Suspense } from "react";
import { RegisterScreen } from "./register-screen";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterScreen />
    </Suspense>
  );
}
