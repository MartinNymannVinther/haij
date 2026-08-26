import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";

export default async function NotFoundPage() {
  const t = await getTranslations("notFound");

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <Wordmark className="text-2xl" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("body")}</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t("cta")}
      </Link>
    </main>
  );
}
