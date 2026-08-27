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

  return (
    <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-5">
      {STAGE_ORDER.map((stage) => {
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
              "bg-muted/40 flex min-w-0 flex-col gap-2 rounded-xl p-2 transition-colors",
              isTarget && "bg-primary/5 ring-primary/40 ring-2",
            )}
          >
            <h2 className="flex items-center gap-2 px-1.5 pt-1 text-sm font-medium">
              <span
                aria-hidden
                className={cn("size-1.5 shrink-0 rounded-full", STAGE_ACCENT_CLASS[stage])}
              />
              <span className="min-w-0 flex-1 truncate">{tStages(stage)}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{cards.length}</span>
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
                    "bg-card ring-foreground/10 group/card relative flex flex-col gap-0.5 rounded-lg p-2.5 shadow-[var(--surface-shadow)] ring-1 transition-opacity",
                    dragging === company.id ? "opacity-40" : "cursor-grab active:cursor-grabbing",
                  )}
                >
                  <Link
                    href={`/companies/${company.id}`}
                    className="pr-5 text-sm leading-snug font-medium hover:underline"
                  >
                    {company.name}
                  </Link>
                  {company.city ? (
                    <p className="text-muted-foreground truncate text-xs">{company.city}</p>
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
                    "text-muted-foreground/60 rounded-lg border border-dashed px-2 py-4 text-center text-xs transition-colors",
                    isTarget ? "border-primary/40 text-primary" : "border-border/70",
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
  );
}
