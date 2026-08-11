import type { AmazonTaxReportRow } from "@/lib/amazon-tax-report";
import type { MarketplaceChannel } from "@/lib/amazon-tax-report";

export const MARKETPLACE_INCOME_QUEUE_KEY = "fiscal-marketplace-income-queue-v1";

export type MarketplaceIncomeQueueItem = AmazonTaxReportRow & {
  localId: string;
  sourceFile: string;
  documentId?: string | null;
};

export type MarketplaceIncomeQueuePayload = {
  channel: MarketplaceChannel;
  needsPeriodDate: boolean;
  items: MarketplaceIncomeQueueItem[];
};

export function saveMarketplaceIncomeQueue(payload: MarketplaceIncomeQueuePayload) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(MARKETPLACE_INCOME_QUEUE_KEY, JSON.stringify(payload));
}

export function peekMarketplaceIncomeQueue(): MarketplaceIncomeQueuePayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(MARKETPLACE_INCOME_QUEUE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as
      | MarketplaceIncomeQueuePayload
      | MarketplaceIncomeQueueItem[];
    // Compat cola antigua (array plano)
    if (Array.isArray(parsed)) {
      return {
        channel: parsed[0]?.channel ?? "AMAZON",
        needsPeriodDate: false,
        items: parsed,
      };
    }
    if (parsed && Array.isArray(parsed.items)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearMarketplaceIncomeQueue() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(MARKETPLACE_INCOME_QUEUE_KEY);
}
