import { Database, Flag, ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { getSession } from "@/core/auth/session";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const VALUES = [
  { icon: Flag, titleKey: "danishTitle", bodyKey: "danishBody" },
  { icon: Database, titleKey: "dataTitle", bodyKey: "dataBody" },
  { icon: ShieldCheck, titleKey: "securityTitle", bodyKey: "securityBody" },
] as const;

export default async function HomePage() {
  const session = await getSession();
  const locale = await getLocale();
  if (session) {
    redirect({ href: "/dashboard", locale });
    return null;
  }
  const t = await getTranslations("landing");

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Wordmark className="text-xl" />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            {t("nav.login")}
          </Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
            {t("nav.register")}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-16 pb-14 text-center sm:pt-24">
          <p className="border-border text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className="bg-primary inline-block size-1.5 animate-pulse rounded-full" />
            {t("status")}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="text-muted-foreground mt-5 max-w-2xl text-lg text-pretty">
            {t("hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }))}>
              {t("hero.ctaPrimary")}
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              {t("hero.ctaSecondary")}
            </Link>
          </div>
          <p className="text-muted-foreground mt-6 text-xs">{t("hero.trust")}</p>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-3">
          {VALUES.map((value) => (
            <div key={value.titleKey} className="bg-card rounded-lg border p-6">
              <div className="bg-primary/10 text-primary mb-4 flex size-9 items-center justify-center rounded-md">
                <value.icon className="size-4.5" />
              </div>
              <h2 className="font-medium">{t(`values.${value.titleKey}`)}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm">{t(`values.${value.bodyKey}`)}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm">
          <p className="flex items-center gap-2">
            <Wordmark />
            <span>· {t("footer.license")}</span>
          </p>
          <Link
            href="/"
            locale={locale === "da" ? "en" : "da"}
            className="underline-offset-4 hover:underline"
          >
            {t("footer.language")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
