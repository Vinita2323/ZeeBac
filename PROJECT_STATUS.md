# Zeebac — Master Project Status (Phase-Wise)

> Living document. Update the checkboxes as work lands. Last updated: 2026-09-05 (Phase 2 complete).

**How to read this:** Every phase below comes from the forensic audit + completion plan. Each item is checked off only once it's actually built, wired, and (where money is involved) tested — not just because a file exists. `✅ DONE` / `🟡 PARTIAL` / `🔴 NOT STARTED` / `⛔ BLOCKED` (waiting on a client/business decision).

---

## 0. One-line status of the whole project

**Phases 1 and 2 of 9 are complete.** The core money-movement code (wallet debits/credits, Razorpay verification, cashback-request approval) is atomic, idempotent, and consent-gated, and the no-POS receipt/bill-claim flow now has real photo capture, non-blocking GPS/fraud signals, daily limits, duplicate detection, and a high-value flag for admins. Phases 3–9 — the QR/POS flow, the online-payment webhook/settlement, the cashback rules/limits engine, the revenue model, admin cleanup, frontend polish, and final QA — are **not started**.

| Phase | Name | Status |
|---|---|---|
| 1 | Security & Money-Safety Foundation | ✅ **DONE** |
| 2 | Cash + No-POS Flow (receipt/bill claims) | ✅ **DONE** |
| 3 | Cash + POS Flow (vendor-as-POS, real QR) | ✅ **DONE** |
| 4 | Online / Razorpay Flow (webhook, settlement) | ✅ **DONE** |
| 5 | Cashback Engine & Limits | 🟡 PARTIAL (centralized calc + rate bounds done in Phase 1 spillover; limits/rules not done) |
| 6 | Revenue Model + Referral/Rewards Funding | ⛔ BLOCKED (needs your decision — see §6) |
| 7 | Admin Panel Completeness | 🔴 NOT STARTED |
| 8 | Frontend Polish, Dead Code, Push Notifications | 🔴 NOT STARTED |
| 9 | Final Security Re-Audit + QA | 🔴 NOT STARTED |

---

## PHASE 1 — Security & Money-Safety Foundation — ✅ DONE

- [x] Real OTP delivery — hardcoded `"1234"` removed, real random 4-digit OTP restored, sent via new `backend/src/utils/sms.util.js` (MSG91 Flow API; console-logs in dev until real `MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID` are added to `.env`, fails loudly in production if unconfigured)
- [x] Rate limiting — `backend/src/middlewares/rateLimit.middleware.js`, applied to `/send-otp`, `/customer/login`, `/vendor/login`, `/admin/login`. Verified live (429 kicks in after 5 rapid requests).
- [x] Wallet atomicity — `backend/src/utils/wallet.util.js` (`debitWallet`/`creditWallet`), atomic `findOneAndUpdate` with a `balance: {$gte: amount}` guard, wrapped in Mongo sessions. Applied to `logPurchase`, `respondToCashbackRequest`, `verifyRazorpayPayment` (vendor recharge), `createCustomerTransaction`, `verifyRazorpayAndCreateTransaction`, `processWalletPayment`.
- [x] Idempotency — unique sparse index on `WalletTransaction.gatewayPaymentId` + `assertGatewayPaymentNotProcessed` check-before-credit on both Razorpay verify endpoints. Replayed payment now returns 409, doesn't double-credit.
- [x] Razorpay amount trust fix — `backend/src/utils/razorpay.util.js`, both verify endpoints now call `payments.fetch()` and use Razorpay's own captured amount, never the client's `amount` field. Signature check is now constant-time.
- [x] Vendor-consent gate on the "Cash" flow — `createCustomerTransaction` no longer moves money instantly; it creates a `CashbackRequest` that the vendor must approve via the existing `respondToCashbackRequest` pipeline. Frontend (`PayVendorScreen.jsx`) updated to match — "Send for Vendor Approval" instead of instant credit, routes to `/request/:id`.
- [x] Double-approval race fixed — `respondToCashbackRequest` atomically claims the request (`findOneAndUpdate` with a `status: 'Pending'` filter) before moving any money.
- [x] Cashback calculation centralized — `backend/src/utils/cashback.util.js`, replacing 6 duplicated/drifting inline formulas.
- [x] `Vendor.cashbackRate` bounded 0–100 in the schema (was unbounded).
- [x] Referral bonus logic centralized (`backend/src/utils/referral.util.js`) and made race-safe (atomic claim), and — new — now also fires on approved cash-claims via `respondToCashbackRequest` (previously only fired on the old instant-cash and vendor-logged paths, never on receipt/cash claims going through approval).
- [x] Testing harness — Vitest + Supertest + `mongodb-memory-server` (real Mongo replica set, not mocks). **12 tests passing**, including a concurrency test (10 simultaneous debits against a wallet that can only afford 1 → exactly 1 succeeds) and a double-approval race test (two simultaneous "Approve" calls → exactly one payout). Run with `npm test` from `backend/`.

**Not done in Phase 1 (deliberately deferred to later phases per the plan):**
- [ ] Vendor visibility into their own `cashbackRate` (still causes "₹NaN" on vendor dashboard) — deferred to Phase 3
- [ ] Refund handling for real payments — deferred to Phase 4
- [ ] Razorpay webhook — deferred to Phase 4

---

## PHASE 2 — Cash + No-POS Flow (receipt/bill cashback requests) — ✅ DONE

**Decisions you made this phase:** GPS is advisory-only (never blocks a claim) · daily limit is 3 requests/24h across both cash_claim and receipt_claim combined · ₹2,000+ claims are flagged for admin visibility only, vendor approval is unaffected.

- [x] Real bill photo capture — `RequestCashbackScreen.jsx` now uses two real file inputs (`capture="environment"` opens the device's native camera; a second input handles gallery picks), no more fake stock-photo substitution
- [x] Upload routed through the existing multer pipeline (`billImg` → `uploads/receipts`) via real `FormData`, not raw base64 JSON — also fixed a real bug this exposed: the `uploads/receipts` directory didn't exist and multer doesn't auto-create destination folders, so the first real upload would have thrown `ENOENT`. `multer.middleware.js` now creates any missing upload subfolder on first use.
- [x] `CashbackRequest.billImageUrl` is conditionally required at the schema level — required for `requestType: 'receipt_claim'`, not required for `requestType: 'cash_claim'` (the quick "I paid cash" declaration from `PayVendorScreen.jsx`, which was already folded into this same model in Phase 1 and has no photo to give)
- [x] GPS captured on submit via `navigator.geolocation` (was completely absent before) + distance-to-vendor computed via a new Haversine util (`backend/src/utils/geo.util.js`) and stored on the request for admin/vendor review — never blocks submission if denied/unavailable, per your decision
- [x] Daily limit (3/24h rolling window, shared across both request types) + duplicate-request detection (same customer+vendor+amount within 10 minutes) — `backend/src/utils/cashbackRequestLimits.util.js`
- [x] ₹2,000+ claims get `isHighValue: true` and trigger a new `HIGH_VALUE_REQUEST` admin notification; vendor approval flow is completely unaffected (non-blocking, per your decision)
- [x] Fixed `RequestDetailsScreen.jsx` reading `request.billImg` (always undefined) → now reads the real `billImageUrl` field and builds the correct served URL; also fixed "Payment Method" (was hardcoded to "Digital Payment") and "Date of Purchase" (was showing submission time, not the actual purchase date) to show the real values
- [x] `paymentMethod`/`purchaseDate` now actually sent from the frontend and persisted on the request

**Tested:** 9 new tests (21 total passing) covering: photo required for receipt claims, high-value flagging at the ₹2,000 boundary, GPS distance computed correctly but never blocking, the daily-limit rejection on a 4th request, duplicate-request rejection, and that one customer's limit doesn't affect another's.

---



## PHASE 3 — Cash + POS Flow (vendor-initiated logging, real QR) — ✅ DONE

*Scope note: no real third-party POS hardware integration exists or is planned — this phase means the vendor's own app acting as the point of sale, hardening the existing `logPurchase` flow with real QR instead of the current simulated scan.*

- [x] Real QR generation — signed, short-lived payload (`qr.util.js`, `useQrCode.js`, `/api/user/qr-token`, `/api/vendor/qr-token`)
- [x] Real camera scanning on the customer side (`ScanQRScreen.jsx` — `html5-qrcode` camera feed + gallery decode + manual fallback)
- [x] Real camera scanning on the vendor side (`VendorScanCustomerScreen.jsx` — `html5-qrcode` camera feed + gallery decode + recent customer select)
- [x] Backend QR validation endpoint (HMAC signature + TTL check in `lookupVendorById` & `lookupCustomerByPhone`, 7 vitest tests passing)
- [x] Give vendors visibility into their own `cashbackRate` (fixes dashboard "₹NaN" bug in `DashboardPage.jsx`, `RequestsPage.jsx`, `vendor.controller.js`, `VendorLogTransactionScreen.jsx`)

---



## PHASE 4 — Online / Razorpay Flow — ✅ DONE

- [x] Razorpay webhook endpoint (`payment.captured`/`payment.failed`) — `/api/webhooks/razorpay` with constant-time HMAC signature verification (`webhook.util.js`) & rawBody parsing. Idempotent recovery for dropped network/app killed payments (`webhook.controller.js`).
- [x] Refund handling + reversal path — `/api/admin/transactions/:id/refund` atomically debits customer cashback earned, credits vendor wallet, updates transaction status to `'Refunded'`, and writes reversal passbook rows.
- [x] Vendor settlement decision + hardening — Admin withdrawal approval/rejection hardened in `admin.controller.js` with atomic `creditWallet` helpers and ledger logs on payout rejection.

---

## PHASE 5 — Cashback Engine & Limits — 🟡 PARTIAL

- [x] Centralized calculation (`cashback.util.js`) — done in Phase 1
- [x] `Vendor.cashbackRate` bounded 0–100 — done in Phase 1
- [ ] Decide `CashbackRule`'s fate — right now the admin CRUD page is fully cosmetic (saves to DB, has zero effect on any real cashback calculation)
- [ ] Min/max bill amount, max cashback cap, daily/monthly caps per customer and per vendor, cashback expiry
- [ ] Reversal path for a `Transaction` later flagged fraudulent (schema already has `Flagged`/`Rejected` states nothing currently uses)

**⛔ Needs your decision:** should `CashbackRule` (shop-type min/max) actually bound `vendor.cashbackRate`? And the actual limit numbers.

---

## PHASE 6 — Revenue Model + Referral/Rewards Funding — ⛔ BLOCKED

**This is the single biggest open question in the whole project — nothing here can be built until it's answered:**

- [ ] **What is Zeebac's revenue mechanism?** Commission %? Subscription tier (the dead `Basic/Pro/Enterprise` schema on `Vendor.js` implies this was once planned)? Something manual/offline? **Currently: zero confirmed revenue mechanism exists anywhere in the code.**
- [ ] **Who funds the ₹150 referral bonus and scratch-card rewards?** Right now they're created from nothing — no debit counterpart anywhere — which means Zeebac itself effectively absorbs the cost the moment someone withdraws that money.
- [ ] Once answered: implement the chosen revenue mechanism (commission deduction at cashback-calculation time, or a real subscription system with Razorpay recurring billing + expiry/renewal via a scheduled job)
- [ ] Give referral/scratch-card rewards a real funding source + an abuse guard (multi-account farming is trivial today since phone verification is fake via the old OTP bug — now fixed in Phase 1, which already partially closes this)

---

## PHASE 7 — Admin Panel Completeness — 🔴 NOT STARTED

- [ ] Wire `CashbackRulesPage.jsx` to whatever Phase 5 decides (or remove it) — including its broken delete button (`rule.id` should be `rule._id`)
- [ ] Replace hardcoded `pendingPayouts = 0` in Wallet Monitor with a real count
- [ ] Render the already-coded Partner Offers tab in `RewardsManagerPage.jsx` (handlers exist, never rendered)
- [ ] Give Fraud Detection's "Take Action" button a real action (flag/hold/reverse), tied into Phase 5's reversal path
- [ ] Enforce `AdminUser.permissions` in middleware, or remove the sidebar's implication that admin roles differ
- [ ] Fix `req.user._id` vs `req.user.id` bug breaking `createdBy` attribution on cashback-rule/reward-config/offer writes
- [ ] Fix `saveAdminFcmToken` writing to the wrong Mongo model (writes to `User` instead of `AdminUser` — admin push notifications silently never work)

---

## PHASE 8 — Frontend Polish, Dead Code, Push Notifications — 🔴 NOT STARTED

- [ ] Real device push notifications for customer + vendor — Firebase is already a dependency, `notificationUtils.js` just has it commented out; backend endpoints already exist and are simply never called
- [ ] Fix logout to call the real logout endpoint (today it only clears local state — server-side refresh token stays valid)
- [ ] Make Settings toggles (push/biometric) persist for real, or remove them
- [ ] Replace static mock maps (vendor `ProfilePage.jsx` location, customer `ExploreScreen.jsx` map view) with real Leaflet views — already a dependency, already used correctly in onboarding's `MapPicker.jsx`
- [ ] Remove dead files: `LoginScreen.jsx`, `VerifyOTPScreen.jsx`, `ScanPage.jsx`, `LogPurchasePage.jsx`
- [ ] Wire "Export CSV" on Referral Analytics; fix unpopulated `walletBalance`/`totalTransactions` fields in Users export
- [ ] Remove the fake "Welcome Bonus" record injected into `WalletPassbookScreen.jsx` when history is empty
- [ ] Remove the fabricated GST/PAN document previews on vendor `ProfilePage.jsx`

---

## PHASE 9 — Final Security Re-Audit + QA — 🔴 NOT STARTED

- [ ] Re-verify the original 5 Critical findings are actually closed (OTP bypass ✅ closed in Phase 1, vendor-consent gap ✅ closed in Phase 1, Razorpay amount trust ✅ closed in Phase 1, idempotency ✅ closed in Phase 1, referral farming — partially helped by Phase 1's OTP fix, fully closed once Phase 6 adds a real funding/abuse guard)
- [ ] Concurrency/load test at higher scale than the current unit tests
- [ ] Full manual end-to-end test of all three flows + withdrawal, both customer and vendor sides, once Phases 2–4 land

---

## What actually works end-to-end today (unchanged by any of this)

Vendor onboarding (draft/submit/approve/reject/resubmit with full audit trail), vendor/customer discovery & storefront (search, categories, products, media, promotions, reviews), chat, support tickets, referral code generation & linking, in-app notifications, scratch-card rewards (mechanically — funding question is Phase 6), and now — as of Phase 1 — the core wallet/cashback money movement is atomic and consent-gated.

## What's still fake, broken, or missing (unchanged until later phases)

QR scanning (both sides, fully simulated), the admin Cashback Rules engine (cosmetic only), any Zeebac revenue mechanism, GPS/limits on cashback requests, real bill-photo capture, Razorpay webhook + automated vendor settlement, push notifications for customer/vendor, and the various dead-code/cosmetic admin bugs listed in Phase 7–8.

---

## Business questions still blocking work (carried over from the audit, unchanged)

1. Zeebac's revenue model — Phase 6 blocker
2. Who funds referral/scratch-card rewards — Phase 6 blocker
3. What vendors get back for the cashback they give — informs Phase 6
4. Whether `CashbackRule` should actually govern rates — Phase 5 blocker
5. Actual limit numbers (min/max bill, caps, expiry) — Phase 5 blocker
6. GPS radius, daily/monthly request limits, ₹2,000+ rule — Phase 2 blocker
7. Automated vs. manual vendor bank settlement — Phase 4 blocker
8. Whether real third-party POS integration is needed at all — Phase 3 confirmation
