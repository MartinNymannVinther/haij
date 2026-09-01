import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { signupAllowed } from "@/core/auth/signup";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage() {
  // No point offering a door that is locked.
  return <LoginForm signupOpen={await signupAllowed()} />;
}
