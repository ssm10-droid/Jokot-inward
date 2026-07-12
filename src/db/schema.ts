import {
  pgTable,
  pgEnum,
  text,
  date,
  timestamp,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "gate",
  "store",
  "purchase",
  "accounts",
  "partner",
]);

export const grnStatusEnum = pgEnum("grn_status", ["pending", "ok", "short"]);

export const priceStatusEnum = pgEnum("price_status", [
  "pending",
  "approved",
  "query",
]);

export const checkStatusEnum = pgEnum("check_status", [
  "pending",
  "ok",
  "short",
]);

export const rateStatusEnum = pgEnum("rate_status", [
  "pending",
  "ok",
  "discrepancy",
]);

export const resolutionTypeEnum = pgEnum("resolution_type", [
  "debit_note",
  "replacement_received",
]);

export const itemTypeEnum = pgEnum("item_type", ["stock", "expense"]);

// ---------------------------------------------------------------------------
// users — role lookup by authenticated email; the authoritative role source
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  email: text("email").primaryKey(), // always stored lowercase
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  passwordHash: text("password_hash"), // bcrypt; null = cannot sign in yet
  active: boolean("active").notNull().default(true),
});

// ---------------------------------------------------------------------------
// vendors
// ---------------------------------------------------------------------------

export const vendors = pgTable("vendors", {
  name: text("name").primaryKey(),
  tallyLedgerName: text("tally_ledger_name"),
  gstin: text("gstin"),
  defaultPurchaseLedger: text("default_purchase_ledger"),
  state: text("state"), // used later for CGST+SGST vs IGST — captured now, not computed on
  billsCount: integer("bills_count").notNull().default(0),
});

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

export const items = pgTable("items", {
  name: text("name").primaryKey(),
  tallyStockItemName: text("tally_stock_item_name"),
  uom: text("uom"),
  type: itemTypeEnum("type").notNull().default("stock"),
  gstPct: numeric("gst_pct", { precision: 5, scale: 2 }),
  timesUsed: integer("times_used").notNull().default(0),
});

// ---------------------------------------------------------------------------
// supplier_item_map — known-incomplete; item picker must fall back to full list
// ---------------------------------------------------------------------------

export const supplierItemMap = pgTable("supplier_item_map", {
  id: text("id").primaryKey(), // `${supplier_name}::${item_name}`
  supplierName: text("supplier_name").notNull(),
  itemName: text("item_name").notNull(),
  supplierItemCode: text("supplier_item_code"),
  isActive: boolean("is_active").notNull().default(true),
});

// ---------------------------------------------------------------------------
// bills — one row per physical bill, created at the gate
//
// NOTE: total_amount and items_count from the spec are NOT columns here.
// They are computed from bill_items at read time (see src/lib/derive.ts)
// so they can never drift out of sync. Same for stage / waiting_on /
// short_lines_count / all_items_checked / shortage_details_filled and the
// rate-side mirrors.
// ---------------------------------------------------------------------------

export const bills = pgTable("bills", {
  id: text("id").primaryKey(), // PB26-#### — generated in a serialized transaction, see lib/ids.ts

  // Gate entry
  securitySealDate: date("security_seal_date"),
  securitySerialNo: text("security_serial_no"),
  billDate: date("bill_date"),
  billNo: text("bill_no"), // vendor's own invoice number
  vendorName: text("vendor_name")
    .notNull()
    .references(() => vendors.name),
  billPhotoUrl: text("bill_photo_url"),
  physicalFileLocation: text("physical_file_location"),
  gateBy: text("gate_by").notNull(), // email, auto-set on creation
  gateDate: timestamp("gate_date", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // Store side (quantity)
  grnNo: text("grn_no"), // GRN-YYYYMMDD-N, set only when GRN is confirmed
  grnStatus: grnStatusEnum("grn_status").notNull().default("pending"),
  grnBy: text("grn_by"),
  grnCheckedDate: timestamp("grn_checked_date", { withTimezone: true }),

  // Purchase side (price)
  priceStatus: priceStatusEnum("price_status").notNull().default("pending"),
  priceBy: text("price_by"),
  priceDate: timestamp("price_date", { withTimezone: true }),
  priceRemark: text("price_remark"), // required only at Raise Query, enforced in the transition

  // Vendor-issue resolution
  issueResolvedBy: text("issue_resolved_by"),
  issueResolvedDate: timestamp("issue_resolved_date", { withTimezone: true }),
  resolutionType: resolutionTypeEnum("resolution_type"),
  resolutionNotes: text("resolution_notes"),
  vendorMessage: text("vendor_message"), // auto-drafted shortage note

  // Accounts
  tallyVoucherNo: text("tally_voucher_no"),
  accountsPostedBy: text("accounts_posted_by"),
  accountsPostedDate: timestamp("accounts_posted_date", { withTimezone: true }),

  // Generated documents
  grnNoteFileUrl: text("grn_note_file_url"),
  vendorNoteFileUrl: text("vendor_note_file_url"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// bill_items
// ---------------------------------------------------------------------------

export const billItems = pgTable("bill_items", {
  id: text("id").primaryKey(), // `${bill_id}-${n}`
  billId: text("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  itemName: text("item_name")
    .notNull()
    .references(() => items.name),
  tallyStockItem: text("tally_stock_item"), // snapshot from items at entry time
  qtyBilled: numeric("qty_billed", { precision: 14, scale: 3 }).notNull(),
  uom: text("uom"), // snapshot from items at entry time
  rateBilled: numeric("rate_billed", { precision: 14, scale: 2 }).notNull(),
  // amount = qty_billed × rate_billed, computed at read time — not stored

  // Quantity check (store)
  checkStatus: checkStatusEnum("check_status").notNull().default("pending"),
  actualQtyReceived: numeric("actual_qty_received", {
    precision: 14,
    scale: 3,
  }), // meaningful only when check_status = short; enforced at Confirm GRN
  grnRemarks: text("grn_remarks"),

  // Rate check (purchase)
  rateStatus: rateStatusEnum("rate_status").notNull().default("pending"),
  correctRate: numeric("correct_rate", { precision: 14, scale: 2 }),
  rateRemarks: text("rate_remarks"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// audit_log — every state transition records who did it and when.
// The stamped columns on bills (grn_by, price_by, ...) answer "who owns the
// current state"; this table answers "what happened, in order".
// ---------------------------------------------------------------------------

export const auditLog = pgTable("audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  billId: text("bill_id")
    .notNull()
    .references(() => bills.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // e.g. bill_created, item_marked_short, grn_confirmed
  detail: text("detail"), // JSON string with before/after where useful
  actorEmail: text("actor_email").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// counters — atomic sequences for bill IDs (PB26-####) and daily GRN numbers.
// A single INSERT..ON CONFLICT..RETURNING is concurrency-safe over Neon's
// stateless HTTP driver, where advisory transaction locks are not.
// ---------------------------------------------------------------------------

export const counters = pgTable("counters", {
  key: text("key").primaryKey(), // e.g. "bill:PB26", "grn:20260712"
  value: integer("value").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const billsRelations = relations(bills, ({ many, one }) => ({
  items: many(billItems),
  vendor: one(vendors, {
    fields: [bills.vendorName],
    references: [vendors.name],
  }),
  audit: many(auditLog),
}));

export const billItemsRelations = relations(billItems, ({ one }) => ({
  bill: one(bills, { fields: [billItems.billId], references: [bills.id] }),
  item: one(items, {
    fields: [billItems.itemName],
    references: [items.name],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  bill: one(bills, { fields: [auditLog.billId], references: [bills.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillItem = typeof billItems.$inferSelect;
export type Role = User["role"];
