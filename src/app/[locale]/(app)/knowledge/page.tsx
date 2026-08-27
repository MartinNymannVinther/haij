import { ArrowUpRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgContext } from "@/core/auth/session";
import { listDigests, listItems, listSources } from "@/modules/knowledge/service";
import { redirect } from "@/i18n/navigation";
import { KnowledgeToolbar } from "./knowledge-toolbar";
import { SourcesCard } from "./sources-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("knowledge");
  return { title: t("title") };
}

export default async function KnowledgePage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/onboarding", locale: await getLocale() });
    return null;
  }
  const [t, sources, items, digests, format] = await Promise.all([
    getTranslations("knowledge"),
    listSources(context),
    listItems(context),
    listDigests(context),
    getFormatter(),
  ]);

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader
        title={t("title")}
        subtitle={t("summary", {
          sources: sources.filter((s) => s.active).length,
          items: items.length,
        })}
        actions={
          <KnowledgeToolbar hasSources={sources.some((s) => s.active)} hasItems={items.length > 0} />
        }
      />

      <div className="grid gap-4 @3xl:grid-cols-[1.5fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          {digests.length > 0 ? (
            <Card className="bg-accent border-[oklch(0.885_0.025_150)]">
              <CardHeader>
                <CardTitle className="text-accent-foreground flex items-center gap-2">
                  <Sparkles className="size-4" />
                  {t("digestTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {digests.slice(0, 3).map((digest) => (
                  <article key={digest.id} className="flex flex-col gap-2">
                    <p className="text-accent-foreground/70 text-xs">
                      {format.dateTime(digest.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                      {" · "}
                      {t("digestMeta", { count: digest.itemCount })}
                    </p>
                    <div className="text-accent-foreground text-[0.845rem] leading-relaxed whitespace-pre-wrap">
                      {digest.content}
                    </div>
                  </article>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t("itemsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <EmptyState
                  variant="inline"
                  title={t("empty")}
                  hint={t("emptyHint")}
                />
              ) : (
                <ol className="flex flex-col">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="border-border flex flex-col gap-0.5 border-b py-3 first:pt-0 last:border-b-0"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 font-medium">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline underline-offset-4"
                            >
                              {item.title}
                              <ArrowUpRight className="text-muted-foreground ml-1 inline size-3.5" />
                            </a>
                          ) : (
                            item.title
                          )}
                        </p>
                        <Badge className="border-border bg-transparent text-muted-foreground shrink-0">
                          {item.sourceName}
                        </Badge>
                      </div>
                      {item.summary ? (
                        <p className="text-muted-foreground line-clamp-2 text-sm">{item.summary}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <SourcesCard sources={sources} />
      </div>
    </div>
  );
}
