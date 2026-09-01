"use client";

import { useTranslations } from "next-intl";
import { buildInfo } from "@/core/version";
import { Link } from "@/i18n/navigation";

/**
 * The running release, at the very foot of the sidebar. Quiet enough to
 * ignore all day and there the moment it matters: when something behaves
 * differently than it did yesterday, the first useful question is which
 * code is answering.
 *
 * A build made from an unclean working tree says so, because "0.1.0+a1b2c3d"
 * is a promise that the commit is what is running, and locally it often is
 * not.
 */
export function VersionLink({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.about");

  return (
    <Link
      href="/settings/about"
      onClick={onNavigate}
      title={t("title")}
      className="text-sidebar-foreground/55 hover:text-sidebar-foreground px-3 pt-0.5 text-[0.6875rem] tracking-[0.01em] transition-colors duration-[120ms]"
    >
      {t("short", { release: buildInfo.release })}
      {buildInfo.dirty ? ` · ${t("dirtyShort")}` : ""}
    </Link>
  );
}
