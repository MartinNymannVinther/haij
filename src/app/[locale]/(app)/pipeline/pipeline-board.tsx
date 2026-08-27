"use client";

import { MoveHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PipelineStage } from "@/core/db/schema";
import { setPipelineStageAction } from "@/modules/crm/actions";
import { STAGE_ACCENT_CLASS, STAGE_ORDER } from "@/modules/crm/stage-meta";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type PipelineCompany = {
  id: string;
  name: string;
  city: string | null;
  pipelineStage: string;
};

const DRAG_TYPE = "application/x-haij-company";

/**
 * The pipeline board. Cards move by drag and drop where the pointer allows
 * it, and always through the per-card stage menu - which keeps the board
 * usable on touch devices and by keyboard.
 */
export function PipelineBoard({ companies }: { companies: PipelineCompany[] }) {
  const t = useTranslations("crm.pipeline");
  const tStages = useTranslations("crm.stages");
  const router = useRouter();

  const [items, setItems] = useState(companies);
  const [serverItems, setServerItems] = useState(companies);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<PipelineStage | null>(null);

  // Re-seed from the server after a refresh (React's adjust-state-on-props).
  if (serverItems !== companies) {
    setServerItems(companies);
    setItems(companies);
  }

  async function move(company: PipelineCompany, next: PipelineStage) {
    if (company.pipelineStage === next) return;
    const previous = items;
    setItems((current) =>
      current.map((item) => (item.id === company.id ? { ...item, pipelineStage: next } : item)),
    );
    const result = await setPipelineStageAction(company.id, next);
    if (!result.ok) {
      setItems(previous);
      toast.error(t("moveFailed"));
      return;
    }
    toast.success(t("movedToast", { name: company.name, stage: tStages(next) }));
    router.refresh();
  }

  const lost = items.filter((item) => item.pipelineStage === "lost");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
        {STAGE_ORDER.filter((stage) => stage !== "lost").map((stage) => {
          const cards = items.filter((item) => item.pipelineStage === stage);
          const isTarget = dropTarget === stage;
          return (
            <section
              key={stage}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(stage);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setDropTarget((current) => (current === stage ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData(DRAG_TYPE) || dragging;
                setDropTarget(null);
                setDragging(null);
                const company = items.find((item) => item.id === id);
                if (company) void move(company, stage);
              }}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl transition-colors",
                isTarget && "bg-accent/50 ring-primary/30 ring-2",
              )}
            >
              <h2 className="flex items-center gap-2 px-1 text-[0.8125rem] font-semibold">
                <span className="min-w-0 flex-1 truncate">{tStages(stage)}</span>
                <span className="text-meta text-xs font-normal tabular-nums">{cards.length}</span>
              </h2>

              <div className="flex min-h-14 flex-col gap-2">
                {cards.map((company) => (
                  <article
                    key={company.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_TYPE, company.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(company.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    className={cn(
                      "group/card border-border relative flex flex-col gap-1 rounded-[13px] border px-4 py-3.5 transition-opacity",
                      stage === "won" ? "bg-accent border-[oklch(0.885_0.025_150)]" : "bg-card",
                      dragging === company.id ? "opacity-40" : "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    <Link
                      href={`/companies/${company.id}`}
                      className={cn(
                        "pr-5 text-[0.8125rem] leading-snug font-semibold hover:underline",
                        stage === "won" && "text-accent-foreground",
                      )}
                    >
                      {company.name}
                    </Link>
                    {company.city ? (
                      <p
                        className={cn(
                          "truncate text-xs",
                          stage === "won" ? "text-accent-foreground/75" : "text-meta",
                        )}
                      >
                        {company.city}
                      </p>
                    ) : null}
                    {/* Always present for touch and keyboard; fades in on pointer devices. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("moveCard", { name: company.name })}
                            className="text-muted-foreground absolute top-1.5 right-1.5 opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100"
                          />
                        }
                      >
                        <MoveHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {STAGE_ORDER.map((option) => (
                          <DropdownMenuItem
                            key={option}
                            disabled={option === company.pipelineStage}
                            onClick={() => void move(company, option)}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                STAGE_ACCENT_CLASS[option],
                              )}
                            />
                            {tStages(option)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </article>
                ))}

                {cards.length === 0 ? (
                  <p
                    className={cn(
                      "rounded-[13px] border border-dashed px-3 py-5 text-center text-xs transition-colors",
                      isTarget ? "border-primary/50 text-primary" : "border-border text-label",
                    )}
                  >
                    {dragging ? t("dropHere") : t("emptyColumn")}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {lost.length > 0 ? (
        <section
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget("lost");
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDropTarget((current) => (current === "lost" ? null : current));
          }}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData(DRAG_TYPE) || dragging;
            setDropTarget(null);
            setDragging(null);
            const company = items.find((item) => item.id === id);
            if (company) void move(company, "lost");
          }}
          className={cn(
            "bg-secondary flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] px-4 py-3 text-[0.8125rem] transition-colors",
            dropTarget === "lost" && "ring-primary/30 ring-2",
          )}
        >
          <span className="font-semibold">{tStages("lost")}</span>
          <span className="text-meta">
            {t("lostCount", { count: lost.length })} ·{" "}
            {lost
              .slice(0, 3)
              .map((company) => company.name)
              .join(", ")}
            {lost.length > 3 ? " …" : ""}
          </span>
          <Link
            href={{ pathname: "/companies", query: { stage: "lost" } }}
            className="text-primary ml-auto font-medium hover:underline"
          >
            {t("lostShow")}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
