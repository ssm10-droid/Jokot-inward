import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function logAction(
  billId: string,
  action: string,
  actorEmail: string,
  detail?: Record<string, unknown>
) {
  await db.insert(auditLog).values({
    billId,
    action,
    actorEmail,
    detail: detail ? JSON.stringify(detail) : null,
  });
}
