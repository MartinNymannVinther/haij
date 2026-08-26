"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerAction } from "@/core/auth/actions";
import { Link, useRouter } from "@/i18n/navigation";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await registerAction({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      organizationName: String(form.get("organizationName") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!result.ok) {
      setPending(false);
      setError(
        result.error === "emailExists"
          ? t("errorEmailExists")
          : result.error === "invalid"
            ? t("errorInvalid")
            : t("errorGeneric"),
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required maxLength={200} />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="organizationName">{t("organizationName")}</FieldLabel>
              <Input
                id="organizationName"
                name="organizationName"
                autoComplete="organization"
                required
                maxLength={200}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <FieldDescription>{t("passwordHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">{t("haveAccount")}&nbsp;</span>
        <Link href="/login" className="font-medium underline-offset-4 hover:underline">
          {t("loginLink")}
        </Link>
      </CardFooter>
    </Card>
  );
}
