import { NextRequest, NextResponse } from "next/server";
import { runFiscalDeadlineReminders } from "@/lib/fiscal-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFiscalDeadlineReminders(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Fiscal reminder cron failed",
      },
      { status: 500 }
    );
  }
}
