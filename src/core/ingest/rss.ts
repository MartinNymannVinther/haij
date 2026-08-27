import { decodeEntities, sanitizeText } from "./sanitize";

/**
 * Minimal RSS 2.0 / Atom parser, hand-rolled on purpose: feeds are the
 * only XML Haij reads, the subset is tiny, and a dependency-free parser
 * keeps the ingestion surface auditable. Output is already sanitized.
 */

export type FeedItem = {
  ref: string;
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: Date | null;
};

function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi");
  for (const match of xml.match(re) ?? []) out.push(match);
  return out;
}

function tagContent(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  const inner = match[1]!.trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (cdata ? cdata[1]! : inner).trim();
}

/** Atom links live in attributes: <link href="..." rel="alternate"/>. */
function atomLink(block: string): string | null {
  const links = block.match(/<link\b[^>]*>/gi) ?? [];
  let fallback: string | null = null;
  for (const link of links) {
    const href = link.match(/href="([^"]+)"/i)?.[1] ?? null;
    if (!href) continue;
    const rel = link.match(/rel="([^"]+)"/i)?.[1];
    if (!rel || rel === "alternate") return decodeEntities(href);
    fallback = fallback ?? decodeEntities(href);
  }
  return fallback;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseFeed(xml: string, maxItems = 30): FeedItem[] {
  const items: FeedItem[] = [];
  const rssItems = blocks(xml, "item");
  const atomEntries = rssItems.length > 0 ? [] : blocks(xml, "entry");

  for (const block of [...rssItems, ...atomEntries].slice(0, maxItems)) {
    const title = sanitizeText(tagContent(block, "title"), 300);
    if (!title) continue;
    const isAtom = atomEntries.length > 0;
    const rawLink = isAtom ? atomLink(block) : tagContent(block, "link");
    const url = rawLink ? decodeEntities(rawLink) : null;
    const ref =
      sanitizeText(tagContent(block, "guid") ?? tagContent(block, "id"), 500) ?? url ?? title;
    const summary = sanitizeText(
      tagContent(block, "description") ??
        tagContent(block, "summary") ??
        tagContent(block, "content"),
      1500,
    );
    const publishedAt = parseDate(
      tagContent(block, "pubDate") ??
        tagContent(block, "updated") ??
        tagContent(block, "published"),
    );
    items.push({ ref, title, summary, url, publishedAt });
  }
  return items;
}
