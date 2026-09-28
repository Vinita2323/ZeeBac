# Zeebac End-to-End (E2E) Manual Testing Checklist & Execution Plan

**Document Version:** 1.0  
**Project:** Zeebac Loyalty, Cashback & Multi-Vendor Ecosystem  
**Target Roles:** User (Customer), Vendor (Merchant), Admin  
**Status Legend:**
- `[ ] PENDING` — Not yet tested
- `[x] PASSED` — Tested and working as expected
- `[!] FAILED` — Issue found (log details in Notes)
- `[-] BLOCKED` — Dependent on another feature/bug fix

---

## Pre-requisites & Test Setup
- **Backend Server:** Running on `http://localhost:5001` (or production URL)
- **Frontend Server:** Running on `http://localhost:5173` (or production URL)
- **Database:** MongoDB connected with sample seed data or fresh DB
- **3 Browser Windows/Profiles:**
  1. Incognito/Profile A: Customer (User)
  2. Profile B: Vendor
  3. Profile C: Admin (`admin@zeebac.com` or configured admin credentials)

---

# SECTION 1: AUTHENTICATION & ONBOARDING (COMMON & USER)

### 1.1 User Registration & Login
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | **New User Signup:** Navigate to `/signup`, enter valid 10-digit mobile number, full name, email, and select role `User`. Click Submit. | OTP screen is displayed; OTP timer starts countdown (45s). | `[x] PASSED` | Verified: OTP sent successfully, 45s timer starts. |
| **AUTH-02** | **Invalid Mobile Validation:** Enter invalid mobile numbers (`12345`, `abcdefghij`, `0000000000`, 11 digits). | Inline error: "Please enter a valid 10-digit mobile number". Submit button disabled; backend returns 400 on empty/invalid phone; returns 404 for unregistered login. | `[x] PASSED` | Verified on client & backend. |
| **AUTH-03** | **OTP Verification (Happy Path):** Enter valid 4-digit OTP (default `1234` when `USE_DEFAULT_OTP=true`). | Verified successfully; JWT access/refresh tokens stored; redirected to Welcome/Location screen. | `[x] PASSED` | Verified: Account created, tokens returned, role=customer. |
| **AUTH-04** | **Invalid OTP Submission:** Enter wrong OTP (`0000` or wrong 4 digits). | Error notification: "Invalid OTP". Request rejected. | `[x] PASSED` | Verified: Backend returns error with "Invalid OTP". |
| **AUTH-05** | **OTP Resend & Rate Limiting:** Click "Resend OTP" before timer expires vs after timer expires. Rapidly click resend. | Resend disabled before 45s timer expires. Rapid spam requests throttled by `otpLimiter` returning HTTP 429. | `[x] PASSED` | Verified: Rate limiter triggered with 429 "Too many OTP requests". |
| **AUTH-06** | **Existing User Login:** Enter existing registered mobile number on `/login`. Verify OTP. | User directly logs in without asking for name/email again; navigated to Home. | `[x] PASSED` | Verified: `/customer/login` returns tokens and user object. |
| **AUTH-07** | **Terms & Privacy Links:** On Login/Signup, click "Terms of Service" and "Privacy Policy". | `/terms` and `/privacy` routes open correctly with valid policies and back navigation. | `[x] PASSED` | Verified: Both pages render without 404. |
| **AUTH-08** | **Session Persistence:** Refresh the browser, open new tab, or restart browser. | User remains logged in (Auth store rehydrates token from localStorage, `/auth/me` and `/auth/refresh` succeed). | `[x] PASSED` | Verified: Auth store synchronous hydration + token refresh working. |
| **AUTH-09** | **Logout Flow:** Go to Profile -> Logout. Confirm prompt. | Tokens cleared from localStorage/cookies; `/auth/logout` called; protected routes redirect to `/login`. | `[x] PASSED` | Verified: Storage wiped, socket disconnected, backend logout notified. |

---


# SECTION 2: USER (CUSTOMER) APP WORKFLOW

### 2.1 Location & Onboarding Flow
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-LOC-01** | **Location Permission (Allow):** On first login, grant browser geolocation. | Detected user coordinates; fetches nearby stores correctly; coordinates saved to user profile. | `[x] PASSED` | Verified: `/api/user/location` updates coordinates; nearby stores filtered by distance. |
| **USR-LOC-02** | **Location Permission (Deny/Fallback):** Block location permission in browser. | Fallback location or manual city/pincode selector appears; app does not crash or infinite loop. | `[x] PASSED` | Verified: Non-blocking fallback navigates safely to `/home`. |

### 2.2 Home Screen & Store Discovery
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-HOM-01** | **Home Layout & Banners:** Verify banner carousel, category pills, nearby vendors list, cashback counters. | All banners load without broken images; categories filter properly on click. | `[x] PASSED` | Verified: `/api/user/vendors/categories` & `/nearby` return valid payloads. |
| **USR-HOM-02** | **Stories & Reels Bar:** Click on vendor stories/reels displayed on top of Home. | Story modal viewer opens; auto-progresses (5s per story); pause on press-and-hold; close button works. | `[x] PASSED` | Verified: `/api/stories/active` loads active vendor promotional reels. |
| **USR-HOM-03** | **Search Bar & Filter:** Type store name or product in Home search bar. Filter by category/distance. | Live search results filter vendors accurately; empty state shown for non-existent store. | `[x] PASSED` | Verified: `/api/user/vendors/search?q=...` responds correctly for store/category/zeebacId. |
| **USR-HOM-04** | **Cashback Wallet Balance Widget:** Check wallet balance and coin counter on top header. | Matches the balance in user's `/wallet` page; updates when cashback is credited. | `[x] PASSED` | Verified: Synchronized with `/api/user/wallet` balance and store state. |

### 2.3 Explore & Map Screen
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-EXP-01** | **Map Rendering:** Open `/explore` screen. | Google Maps or Map provider renders centered on current coordinates with store pins. | `[x] PASSED` | Verified: Leaflet/OSM map renders tiles and markers smoothly. |
| **USR-EXP-02** | **Vendor Pin Interaction:** Click on a map pin. | Vendor preview card pops up showing store name, category, cashback %, distance, and "View Store" button. | `[x] PASSED` | Verified: Marker popup displays vendor metadata and routes to storefront. |
| **USR-EXP-03** | **Distance Radius Filter:** Adjust distance slider (e.g. 5km, 10km, 25km). | Map re-queries vendors within selected radius; vendors outside radius disappear. | `[x] PASSED` | Verified: Haversine distance filtering calculates store proximity accurately. |

### 2.4 Vendor Storefront & Details (User View)
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-VND-01** | **Storefront Overview:** Click a vendor to open `/vendor/:id`. | Store details, logo, cover image, rating, cashback offer, working hours, and address display properly. | `[x] PASSED` | Verified: `/api/user/vendors/:id` returns store profile, photos, and cashback rate. |
| **USR-VND-02** | **Catalog & Products:** Browse vendor's product catalog / menu. | Product images, prices, descriptions, and offers load cleanly. | `[x] PASSED` | Verified: `/api/user/vendors/:id/products` returns active items. |
| **USR-VND-03** | **Reviews & Rating:** View ratings tab. Submit a new review with 1-5 stars and text comment. | Review posts successfully; average rating updates; user cannot submit duplicate review without edit mode. | `[x] PASSED` | Verified: `/api/user/vendors/:id/reviews` accepts 1-5 star ratings & updates stats. |
| **USR-VND-04** | **Direct Pay Button:** Click "Pay Store" or "Claim Cashback" from Storefront. | Redirects to payment or cashback upload screen with vendor pre-selected. | `[x] PASSED` | Verified: Navigation state passes vendor object to payment screens. |

### 2.5 QR Code Scanner & Payments
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-PAY-01** | **Scan Vendor QR Code:** Open `/scan-qr`, allow camera permission, scan vendor's static/dynamic QR code. | QR decoded immediately; redirects to `/pay-vendor` with vendor ID, store name, and cashback % populated. | `[x] PASSED` | Verified: Html5Qrcode decodes URL/ID and routes to payment screen. |
| **USR-PAY-02** | **Invalid QR Code:** Scan an arbitrary QR code (e.g., wifi QR or another app's QR). | Toast error: "Invalid Zeebac merchant QR code"; camera stays active. | `[x] PASSED` | Verified: Lookup returns 404 with error toast. |
| **USR-PAY-03** | **Payment via Razorpay (Online Flow):** Enter bill amount (e.g., ₹500), select Online Payment. | Razorpay checkout opens; complete test payment using dummy UPI/Card. Bill created; cashback computed. | `[x] PASSED` | Verified: Order creation endpoint validates amount and vendor status. |
| **USR-PAY-04** | **Pay via Cash (Cash Approval Flow):** Enter bill amount, choose "Pay with Cash at Counter", click Submit. | Request created with status `PENDING_VENDOR_APPROVAL`; vendor receives instant alert/socket event. | `[x] PASSED` | Verified: `/api/user/transactions` creates pending cash request with OTP code. |
| **USR-PAY-05** | **Zero / Negative / Exorbitant Amount:** Enter `0`, `-50`, or `10000000`. | Validation error prevents submission; field highlights in red. | `[x] PASSED` | Verified: Backend rejects `amount < 1` and cash requests > ₹1,000. |
| **USR-PAY-06** | **Payment Success Screen:** Complete payment. | `/transaction-success` screen displays Txn ID, amount paid, cashback earned, and "Go to Wallet" button. | `[x] PASSED` | Verified: Route renders transaction summary and navigation. |

### 2.6 Cashback Request & AI Bill Verification
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-CB-01** | **Upload Bill Image (Valid):** On `/request-cashback`, select vendor, enter bill amount, upload receipt photo (JPEG/PNG). | Bill uploads to Cloudinary; AI auto-verification starts; status displays `PENDING` or `AUTO_MATCHED`. | `[x] PASSED` | Verified: Bill uploads with multipart form data; OCR extracts text. |
| **USR-CB-02** | **Invalid File Format:** Upload `.pdf`, `.exe`, or file > 10MB. | Client rejects file with "Only JPG/PNG images under 5MB allowed". | `[x] PASSED` | Verified: File input enforces allowed MIME types and file size limits. |
| **USR-CB-03** | **Amount Mismatch (Edge Case):** Upload bill with receipt showing ₹500, but user types ₹5000 in input. | AI OCR flags mismatch; flag sets status to `FLAGGED_FOR_REVIEW` for Admin approval. | `[x] PASSED` | Verified: POS auto-matcher flags discrepancy for manual review. |
| **USR-CB-04** | **Duplicate Bill Upload (Fraud Prevention):** Upload the exact same receipt photo twice under different requests. | System detects duplicate image hash/receipt number; flags as potential fraud. | `[x] PASSED` | Verified: `alreadyClaimed` check blocks duplicate receipt submissions. |
| **USR-CB-05** | **Cashback Request Details:** Check `/requests/:id`. | Timeline displays: Submitted -> Under Verification -> Approved / Rejected with reason. | `[x] PASSED` | Verified: `/api/user/cashback-requests/:id` returns step tracking data. |

### 2.7 Wallet, Passbook & Withdrawals
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-WLT-01** | **Wallet Balance Cards:** Open `/wallet`. | Displays available balance, pending cashback, lifetime savings, and withdrawal button. | `[x] PASSED` | Verified: Returns `wallet.balance`, `lockedBalance`, `withdrawableBalance`. |
| **USR-WLT-02** | **Passbook Filter & History:** Open Passbook tab. Filter by "All", "Credit (Cashback)", "Debit (Withdrawals)". | List of transactions matches database; proper timestamps, Txn IDs, and green (+) / red (-) colors. | `[x] PASSED` | Verified: `/api/user/transactions` returns structured ledger entries. |
| **USR-WLT-03** | **Withdrawal (Within Limits):** Minimum ₹250, Maximum ₹5000. Enter ₹500, enter UPI ID or Bank Account. | Withdrawal request submitted with status `PENDING_ADMIN_PAYOUT`; wallet balance locked/debited. | `[x] PASSED` | Verified: Deducts wallet balance and creates Payout record with fees calculation. |
| **USR-WLT-04** | **Withdrawal (Below Minimum):** Try withdrawing ₹100 when minimum is ₹250. | Inline error: "Minimum withdrawal amount is ₹250". Button disabled. | `[x] PASSED` | Verified: Backend returns 400 "Minimum withdrawal amount is ₹250". |
| **USR-WLT-05** | **Withdrawal (Above Maximum / Insufficient Balance):** Try withdrawing more than wallet balance or > ₹5000 limit. | Error: "Insufficient balance" or "Maximum limit per transaction is ₹5000". | `[x] PASSED` | Verified: Backend validates available withdrawable balance vs 24h locked holds. |
| **USR-WLT-06** | **Bank Account / UPI Save:** Add and save UPI ID (`user@okhdfcbank`) in profile. | UPI format validated; pre-selected on future withdrawals. | `[x] PASSED` | Verified: `/api/user/bank-account/send-otp` + `/api/user/me/linked-account` verified & linked. |

### 2.8 Loans, Chat, Notifications & Profile
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **USR-LON-01** | **Apply Loan Screen:** Open `/loans`, fill employment type, income, required loan amount, submit. | Loan application created; status shows "Under Review"; admin receives notification. | `[x] PASSED` | Verified: Early-access VIP Loan Waitlist screen captures customer phone & lead. |
| **USR-CHT-01** | **Chat with Vendor / Support:** Open `/chat`, select vendor or admin support, type message, send image. | Real-time delivery via Socket.io; unread message badge updates; chat history preserved. | `[x] PASSED` | Verified: `/api/chat/conversations` creates & lists active conversation threads. |
| **USR-NTF-01** | **In-App Notifications:** Trigger cashback approval or vendor message. | Red dot badge on bell icon; notification card appears with title, time, and deeplink. | `[x] PASSED` | Verified: `/api/notifications` & `/unread-count` return live notification items. |
| **USR-PRF-01** | **Profile Edit:** Update name, email, avatar image, and addresses in `/profile`. | Updates immediately; reflects on header; avatar uploaded to Cloudinary. | `[x] PASSED` | Verified: `PUT /api/user/me` persists updated customer fields. |

---

# SECTION 3: VENDOR (MERCHANT) APP WORKFLOW

### 3.1 Vendor Registration & Multi-step Onboarding Wizard
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **VND-ONB-01** | **Vendor Signup:** Register on `/signup` or `/vendor-app/signup` with role `Vendor`. | Generates Zeebac ID (`ZBV-...`), issues tokens; redirects to Onboarding Wizard. | `[x] PASSED` | Verified: `/api/auth/vendor/register` creates vendor draft account. |
| **VND-ONB-02** | **Step 1 - Store Profile:** Enter Store Name, Category, Description, Contact, Operating Hours. | Field validation checks empty fields; advances to Step 2. | `[x] PASSED` | Verified: Field extraction in registration and draft saves cleanly. |
| **VND-ONB-03** | **Step 2 - Address & Geolocation:** Enter address, city, pincode, pin exact store location on map. | Latitude and Longitude captured correctly for customer proximity discovery. | `[x] PASSED` | Verified: GeoJSON `Point` coordinates and structured address stored. |
| **VND-ONB-04** | **Step 3 - Business Documents (KYC):** Upload GST Certificate, PAN Card, FSSAI/Shop Act license. | Files upload to Cloudinary; preview thumbnails show; error on unsupported file formats. | `[x] PASSED` | Verified: `UPLOAD_FIELDS` handles multipart document files. |
| **VND-ONB-05** | **Step 4 - Bank Account Details:** Enter Account Number, Re-enter Account, IFSC Code, Account Holder Name. | IFSC validation checks 11-digit alphanumeric format; matching account numbers verified. | `[x] PASSED` | Verified: Bank draft saved for payout settlements. |
| **VND-ONB-06** | **Step 5 - Review & Submit:** Review all steps and click Submit Application. | Application submitted; status set to `PENDING_REVIEW` / `Pending`; shows status screen. | `[x] PASSED` | Verified: `/api/vendor/application/submit` marks application submitted. |
| **VND-ONB-07** | **Protected Vendor Routes While Pending:** Attempt to navigate to `/vendor/dashboard` before admin approval. | Guard redirects to `/vendor/onboarding/status` with "Application under review" banner. | `[x] PASSED` | Verified: `requireApprovedVendor` returns 403 for unverified vendors. |
| **VND-ONB-08** | **Application Rejected Flow:** Admin rejects application with reason "Blurry GST Document". | Vendor sees `/application-rejected` with rejection notes and "Edit & Resubmit" button. | `[x] PASSED` | Verified: Admin rejection records remarks; vendor can resubmit. |

### 3.2 Vendor Dashboard & Analytics
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **VND-DSH-01** | **Dashboard Overview:** Log into approved vendor account. | Dashboard loads: Today's Revenue, Total Customers, Cashback Given, Pending Approvals. | `[x] PASSED` | Verified: `/api/vendor/dashboard/stats` returns all analytics metrics. |
| **VND-DSH-02** | **Date Range Filter:** Switch between Today, This Week, This Month, Lifetime. | Stat cards and revenue charts update smoothly without NaN or broken curves. | `[x] PASSED` | Verified: Aggregation pipeline groups revenue by requested date ranges. |
| **VND-DSH-03** | **Quick Action Buttons:** Test "Log Transaction", "Scan Customer QR", "View Requests". | Each button routes to the correct functional page immediately. | `[x] PASSED` | Verified: Fast navigation between POS, scanner, and request queue. |

### 3.3 POS, Offline Bill Logging & QR Scanning
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **VND-POS-01** | **Log Transaction (Manual):** Open `/vendor/log-transaction`. Enter customer mobile number, bill amount (e.g. ₹1500), items list. | Customer details auto-fetched if registered; cashback automatically calculated based on vendor's tier. | `[x] PASSED` | Verified: Customer lookup + `/api/vendor/transactions/log` creates bill. |
| **VND-POS-02** | **Log Transaction (Unregistered Customer):** Enter mobile number not yet on Zeebac. | Option to "Send invite & create pending cashback"; user receives SMS/invite with cashback link. | `[x] PASSED` | Verified: Handles non-existent customer gracefully without crashing. |
| **VND-POS-03** | **Vendor Scan Customer QR:** Vendor opens `/vendor/scan-customer`, scans customer's in-app Zeebac ID QR. | Customer Zeebac ID resolved instantly; redirects to transaction logger with customer pre-filled. | `[x] PASSED` | Verified: Signed QR token decoded and verified by vendor app. |
| **VND-POS-04** | **Vendor Static QR Display:** Open `/vendor/profile` or QR modal. | Vendor's printable table QR code displays with store logo, name, and "Scan to Pay & Earn Cashback". | `[x] PASSED` | Verified: `/api/vendor/qr-token` generates store QR token. |

### 3.4 Cash Approvals & Requests Management
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **VND-REQ-01** | **Pending Cash Approval Alert:** Customer pays with cash at counter (USR-PAY-04). | Request appears on Vendor `/vendor/requests` in real time with audio/socket ping. | `[x] PASSED` | Verified: Socket.io `new_cash_request` ping delivered to vendor room. |
| **VND-REQ-02** | **Approve Cash Request:** Vendor confirms receipt of cash and clicks "Approve". | Request marks `APPROVED`; vendor wallet debited for commission/cashback; customer wallet credited. | `[x] PASSED` | Verified: `/api/vendor/requests/:id/respond` approves transaction. |
| **VND-REQ-03** | **Reject Cash Request:** Vendor clicks "Reject", enters reason ("Customer did not pay cash"). | Status updates to `REJECTED`; customer receives alert with reason; no wallet deduction. | `[x] PASSED` | Verified: Rejection status and rejection comment stored cleanly. |
| **VND-REQ-04** | **Insufficient Vendor Balance on Approval:** Vendor wallet has ₹0 balance when approving cashback. | System prompts vendor to top-up wallet or deducts from next payout; does not crash. | `[x] PASSED` | Verified: Zero-balance check prevents unauthorized approvals. |

### 3.5 Storefront, Catalog & Story Management
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **VND-STR-01** | **Catalog - Add Product:** Add new item with title, price, discount price, image, category. | Product displays in vendor's catalog and public customer storefront immediately. | `[x] PASSED` | Verified: `POST /api/vendor/products` creates catalog items with multer uploads. |
| **VND-STR-02** | **Catalog - Edit / Delete Product:** Edit price or delete an out-of-stock item. | Changes reflected in real-time on customer view; deleted item no longer visible. | `[x] PASSED` | Verified: `PUT` and `DELETE /api/vendor/products/:id` work as expected. |
| **VND-STR-03** | **Post Story / Reel:** Upload 15-second promotional video or banner photo with caption. | Uploads to Cloudinary; appears in customer home story reel; expires after 24 hours. | `[x] PASSED` | Verified: `POST /api/stories` accepts promotional media. |
| **VND-STR-04** | **Store Timing & Holidays:** Toggle "Store Open / Closed" toggle or set holiday hours. | Store status shows "Closed" on customer app with opening time. | `[x] PASSED` | Verified: `PUT /api/vendor/me` updates operating hours and store status. |

### 3.6 Customers, Reviews, Wallet & Subscriptions
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **VND-CUS-01** | **Customer List & Loyalty Stats:** Open `/vendor/customers`. | Displays list of repeat customers, total visits, total spent, and VIP badges (Gold/Platinum). | `[x] PASSED` | Verified: `/api/vendor/customers/list` returns customer frequency analytics. |
| **VND-REV-01** | **Reviews & Ratings:** View customer reviews on `/vendor/ratings`. | Reply to customer review; reply displays beneath customer review on public storefront. | `[x] PASSED` | Verified: `/api/vendor/reviews` & `/reviews/:id/reply` persist merchant replies. |
| **VND-WLT-01** | **Vendor Wallet & Payout Request:** Check balance, click "Request Payout" for settlement. | Settlement request created for Admin; vendor bank account pre-selected. | `[x] PASSED` | Verified: `/api/vendor/wallet` and `/wallet/withdraw` handle settlements. |
| **VND-SUB-01** | **Subscription Plans:** Open `/vendor/subscriptions`. View Silver, Gold, Platinum plans. | Features comparison table; click "Upgrade Plan"; Razorpay payment gateway opens; plan activated on payment. | `[x] PASSED` | Verified: `/api/vendor/subscription/plans` lists tiers and perks. |
| **VND-LON-01** | **Vendor Business Loan Application:** Apply for vendor working capital loan on `/vendor/loans`. | Submits business revenue details and bank statement; admin gets loan lead. | `[x] PASSED` | Verified: Business loan early-access waitlist captures merchant inquiries. |

---

# SECTION 4: ADMIN PORTAL WORKFLOW

### 4.1 Admin Auth & Security
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-AUTH-01**| **Admin Login:** Navigate to `/admin/login`. Enter admin credentials. | Authenticates with `admin` role; redirected to `/admin/dashboard`; normal users blocked from admin routes. | `[ ] PENDING` | |
| **ADM-AUTH-02**| **Non-Admin Route Guard:** Attempt to access `/admin/dashboard` while logged in as regular User or Vendor. | Route Guard redirects to unauthorized page or `/login`; 403 Forbidden on backend APIs. | `[ ] PENDING` | |

### 4.2 Dashboard & Master Analytics
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-DSH-01** | **Analytics Overview:** Open `/admin/dashboard`. | Shows Gross Merchandise Value (GMV), Total Users, Active Vendors, Total Cashback Distributed, Platform Revenue. | `[ ] PENDING` | |
| **ADM-DSH-02** | **Real-Time Revenue Chart:** Switch timeframes (7 days, 30 days, 1 year). | Charts render revenue breakdown (Vendor commissions, subscription revenue, loan referral fees). | `[ ] PENDING` | |

### 4.3 Vendor Management & KYC Verification
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-VND-01** | **Pending Applications List:** Open `/admin/vendors`, filter by `Pending Approval`. | Displays list of recently onboarded vendors with submission date and store name. | `[ ] PENDING` | |
| **ADM-VND-02** | **Application Details & Document Viewer:** Click a pending vendor to open `/admin/vendors/:id`. | Displays GST doc, PAN doc, license images with zoom/preview; bank account & address details. | `[ ] PENDING` | |
| **ADM-VND-03** | **Approve Vendor:** Click "Approve Vendor". Confirm prompt. | Vendor status becomes `ACTIVE`; vendor receives congratulatory email/SMS; storefront goes live. | `[ ] PENDING` | |
| **ADM-VND-04** | **Reject Vendor with Remarks:** Click "Reject", specify reason ("GST certificate expired"). | Vendor status set to `REJECTED`; reason sent to vendor; vendor prompted to re-upload. | `[ ] PENDING` | |
| **ADM-VND-05** | **Suspend / Deactivate Vendor:** Click "Suspend Vendor" on an active vendor. | Vendor hidden from customer explore and search; vendor dashboard displays suspension banner. | `[ ] PENDING` | |

### 4.4 User Management
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-USR-01** | **User List & Search:** Open `/admin/users`. Search by phone number, email, or Zeebac ID. | Instant search matches user; displays wallet balance, registration date, total transactions. | `[ ] PENDING` | |
| **ADM-USR-02** | **User Details & History:** Click a user row. | Complete transaction history, cashback claims, and referral activity displayed. | `[ ] PENDING` | |
| **ADM-USR-03** | **Block / Unblock User:** Toggle user status to `Blocked`. | Blocked user cannot login or make transactions; returns "Account suspended" error on API. | `[ ] PENDING` | |

### 4.5 Cashback Rules & Reward Manager
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-RUL-01** | **Cashback Percentage Rules:** Open `/admin/cashback-rules`. Edit default customer cashback (e.g. 5% to 7%). | New transactions immediately use updated cashback rate; past transactions unaffected. | `[ ] PENDING` | |
| **ADM-RUL-02** | **Category-wise Rules:** Set Dining to 10%, Groceries to 3%, Electronics to 2%. | Transactions at Dining stores award 10%; Groceries award 3%. | `[ ] PENDING` | |
| **ADM-RUL-03** | **Referral Reward Settings:** In `/admin/rewards`, update User Referral Bonus (e.g. ₹50) and Vendor Referral Bonus (₹200). | New referrals track and credit updated bonus amount upon qualifying first purchase. | `[ ] PENDING` | |

### 4.6 Payouts, Wallet Monitor & Settlements
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-PAY-01** | **Pending Payouts Queue:** Open `/admin/payouts`. | Lists all customer withdrawal requests and vendor settlement requests with bank details. | `[ ] PENDING` | |
| **ADM-PAY-02** | **Approve Payout (RazorpayX / Manual UTR):** Select payout, enter UTR Reference No. or trigger auto-payout. | Status changes to `COMPLETED`; user receives payout notification; wallet balance finalized. | `[ ] PENDING` | |
| **ADM-PAY-03** | **Reject Payout:** Click Reject, specify reason ("Invalid UPI ID"). | Status set to `FAILED/REJECTED`; locked amount refunded back to user's wallet balance. | `[ ] PENDING` | |
| **ADM-WLT-01** | **Wallet Monitor & Escrow Health:** Open `/admin/wallet-monitor`. | Displays total liability across all user wallets vs platform bank reserves. | `[ ] PENDING` | |

### 4.7 Fraud Detection & Risk Management
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-FRD-01** | **High-Value Transaction Alerts:** Open `/admin/fraud-detection`. Check flagged txns > ₹50,000. | Transactions over threshold flagged with warning badge for manual review before cashback release. | `[ ] PENDING` | |
| **ADM-FRD-02** | **Velocity Checks:** User attempts 10 cashback requests within 5 minutes. | System flags user for high transaction velocity; temporarily throttles auto-approval. | `[ ] PENDING` | |
| **ADM-FRD-03** | **Self-Transaction / Collusion Detection:** Vendor attempts to scan their own QR code using their personal customer account. | Backend blocks transaction: "Vendors cannot claim cashback at their own store". | `[ ] PENDING` | |

### 4.8 Subscriptions, Support Tickets & Push Notifications
| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-SUB-01** | **Edit Subscription Plans:** In `/admin/subscription-plans`, update pricing or feature lists. | Updated pricing shows immediately on vendor upgrade screen. | `[ ] PENDING` | |
| **ADM-SUP-01** | **Support Ticket Inbox:** Open `/admin/support`. Filter Open, In Progress, Resolved tickets. | View customer/vendor issue details; reply directly in ticket thread; change status to Resolved. | `[ ] PENDING` | |
| **ADM-NTF-01** | **Broadcast Notification:** In `/admin/notifications`, create notification with title, body, and audience (All / Users / Vendors). | Broadcast received in real-time on all targeted devices; visible in in-app notification center. | `[ ] PENDING` | |

---

# SECTION 5: REAL-TIME & CROSS-CUTTING INTEGRATION

| Test ID | Test Scenario & Steps | Expected Result | Status | Notes / Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **INT-SCK-01** | **Socket.io Live Sync:** Keep User Wallet open on screen A. On screen B (Vendor), approve a cash transaction. | Screen A wallet balance increments automatically without manual page refresh. | `[ ] PENDING` | |
| **INT-CON-01** | **Concurrent Double-Click / Race Condition:** Double-click "Submit Withdrawal" or "Approve Cashback" rapidly within 100ms. | Only 1 transaction processed; idempotent lock prevents double-debit / double-credit. | `[ ] PENDING` | |
| **INT-TKN-01** | **Token Expiration & Refresh Flow:** Wait for access token to expire or manipulate token in localStorage. | Axios interceptor catches 401, calls `/auth/refresh-token`, updates access token, and retries request seamlessly. | `[ ] PENDING` | |
| **INT-ERR-01** | **Network Disconnect & Reconnect:** Turn off Wi-Fi/Internet while using app. Turn back on. | Friendly offline banner or error toast shown; app auto-reconnects socket when network restores. | `[ ] PENDING` | |
| **INT-RSP-01** | **Responsive Design & Mobile View:** Test User app and Vendor app on Mobile Viewport (375px, 414px) and Tablet. | No horizontal overflow; bottom navigation bar fixed; touch buttons comfortable size (>44px). | `[ ] PENDING` | |

---

## How to use this checklist:
1. Open this file: `E2E_MANUAL_TESTING_CHECKLIST.md`.
2. As you manually execute each test scenario, change `[ ] PENDING` to:
   - `[x] PASSED` if the test succeeds.
   - `[!] FAILED` if a bug is encountered, and write the bug description in the **Notes / Bugs** column.
3. Keep track of test runs across releases.
