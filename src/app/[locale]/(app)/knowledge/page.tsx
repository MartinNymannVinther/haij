import { ArrowUpRight, BookOpen, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <KnowledgeToolbar hasSources={sources.some((s) => s.active)} hasItems={items.length > 0} />
      </div>

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {digests.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="text-primary size-4" />
                  {t("digestTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {digests.slice(0, 3).map((digest) => (
                  <article key={digest.id} className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-xs">
                      {format.dateTime(digest.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                      {" · "}
                      {t("digestMeta", { count: digest.itemCount })}
                    </p>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
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
                  icon={BookOpen}
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
