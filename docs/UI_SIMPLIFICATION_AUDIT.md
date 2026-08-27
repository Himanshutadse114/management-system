# UI Simplification Audit

## Goal

Make Outlet Management easy for hotel, restaurant, bar and wine-shop teams who may not be technical, without removing or changing any business feature, permission, API, calculation or workflow.

## Audit findings

### 1. The interface uses internal/ERP language
The product frequently uses terms such as `operating scope`, `live role enforcement`, `reconciliation`, `settlement queue`, `operating P&L`, `inventory base`, `catalogue`, `workbench`, and `tenant control`.

These terms are technically correct but create unnecessary training for day-to-day staff.

**Rule:** use the language of the job.

Examples:
- Table Service -> Take Orders
- Settlement Queue -> Bills to Collect
- Catalogue -> Items
- Inventory -> Stock
- Analytics -> Sales & Profit
- Restaurant Management -> Restaurant
- Branch Overview -> Home
- Create Tenant -> Add Business

### 2. Too many concepts appear on one screen
Waiter, cashier and manager screens show several information groups at the same time. The user must understand the whole system before knowing what to do next.

**Rule:** arrange each workspace around the next action.

Waiter:
1. Choose table
2. Add items
3. Place order
4. Mark served
5. Send bill to cashier

Cashier:
1. Bills to collect
2. New counter sale
3. Collect payment
4. Recent payments

Manager:
1. Today
2. Orders
3. Tables
4. Menu
5. Stock
6. Sales & Profit
7. Reports

### 3. The visual language is too dense
Many screens use tiny uppercase labels, several card styles, gradients, low-contrast dark surfaces and large numbers of micro-controls.

**Rule:** one flat visual system.

- Font: Inter
- Primary red: `#C8102E`
- Black: `#111111`
- White: `#FFFFFF`
- Light background: `#F6F6F6`
- Border: `#E2E2E2`
- No gradients
- Very limited shadow
- Minimum 44px touch targets
- Body text normally 13-15px
- Avoid labels below 10px

### 4. Role separation is correct but the UI still feels like one large platform
The backend now correctly enforces waiter, cashier, inventory, manager, auditor, tenant-admin and super-admin boundaries, but some screens still use platform-oriented language.

**Rule:** each role should feel like its own simple app.

- Waiter sees tables, items and own orders.
- Cashier sees bills, counter sale and own receipts.
- Inventory Manager sees stock work only.
- Branch Manager sees only assigned branch operations.
- Auditor sees Sales & Profit and Reports only.
- Tenant Admin sees the full business and all branches.
- Super Admin sees businesses and platform access only.

### 5. Mobile responsiveness needs to be designed, not only scaled
Existing breakpoints prevent major overflow, but some screens still feel like compressed desktop pages.

**Rule:** mobile uses the job flow first.

- Single-column forms.
- Bottom navigation for frequent role actions.
- Cards instead of wide tables where practical.
- Horizontal scrolling only for true data tables.
- Sticky cart/order panels become normal flow on mobile.
- Large table/order buttons for waiter use.
- Safe-area padding for phones.

## Feature-preservation rule

The redesign must not change:

- Google authentication
- Role permissions
- Tenant and branch access
- Inventory ledger
- ML/bottle stock calculation
- Purchases
- Wastage and adjustments
- Counter sales
- Restaurant order state machine
- Waiter-to-cashier flow
- Payment methods
- QR menu
- Staff assignment
- Expenses
- Analytics calculations
- PDF/XLSX reports
- English/Hindi/Marathi support
- Demo data

Only wording, layout, hierarchy, styling and interaction presentation are being simplified.
