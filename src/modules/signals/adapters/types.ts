import type { SignalSource } from "@/core/db/schema";

/** A normalized, already-sanitized item from any source. */
export type RawSignal = {
  source: SignalSource;
  /** Stable within the source; dedupe key together with source. */
  sourceRef: string;
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: Date | null;
  companyCvr: string | null;
  /** Raw source payload, stored as the GDPR source log. */
  payload: unknown;
};

export type AdapterResult =
  | { status: "ok"; items: RawSignal[] }
  | { status: "skipped"; detail: string }
  | { status: "unavailable"; detail: string };

export interface SourceAdapter {
  readonly source: SignalSource;
  fetchNew(): Promise<AdapterResult>;
}
