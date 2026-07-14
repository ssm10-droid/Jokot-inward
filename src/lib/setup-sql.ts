/**
 * Idempotent DDL for the /setup route — lets the whole database be created
 * from the browser, no terminal needed. Each statement is safe to run
 * repeatedly and is executed individually (Neon's HTTP driver runs one
 * statement per request).
 *
 * Keep this in sync with src/db/schema.ts. Phase changes that alter the
 * schema should update both (or move to proper drizzle migrations once a
 * laptop workflow exists).
 */
export const SETUP_STATEMENTS: string[] = [
  // Enums (CREATE TYPE has no IF NOT EXISTS; DO-block swallow duplicates)
  `DO $$ BEGIN CREATE TYPE "role" AS ENUM ('gate','store','purchase','accounts','partner'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "grn_status" AS ENUM ('pending','ok','short'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "price_status" AS ENUM ('pending','approved','query'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "check_status" AS ENUM ('pending','ok','short'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "rate_status" AS ENUM ('pending','ok','discrepancy'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "resolution_type" AS ENUM ('debit_note','replacement_received'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "item_type" AS ENUM ('stock','expense'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `CREATE TABLE IF NOT EXISTS "users" (
    "email" text PRIMARY KEY,
    "name" text NOT NULL,
    "role" "role" NOT NULL,
    "password_hash" text,
    "active" boolean NOT NULL DEFAULT true
  )`,

  // For databases created before password auth existed
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text`,

  // For databases created before the Google-Sheets master-data sync existed
  `ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "vendor_group" text`,
  `ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "gst_reg_type" text`,
  `ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "item_group" text`,
  `ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "hsn_code" text`,
  `ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`,

  `CREATE TABLE IF NOT EXISTS "vendors" (
    "name" text PRIMARY KEY,
    "tally_ledger_name" text,
    "gstin" text,
    "default_purchase_ledger" text,
    "state" text,
    "bills_count" integer NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS "items" (
    "name" text PRIMARY KEY,
    "tally_stock_item_name" text,
    "uom" text,
    "type" "item_type" NOT NULL DEFAULT 'stock',
    "gst_pct" numeric(5,2),
    "times_used" integer NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS "supplier_item_map" (
    "id" text PRIMARY KEY,
    "supplier_name" text NOT NULL,
    "item_name" text NOT NULL,
    "supplier_item_code" text,
    "is_active" boolean NOT NULL DEFAULT true
  )`,

  `CREATE TABLE IF NOT EXISTS "bills" (
    "id" text PRIMARY KEY,
    "security_seal_date" date,
    "security_serial_no" text,
    "bill_date" date,
    "bill_no" text,
    "vendor_name" text NOT NULL REFERENCES "vendors"("name"),
    "bill_photo_url" text,
    "physical_file_location" text,
    "gate_by" text NOT NULL,
    "gate_date" timestamptz NOT NULL DEFAULT now(),
    "grn_no" text,
    "grn_status" "grn_status" NOT NULL DEFAULT 'pending',
    "grn_by" text,
    "grn_checked_date" timestamptz,
    "price_status" "price_status" NOT NULL DEFAULT 'pending',
    "price_by" text,
    "price_date" timestamptz,
    "price_remark" text,
    "issue_resolved_by" text,
    "issue_resolved_date" timestamptz,
    "resolution_type" "resolution_type",
    "resolution_notes" text,
    "vendor_message" text,
    "tally_voucher_no" text,
    "accounts_posted_by" text,
    "accounts_posted_date" timestamptz,
    "grn_note_file_url" text,
    "vendor_note_file_url" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS "bill_items" (
    "id" text PRIMARY KEY,
    "bill_id" text NOT NULL REFERENCES "bills"("id") ON DELETE CASCADE,
    "item_name" text NOT NULL REFERENCES "items"("name"),
    "tally_stock_item" text,
    "qty_billed" numeric(14,3) NOT NULL,
    "uom" text,
    "rate_billed" numeric(14,2) NOT NULL,
    "check_status" "check_status" NOT NULL DEFAULT 'pending',
    "actual_qty_received" numeric(14,3),
    "grn_remarks" text,
    "rate_status" "rate_status" NOT NULL DEFAULT 'pending',
    "correct_rate" numeric(14,2),
    "rate_remarks" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS "counters" (
    "key" text PRIMARY KEY,
    "value" integer NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "bill_id" text NOT NULL REFERENCES "bills"("id") ON DELETE CASCADE,
    "action" text NOT NULL,
    "detail" text,
    "actor_email" text NOT NULL,
    "at" timestamptz NOT NULL DEFAULT now()
  )`,
];
