# Jokot Inward — How to use it (by role)

Plain-language guide, one section per role. Useful two ways: as a handout
for staff learning the app, and as reference in a Claude support chat
when someone reports a problem — knowing what a role is *supposed* to see
makes it much faster to tell a real bug from a mistaken click.

Every screen works in a phone browser. No app to install — open the link,
sign in with your email and password, done.

---

## Gate

**What you do:** log every incoming bill the moment it arrives, before
it goes anywhere else.

1. Sign in → tap **+ New Bill**
2. Take a photo of the bill (camera opens automatically)
3. Type the vendor name — suggestions appear as you type
4. Fill in the vendor's bill number and date, security seal info if
   applicable, and where the physical paper file will be kept
5. Add each item on the bill: item name (suggestions appear), quantity,
   rate. Tap **+ Add item** for more lines.
6. Check the total at the bottom looks right, then **Save bill**

That's it — the bill now shows up for Store (quantity check) and
Purchase (rate check) automatically. You're done with it unless there's
a mistake to fix (ask a partner).

**Common issues:** vendor or item not in the suggestions → it needs to be
added to the master list first (a partner does this via `/setup`).

---

## Store

**What you do:** check that the quantity on each bill actually matches
what physically arrived.

1. Sign in → tap **GRN Queue** — every bill waiting on you is listed
2. Open a bill
3. For each item: tap **OK** if the quantity matches, or **Short** if not
4. If Short: enter how much was actually received and why (damaged,
   missing, etc.), then tap **Save** on that item
5. Once every item is marked (and every Short one has its details saved),
   tap **Confirm GRN**

After confirming, you'll see a GRN number and a downloadable PDF. If
anything was short, a second PDF (Vendor Shortage Note) also appears —
that's what goes to the vendor asking for a replacement or credit.

**Common issues:** "Confirm GRN" button stays greyed out → check every
item has been marked, and every Short item has both fields saved (look
for "Saved ✓" on each).

---

## Purchase

**What you do:** two separate jobs — checking rates, and resolving
issues that Store or you flagged.

### Checking rates
1. Sign in → tap **Price Approvals**
2. Open a bill, mark each item **OK** or **Discrepancy**
3. If Discrepancy: enter the correct rate, then **Save**
4. Once every item's marked and every discrepancy has its rate saved,
   tap **Approve Rates**

If the problem isn't about one specific item's rate (say, the invoice
total doesn't match the PO at all), skip the per-item marking and use
**"Raise a general query instead"** at the bottom of the screen.

### Resolving issues
1. Tap **Vendor Issues** from home — shows two lists: shortages (from
   Store) and price queries (yours or general ones)
2. For a shortage: tap **Resolve**, choose **Debit Note** or
   **Replacement Received**, add a note, confirm
3. For a price query: tap **Resolve**, describe how it was sorted out,
   confirm

Once both the quantity side and price side are clear, the bill is ready
for Accounts automatically — nothing more for you to do on it.

---

## Accounts

**What you do:** post confirmed bills to Tally once both the quantity and
price sides are clear.

1. Sign in → tap **Post to Tally** — every bill ready for you is listed
2. Open a bill, type in the voucher number from Tally (you post the bill
   in Tally first, then record that voucher number here)
3. Tap **Post to Tally**

That's it — the bill is now marked posted and drops out of your queue.
There's no live connection to Tally itself; this just records that it's
done.

**Common issues:** a bill you expect to see isn't in the queue → check
its bill detail page for "Waiting on" — it needs both Store and Purchase
to have cleared it first.

---

## Partner (full visibility, read-only)

Sees everything above — every bill, every queue, the Dashboard — but
can't perform the role-specific actions (create a bill, confirm a GRN,
approve rates, resolve an issue, post to Tally). That's a deliberate
choice from the original spec: partner is for oversight, not for
covering someone else's queue.

If a partner account taps into a role's action screen directly, the app
will redirect back home with a note that the page is for a different
role — that's expected, not a bug.

**Dashboard** (any role can view): counts across every queue, plus a
list of bills with no progress in 48+ hours — a quick way to spot
something that's fallen through the cracks.

---

## Reporting a problem

Screenshot the exact screen where something looks wrong — the error
message if there is one, or what you expected vs. what you saw. Include
which bill number if relevant. That's almost always enough to fix it
fast.
