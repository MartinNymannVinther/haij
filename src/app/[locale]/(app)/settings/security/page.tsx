import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/core/auth/session";
import { PasskeyManager } from "./passkey-manager";
import { TotpManager } from "./totp-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.security");
  return { title: t("title") };
}

export default async function SecurityPage() {
  const t = await getTranslations("app.security");
  const session = await getSession();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <PasskeyManager />
      <TotpManager initialEnabled={Boolean(session?.user.twoFactorEnabled)} />
    </div>
  );
}
