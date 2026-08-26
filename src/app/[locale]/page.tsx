import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Haij</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
    </main>
  );
}
