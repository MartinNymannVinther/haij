import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signupAllowed } from "@/core/auth/signup";
import { Link } from "@/i18n/navigation";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("title") };
}

export default async function RegisterPage() {
  const t = await getTranslations("auth.register");

  if (await signupAllowed()) {
    return <RegisterForm />;
  }

  // A closed installation says so plainly rather than 404'ing: someone who
  // followed a link deserves to know where they stand.
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("closedTitle")}</CardTitle>
        <CardDescription>{t("closedBody")}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        <Link href="/login" className="font-medium underline-offset-4 hover:underline">
          {t("loginLink")}
        </Link>
      </CardContent>
    </Card>
  );
}
