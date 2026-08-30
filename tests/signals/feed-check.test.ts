import { describe, expect, it } from "vitest";
import { checkFeed } from "@/modules/signals/feed-check";

/**
 * The point of the check is to fail loudly on the mistakes that otherwise
 * stay silent: an address that answers with a web page, one that is gone,
 * and one that does not answer at all.
 */

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Kilde</title>
  <item><title>Nyeste artikel</title><link>https://example.test/1</link></item>
  <item><title>Ældre artikel</title><link>https://example.test/2</link></item>
</channel></rss>`;

function respondWith(body: string, init?: ResponseInit): typeof fetch {
  return (async () => new Response(body, init)) as unknown as typeof fetch;
}

describe("checkFeed", () => {
  it("reports how many articles a working feed holds and names the newest", async () => {
    expect(await checkFeed("https://example.test/rss", respondWith(RSS))).toEqual({
      status: "ok",
      items: 2,
      newestTitle: "Nyeste artikel",
    });
  });

  it("calls out an address that answers with a web page instead of a feed", async () => {
    const html = "<!doctype html><html><body><h1>Nyheder</h1></body></html>";
    expect(await checkFeed("https://example.test/news", respondWith(html))).toEqual({
      status: "not_feed",
    });
  });

  it("reports a feed that parses but holds nothing", async () => {
    const empty = `<?xml version="1.0"?><rss version="2.0"><channel><title>Tom</title></channel></rss>`;
    expect(await checkFeed("https://example.test/rss", respondWith(empty))).toEqual({
      status: "empty",
    });
  });

  it("passes the HTTP code along so 404 and 403 can be told apart", async () => {
    expect(await checkFeed("https://example.test/gone", respondWith("", { status: 404 }))).toEqual({
      status: "http",
      code: 404,
    });
  });

  it("treats a refused connection and a bad address the same way", async () => {
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await checkFeed("https://example.test/rss", boom)).toEqual({ status: "unreachable" });
    expect(await checkFeed("ikke en adresse", boom)).toEqual({ status: "unreachable" });
    expect(await checkFeed("file:///etc/passwd", boom)).toEqual({ status: "unreachable" });
  });
});
