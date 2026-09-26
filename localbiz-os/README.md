# LocalBiz OS

**Local Business Operating System** is a front-end demo of a SaaS app for small shops: sales, inventory, customers, invoices, expenses, payments and reports.

Built with **HTML5, CSS3, Bootstrap 5, Bootstrap Icons, Chart.js and vanilla JavaScript**. There is no backend. All data is demo data saved in your browser's `localStorage`.

## Run it

Open `index.html` in a browser. There is nothing to install or build. You need an internet connection because Bootstrap, the icons, Chart.js and the Inter font load from CDNs.

- **Quick look:** Login → **Continue with demo account**
- **Your own workspace:** Get Started → register. Sample data is added so every screen has content.
- **Reset:** Settings → Data → *Restore sample data*, or *Clear all* to see the empty states.

## Structure

```
localbiz-os/
├── index.html          Marketing site
├── login.html          Demo login (validation, remember me, demo account)
├── register.html       Registration (strength meter, validation, terms)
├── dashboard.html      KPIs, sales chart, recent transactions, low stock, quick actions
├── sales.html          Sales list, filters, new-sale modal with live totals
├── products.html       Inventory CRUD, search, filter, sort, low-stock warnings
├── customers.html      Customer CRUD, profile panel with purchase history
├── invoices.html       Multi-line invoice builder, view / print / download
├── expenses.html       Expense CRUD, filters, category breakdown
├── payments.html       Dues by status, record full or partial payments
├── reports.html        Date-range analytics, charts, CSV export
├── settings.html       Business profile, theme, currency, notifications, account, data
├── css/style.css       Design system + all components (light & dark)
├── js/main.js          Core: storage, demo data, calculations, UI helpers, app shell
├── js/<page>.js        One script per page
└── assets/             Logo and background pattern
```

## How it works

- `js/main.js` loads first on every page. It exposes one `LB` namespace and injects the sidebar and topbar into every app page, so navigation markup is not duplicated.
- One `sales` collection powers Sales, Invoices and Payments. Saving a sale reduces stock. Deleting a sale restores stock and removes its payments. Status (Paid / Partial / Pending / Overdue) is worked out from the paid amount and the due date.
- Every write fires an `lb:data` event, so the dashboard numbers, sidebar badges and notifications update straight away.
- Authentication is demo-only: passwords are validated but never stored.

All names, figures, testimonials and prices are fictional or illustrative.
