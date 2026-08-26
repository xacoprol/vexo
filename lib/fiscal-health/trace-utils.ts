import type { Model303Trace, Model303TraceLine } from "@/lib/modelo-303";
import type { Model130TraceLine } from "@/lib/modelo-130/types";
import type { Model349OperationKey, Model349Result } from "@/lib/modelo-349";
import type { FiscalQuarter } from "@/lib/fiscal";

export function sourceKey(
  sourceType: string,
  sourceId: string | undefined
): string | null {
  if (!sourceId) return null;
  return `${sourceType}:${sourceId}`;
}

export function index303Trace(
  trace303: Model303Trace | undefined
): Map<string, Model303TraceLine[]> {
  const out = new Map<string, Model303TraceLine[]>();
  if (!trace303) return out;
  for (const lines of Object.values(trace303)) {
    if (!lines) continue;
    for (const line of lines) {
      const key = sourceKey(line.sourceType, line.sourceId);
      if (!key) continue;
      const list = out.get(key) ?? [];
      list.push(line);
      out.set(key, list);
    }
  }
  return out;
}

export function index130IncomeTrace(
  trace:
    | {
        box01?: Model130TraceLine[];
      }
    | undefined
): Map<string, Model130TraceLine> {
  const out = new Map<string, Model130TraceLine>();
  for (const line of trace?.box01 ?? []) {
    const key = sourceKey(line.sourceType, line.sourceId);
    if (key) out.set(key, line);
  }
  return out;
}

export type Indexed349Source = {
  key: Model349OperationKey;
  quarter: FiscalQuarter;
  base: number;
};

export function index349YearTrace(
  drafts: Model349Result[]
): Map<string, Indexed349Source[]> {
  const out = new Map<string, Indexed349Source[]>();
  for (const d of drafts) {
    for (const op of d.operations) {
      for (const t of op.trace) {
        const key = sourceKey(t.sourceType, t.sourceId);
        if (!key) continue;
        const list = out.get(key) ?? [];
        list.push({ key: op.key, quarter: d.quarter, base: t.base });
        out.set(key, list);
      }
    }
    for (const r of d.rectifications) {
      for (const t of r.trace) {
        const key = sourceKey(t.sourceType, t.sourceId);
        if (!key) continue;
        const list = out.get(key) ?? [];
        list.push({ key: r.operationKey, quarter: d.quarter, base: t.base });
        out.set(key, list);
      }
    }
  }
  return out;
}

export function collect349WarningSourceIds(
  drafts: Model349Result[]
): Set<string> {
  const out = new Set<string>();
  for (const d of drafts) {
    for (const w of d.warnings) {
      if (w.sourceId) out.add(w.sourceId);
    }
  }
  return out;
}

export function boxVal(
  boxes: { code: string; value: number }[],
  code: string
): number {
  return boxes.find((b) => b.code === code)?.value ?? 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
