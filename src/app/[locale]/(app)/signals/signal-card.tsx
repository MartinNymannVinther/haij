"use client";

import {
  Archive,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Loader2,
  RotateCcw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SignalSource, SignalStatus } from "@/core/db/schema";
import { formatDateDa } from "@/core/dates";
import {
  convertSignalAction,
  setSignalFollowUpAction,
  setSignalStatusAction,
} from "@/modules/signals/actions";
import { SOURCE_BADGE_CLASS, scoreBadgeClass } from "@/modules/signals/source-meta";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type SignalRow = {
  id: string;
  source: SignalSource | string;
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: Date | null;
  companyCvr: string | null;
  companyId: string | null;
  companyName: string | null;
  status: SignalStatus | string;
  score: number | null;
  scoreReason: string | null;
  suggestion: string | null;
  followUpAt: string | null;
};

export function SignalCard({ signal, today }: { signal: SignalRow; today: string }) {
  const t = useTranslations("signals");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  async function run(action: string, fn: () => Promise<{ ok: boolean }>) {
    setPending(action);
    const result = await fn();
    setPending(null);
    if (!result.ok) {
      toast.error(tCommon("error"));
      return false;
    }
    router.refresh();
    return true;
  }

  const overdue = signal.followUpAt !== null && signal.followUpAt <= today;

  return (
    <Card className="py-4 shadow-none">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={SOURCE_BADGE_CLASS[signal.source as SignalSource]}>
                {t(`source.${signal.source}`)}
              </Badge>
              {signal.score !== null ? (
                <Badge className={scoreBadgeClass(signal.score)}>{signal.score}</Badge>
              ) : null}
              {signal.followUpAt ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    overdue ? "text-destructive font-medium" : "text-muted-foreground",
                  )}
                >
                  <CalendarClock className="size-3.5" />
                  {formatDateDa(signal.followUpAt)}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 font-medium">
              {signal.url ? (
                <a
                  href={signal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline underline-offset-4"
                >
                  {signal.title}
                  <ArrowUpRight className="text-muted-foreground ml-1 inline size-3.5" />
                </a>
              ) : (
                signal.title
              )}
            </p>
            {signal.summary ? (
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{signal.summary}</p>
            ) : null}
            {signal.scoreReason ? (
              <p className="text-muted-foreground mt-1.5 flex items-start gap-1.5 text-sm">
                <Sparkles className="text-primary mt-0.5 size-3.5 shrink-0" />
                <span>
                  {signal.scoreReason}
                  {signal.suggestion ? (
                    <span className="text-foreground font-medium"> {signal.suggestion}</span>
                  ) : null}
                </span>
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {signal.companyId ? (
              <Link
                href={`/companies/${signal.companyId}`}
                className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                <Building2 className="size-3.5" />
                {signal.companyName ?? t("openCompany")}
              </Link>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  run("convert", async () => {
                    const result = await convertSignalAction(signal.id);
                    if (result.ok) toast.success(t("convertedToast"));
                    return result;
                  })
                }
                disabled={pending !== null}
              >
                {pending === "convert" ? (
                  <Loader2 data-slot="icon" className="animate-spin" />
                ) : (
                  <UserPlus data-slot="icon" />
                )}
                {t("convert")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFollowUpOpen(true)}
              disabled={pending !== null}
            >
              <CalendarClock data-slot="icon" />
              {t("followUp")}
            </Button>
            {signal.status !== "dismissed" ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("dismiss")}
                onClick={() => run("dismiss", () => setSignalStatusAction(signal.id, "dismissed"))}
                disabled={pending !== null}
              >
                <Archive />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("reopen")}
                onClick={() => run("reopen", () => setSignalStatusAction(signal.id, "new"))}
                disabled={pending !== null}
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("followUpTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const value = String(new FormData(event.currentTarget).get("followUpAt") ?? "");
              const ok = await run("followup", () =>
                setSignalFollowUpAction(signal.id, value || null),
              );
              if (ok) setFollowUpOpen(false);
            }}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor={`followup-${signal.id}`}>{t("followUpLabel")}</FieldLabel>
              <Input
                id={`followup-${signal.id}`}
                name="followUpAt"
                type="date"
                defaultValue={signal.followUpAt ?? ""}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFollowUpOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending !== null}>
                {pending === "followup" ? (
                  <Loader2 data-slot="icon" className="animate-spin" />
                ) : null}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
