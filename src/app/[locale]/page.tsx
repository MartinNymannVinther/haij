import { getLocale } from "next-intl/server";
import { getSession } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";

export default async function HomePage() {
  const session = await getSession();
  const locale = await getLocale();
  redirect({ href: session ? "/dashboard" : "/login", locale });
}
