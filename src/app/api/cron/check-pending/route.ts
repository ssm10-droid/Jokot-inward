import { db } from "@/db";
import { deriveStage } from "@/lib/derive";
import { notifyEscalation } from "@/lib/notify";
import type { Bill, Role } from "@/db/schema";

/**
 * Escalation sweep: called every 5 minutes by a GitHub Actions schedule
 * (Vercel Hobby cron only runs daily). Protected by CRON_SECRET as a
 * ?token= query param — bypasses the session middleware the same way
 * /export does, since a scheduled curl can't carry a login cookie.
 *
 * For every unposted bill, each currently-open blocker that has been
 * waiting >= ESCALATE_AFTER_MIN with no action gets ONE escalation email
 * (deduped forever via the notifications table).
 */

const ESCALATE_AFTER_MIN = 20;

interface Blocker {
  key: string; // dedupe key per bill
  roles: Role[]; // who is responsible
  what: string; // human description
  since: Date | null; // when this blocker started
  issuePath?: string; // override link for purchase (issues screen)
}

function openBlockers(bill: Bill): Blocker[] {
  const stage = deriveStage(bill);
  const blockers: Blocker[] = [];

  if (stage === "in_tally") return blockers;

  // Quantity side
  if (bill.grnStatus === "pending") {
    blockers.push({
      key: "store_check",
      roles: ["store"],
      what: "Store: quantity check / GRN confirmation",
      since: bill.gateDate,
    });
  } else if (bill.grnStatus === "short") {
    blockers.push({
      key: "shortage",
      roles: ["purchase"],
      what: "Purchase: vendor shortage resolution",
      since: bill.grnCheckedDate,
      issuePath: "/issues",
    });
  }

  // Price side
  if (bill.priceStatus === "pending") {
    blockers.push({
      key: "price_check",
      roles: ["purchase"],
      what: "Purchase: rate check / approval",
      since: bill.gateDate,
    });
  } else if (bill.priceStatus === "query") {
    blockers.push({
      key: "price_query",
      roles: ["purchase"],
      what: "Purchase: open price query",
      since: bill.priceDate,
      issuePath: "/issues",
    });
  }

  // Both sides clear → waiting on accounts
  if (stage === "ready_for_accounts") {
    const g = bill.grnCheckedDate?.getTime() ?? 0;
    const p = bill.priceDate?.getTime() ?? 0;
    blockers.push({
      key: "accounts",
      roles: ["accounts"],
      what: "Accounts: post to Tally",
      since: new Date(Math.max(g, p)),
    });
  }

  return blockers;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || token !== expected) {
    return new Response("Unauthorized. Add ?token=... to the URL.", {
      status: 401,
    });
  }

  const now = Date.now();
  const cutoffMs = ESCALATE_AFTER_MIN * 60 * 1000;
  const allBills = await db.query.bills.findMany();

  const results: Record<string, string[]> = {
    sent: [],
    already: [],
    failed: [],
    notYet: [],
  };

  for (const bill of allBills) {
    for (const b of openBlockers(bill)) {
      if (!b.since) continue;
      const waitedMs = now - b.since.getTime();
      const label = `${bill.id}/${b.key}`;
      if (waitedMs < cutoffMs) {
        results.notYet.push(label);
        continue;
      }
      const outcome = await notifyEscalation(
        bill.id,
        b.key,
        b.roles,
        bill.vendorName,
        b.what,
        Math.floor(waitedMs / 60000),
        b.issuePath
      );
      results[outcome].push(label);
    }
  }

  return Response.json({
    checkedAt: new Date().toISOString(),
    escalateAfterMin: ESCALATE_AFTER_MIN,
    ...results,
  });
}
