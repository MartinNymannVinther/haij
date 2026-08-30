import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import da from "../../messages/da.json";
import en from "../../messages/en.json";

/**
 * next-intl resolves message keys at render time, so a key pointing at
 * the wrong namespace compiles, builds, and only breaks in front of the
 * user. This walks the source for `useTranslations`/`getTranslations`
 * namespaces and the literal keys used against them, and proves every one
 * exists — the check the type system does not do for us.
 *
 * Keys built at runtime (`t(`status.${x}`)`) are skipped: they cannot be
 * resolved statically, and guessing would make this test lie.
 */

type Messages = { [key: string]: string | Messages };

function collectKeys(node: Messages, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") keys.add(path);
    else for (const nested of collectKeys(value, path)) keys.add(nested);
  }
  return keys;
}

function resolve(node: Messages, path: string): string | Messages | undefined {
  return path.split(".").reduce<string | Messages | undefined>((current, part) => {
    if (current === undefined || typeof current === "string") return undefined;
    return current[part];
  }, node);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const daKeys = collectKeys(da as Messages);
const enKeys = collectKeys(en as Messages);

describe("message catalogues", () => {
  it("da and en carry exactly the same keys", () => {
    const onlyDa = [...daKeys].filter((key) => !enKeys.has(key)).sort();
    const onlyEn = [...enKeys].filter((key) => !daKeys.has(key)).sort();
    expect({ onlyDa, onlyEn }).toEqual({ onlyDa: [], onlyEn: [] });
  });
});

describe("keys used in the app", () => {
  it("every literal key resolves in both catalogues", () => {
    const missing: string[] = [];

    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");

      const namespaces = new Map<string, string>();
      const declaration =
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g;
      for (const match of source.matchAll(declaration)) {
        namespaces.set(match[1]!, match[2]!);
      }
      if (namespaces.size === 0) continue;

      for (const [variable, namespace] of namespaces) {
        const usage = new RegExp(`\\b${variable}\\(\\s*"([^"]+)"`, "g");
        for (const match of source.matchAll(usage)) {
          const path = `${namespace}.${match[1]!}`;
          for (const [locale, catalogue] of [
            ["da", da],
            ["en", en],
          ] as const) {
            if (typeof resolve(catalogue as Messages, path) !== "string") {
              missing.push(`${file}: ${locale} mangler "${path}"`);
            }
          }
        }
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});
