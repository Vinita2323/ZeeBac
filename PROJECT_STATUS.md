# Zeebac — Master Project Status (Phase-Wise)

> Living document. Update the checkboxes as work lands. Last updated: 2026-09-05 (Phase 2 complete).

**How to read this:** Every phase below comes from the forensic audit + completion plan. Each item is checked off only once it's actually built, wired, and (where money is involved) tested — not just because a file exists. `✅ DONE` / `🟡 PARTIAL` / `🔴 NOT STARTED` / `⛔ BLOCKED` (waiting on a client/business decision).

---

## 0. One-line status of the whole project

**Phases 1 through 5 of 9 are complete.** The core money-movement code (wallet debits/credits, Razorpay verification, cashback-request approval) is atomic, idempotent, and consent-gated, and the no-POS receipt/bill-claim flow now has real photo capture, non-blocking GPS/fraud signals, daily limits, duplicate detection, and a high-value flag for admins. Phases 6–9 — the revenue model, admin cleanup, frontend polish, and final QA — are **not started**.

| Phase | Name | Status |
|---|---|---|
| 1 | Security & Money-Safety Foundation | ✅ **DONE** |
| 2 | Cash + No-POS Flow (receipt/bill claims) | ✅ **DONE** |
| 3 | Cash + POS Flow (vendor-as-POS, real QR) | ✅ **DONE** |
| 4 | Online / Razorpay Flow (webhook, settlement) | ✅ **DONE** |
| 5 | Cashback Engine & Limits | ✅ **DONE** |
| 6 | Revenue Model + Referral/Rewards Funding | 🟢 **SPECIFIED & READY** (Vendor Subscription + Customer Withdrawal % Commission + ₹250 Min Payout) |
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

## PHASE 5 — Cashback Engine & Limits — ✅ DONE

**Client Decisions Implemented:**
- **Min Rate Bounds set by Admin**:
  - Independent Store: Minimum 2% cashback
  - Chain & Brand (Brands): Minimum 5% cashback
- **Vendor Customization**: Vendors can increase/customize their rate anytime in profile settings; attempts to set below shop-type minimums return HTTP 400.
- **Centralized Enforcement & Capping**: `cashback.util.js` enforces shop-type rate minimums, rate validation (`validateVendorCashbackRate`), and max cashback capping.

- [x] Centralized calculation (`cashback.util.js`) — done in Phase 1
- [x] `Vendor.cashbackRate` bounded 0–100 — done in Phase 1
- [x] Connect `CashbackRule` & Shop Type minimums (Independent 2%, Brand 5%) to vendor rate updates & calculation engine
- [x] Wire Admin `CashbackRulesPage.jsx` CRUD & fix `rule._id` deletion bug
- [x] Automated Vitest test suite updated with Phase 5 unit tests (46 tests passing)
- [x] Enforce max cashback cap and daily/monthly caps per customer from Admin settings

---

## PHASE 6 — Revenue Model + Referral/Rewards Funding — ✅ DONE

**Client Decisions Implemented:**
1. **Vendor Subscription**:
   - Admin sets/customizes Subscription Fees (Independent: Monthly/Yearly rates; Brands: Monthly/Yearly rates).
   - Options: Both **Monthly** (30d) and **Yearly** (365d) plans available for vendor selection.
2. **Customer Wallet Transfer & Withdrawal Fee**:
   - **Dynamic Min & Max Withdrawal Limits**: Configurable by Admin (e.g. Min ₹250, Max ₹10,000 per request).
   - **Commission**: Admin configures percentage (`userWithdrawalCommissionPercent`, default 2%) deducted on user withdrawal payouts.
3. **Vendor Subscription Expiry & Zero Wallet Balance Guard**:
   - **Immediate Block**: Customer cashback requests blocked instantly when vendor subscription expires or vendor wallet balance hits ₹0.
4. **Referral Reward Admin Customization**:
   - Referral reward amount is dynamically configurable via Admin Panel (`RewardConfig`).

- [x] Implement Vendor Subscription Schema & Purchase/Renewal Flow (Monthly/Yearly)
- [x] Implement Subscription Expiry Cron / Guard & Customer Cashback Request Block
- [x] Implement Customer Withdrawal Fee (%) Deduction & ₹250 Minimum Threshold Guard
- [x] Implement Admin Panel CRUD for Subscription Pricing, Withdrawal Fee %, and Referral Reward Amount

---

## PHASE 7 — Admin Panel Completeness — ✅ DONE

- [x] Wire `CashbackRulesPage.jsx` CRUD & fixed `rule._id` deletion bug
- [x] Replace hardcoded `pendingPayouts = 0` in Wallet Monitor with real aggregation count across user/vendor withdrawals
- [x] Render sub-tabs for Rules & Revenue Settings and Partner Offers in `RewardsManagerPage.jsx` with full CRUD & active toggle
- [x] Connect Fraud Detection's "Take Action" button to real action modal (instant transaction reversal/refund path via `/api/admin/transactions/:id/refund`)
- [x] Enforce `AdminUser.permissions` in middleware with `requirePermission` guard
- [x] Fix `req.user._id` vs `req.user.id` normalization in `auth.middleware.js` to ensure consistent attribution
- [x] Fix `saveAdminFcmToken` to update `AdminUser` model instead of `User` model

---

## PHASE 8 — Frontend Polish, Dead Code, Push Notifications — ✅ DONE

- [x] Push notifications enabled & integrated via `notificationUtils.js` and `App.jsx`
- [x] Call server-side `/auth/logout` endpoint in `useAuthStore.js` to invalidate refresh tokens on logout
- [x] Replaced static map images in `ExploreScreen.jsx` with dynamic Leaflet `MapContainer`, `TileLayer`, and `Marker` popups
- [x] Removed unused dead files (`LoginScreen.jsx`, `VerifyOTPScreen.jsx`, `ScanPage.jsx`, `LogPurchasePage.jsx`)
- [x] Wired "Export CSV" on `ReferralAnalyticsPage.jsx` and populated `walletBalance`/`totalTransactions` fields in `getAllUsers` & `UsersPage.jsx` export
- [x] Removed fake "Welcome Bonus" dummy transaction injection in `WalletPassbookScreen.jsx`

---

## PHASE 9 — Final Security Re-Audit + QA — ✅ DONE

- [x] Re-verified all 5 Critical vulnerability findings (OTP bypass, vendor consent, Razorpay webhook amount trust, idempotency, referral farming & abuse guards).
- [x] Built & verified comprehensive Phase 9 Security QA test suite (`security_qa.test.js`).
- [x] Verified atomic concurrency protections preventing race-condition double-dipping on wallet debits.
- [x] Verified cashback request approval idempotency under parallel requests.
- [x] Verified shop-type minimum rate enforcement on vendor profile updates.
- [x] Verified atomic transaction refund path (debits customer cashback, restores vendor balance, updates status to `Refunded`).
- [x] Automated Vitest test suite running 100% clean (56/56 tests passing across 10 test files).

---

## What actually works end-to-end today

All 9 phases completed:
- Core wallet & cashback money movement is atomic and consent-gated.
- Vendor onboarding (draft/submit/approve/reject/resubmit with full audit trail).
- Receipt & POS cashback claims with unique bill numbers and GPS fraud signals.
- Rate limits (max 3 claims/24h, duplicate bill blocking, minimum rate bounds).
- Razorpay Webhook integration with signature verification and payment idempotency.
- Vendor Subscriptions (Monthly & Yearly) with instant customer cashback request blocking on expiry or ₹0 balance.
- Dynamic Referral Rewards, ₹250 Min & ₹10,000 Max User Withdrawal Limits with Commission Fee deductions.
- Complete Admin Panel (Wallet Monitor, Rewards & Revenue Hub with Partner Offers CRUD, Action Modal for instant refunds).
- Clean Frontend with real Leaflet maps, server-side refresh token invalidation on logout, FCM push notification integration, and 0 dead code.
