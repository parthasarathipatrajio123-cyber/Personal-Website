/* ==========================================================================
   LocalBiz OS — Dashboard
   KPI cards, revenue/expense chart, top products, recent transactions and
   low-stock list. Everything is computed from localStorage and re-renders
   whenever data or settings change.
   ========================================================================== */
LB.page(() => {
  const { $, $$, db, date, money, num, esc, sales } = LB;
  let chart = null;
  let range = 30;

  /** Percentage change between two numbers, or null when there is no baseline. */
  const change = (current, previous) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

  function deltaHTML(value, inverse = false) {
    if (value === null || !isFinite(value)) return '<span class="delta flat">—</span>';
    const good = inverse ? value <= 0 : value >= 0;
    const arrow = value >= 0 ? 'bi-arrow-up-short' : 'bi-arrow-down-short';
    return `<span class="delta ${Math.abs(value) < 0.5 ? 'flat' : good ? 'up' : 'down'}"><i class="bi ${arrow}"></i>${Math.abs(value).toFixed(1)}%</span>`;
  }

  function renderGreeting() {
    const s = LB.settings();
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = `${part}, ${s.ownerName.split(' ')[0]}`;
    $('#greetingSub').textContent = `Here's how ${s.businessName} is doing today.`;
  }

  function renderStats() {
    const today = date.today();
    const all = LB.summarize();
    const todays = LB.summarize(today, today);
    const last30 = LB.summarize(date.add(today, -29), today);
    const prev30 = LB.summarize(date.add(today, -59), date.add(today, -30));
    const allSales = db.all('sales');
    const unpaid = allSales.filter((s) => sales.due(s) > 0);
    const overdue = unpaid.filter((s) => sales.status(s) === 'Overdue');
    const pending = unpaid.reduce((n, s) => n + sales.due(s), 0);
    const products = db.all('products');
    const low = products.filter(LB.isLowStock);
    const out = products.filter((p) => Number(p.stock) <= 0);
    const margin = all.revenue > 0 ? (all.profit / all.revenue) * 100 : 0;

    const cards = [
      { label: "Today's Sales", value: money(todays.revenue, { round: true }), icon: 'bi-bag-check', tone: 'tone-accent', href: 'sales.html',
        foot: `<span>${num(todays.orders)} order${todays.orders === 1 ? '' : 's'} today</span>` },
      { label: 'Total Revenue', value: money(all.revenue, { round: true }), icon: 'bi-graph-up-arrow', tone: 'tone-success', href: 'reports.html',
        foot: `${deltaHTML(change(last30.revenue, prev30.revenue))}<span>30 days vs prior</span>` },
      { label: 'Total Expenses', value: money(all.expenses, { round: true }), icon: 'bi-wallet2', tone: 'tone-warning', href: 'expenses.html',
        foot: `${deltaHTML(change(last30.expenses, prev30.expenses), true)}<span>30 days vs prior</span>` },
      { label: 'Net Profit', value: money(all.profit, { round: true }), icon: 'bi-cash-stack', tone: all.profit >= 0 ? 'tone-info' : 'tone-danger', href: 'reports.html',
        foot: `<span>${margin.toFixed(1)}% net margin</span>` },
      { label: 'Pending Payments', value: money(pending, { round: true }), icon: 'bi-hourglass-split', tone: 'tone-danger', href: 'payments.html',
        foot: `<span>${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'} · ${overdue.length} overdue</span>` },
      { label: 'Low Stock Items', value: num(low.length), icon: 'bi-exclamation-triangle', tone: 'tone-warning', href: 'products.html?status=low',
        foot: `<span>${out.length} out of stock</span>` }
    ];

    LB.render($('#statCards'), cards.map((c, i) => `
      <div class="col-6 col-md-4 col-xxl-2">
        <a href="${c.href}" class="lb-card stat-card text-reset fade-up d${Math.min(i, 4)}">
          <div class="stat-top"><span class="stat-label">${c.label}</span><span class="stat-icon ${c.tone}"><i class="bi ${c.icon}"></i></span></div>
          <div class="stat-value">${c.value}</div>
          <div class="stat-foot">${c.foot}</div>
        </a>
      </div>`).join(''));
  }

  /** Daily revenue & expense series for the selected range. */
  function series(days) {
    const today = date.today();
    const labels = [];
    const revenue = [];
    const expenses = [];
    const byDaySales = {};
    const byDayExp = {};
    db.all('sales').forEach((s) => { byDaySales[s.date] = (byDaySales[s.date] || 0) + s.total; });
    db.all('expenses').forEach((e) => { byDayExp[e.date] = (byDayExp[e.date] || 0) + Number(e.amount); });
    for (let i = days - 1; i >= 0; i--) {
      const d = date.add(today, -i);
      labels.push(d);
      revenue.push(LB.round2(byDaySales[d] || 0));
      expenses.push(LB.round2(byDayExp[d] || 0));
    }
    return { labels, revenue, expenses };
  }

  function renderChart() {
    if (!window.Chart) {
      $('#chartSkeleton').replaceWith(Object.assign(document.createElement('p'), { className: 'text-muted small', textContent: 'Charts need an internet connection to load Chart.js.' }));
      return;
    }
    const data = series(range);
    const accent = LB.charts.css('--lb-accent') || '#5b5bd6';
    const totalRev = data.revenue.reduce((a, b) => a + b, 0);
    const totalExp = data.expenses.reduce((a, b) => a + b, 0);
    $('#chartSummary').textContent = `${money(totalRev, { round: true })} revenue · ${money(totalExp, { round: true })} expenses in the last ${range} days`;

    const config = {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Revenue', data: data.revenue, borderColor: accent, backgroundColor: (ctx) => LB.charts.gradient(ctx, accent), fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: accent },
          { label: 'Expenses', data: data.expenses, borderColor: '#94a3b8', borderDash: [5, 5], fill: false, tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#94a3b8' }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: range > 7 ? 8 : 7, callback(value) { return date.short(this.getLabelForValue(value)); } } },
          y: { beginAtZero: true, suggestedMax: Math.max(...data.revenue, ...data.expenses) > 0 ? undefined : 1000, border: { display: false }, grid: { color: LB.charts.css('--lb-border') }, ticks: { maxTicksLimit: 5, callback: LB.charts.moneyTick } }
        },
        plugins: {
          tooltip: { callbacks: { title: (items) => date.format(items[0].label, { weekday: 'short', day: 'numeric', month: 'short' }), label: (item) => ` ${item.dataset.label}: ${money(item.raw)}` } }
        }
      }
    };

    const skeleton = $('#chartSkeleton');
    if (skeleton) skeleton.remove();
    if (chart) chart.destroy();
    chart = new Chart($('#salesChart'), config);
  }

  function renderTopProducts() {
    const from = date.add(date.today(), -29);
    const totals = {};
    db.all('sales').filter((s) => s.date >= from).forEach((s) => {
      s.items.forEach((it) => {
        totals[it.productId] = totals[it.productId] || { name: it.name, revenue: 0, qty: 0 };
        totals[it.productId].revenue += it.qty * it.price;
        totals[it.productId].qty += it.qty;
      });
    });
    const top = Object.values(totals).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    if (!top.length) {
      LB.render($('#topProducts'), LB.emptyState({ icon: 'bi-trophy', title: 'No sales yet', text: 'Your best sellers will appear here.', compact: true }));
      return;
    }
    const max = top[0].revenue;
    LB.render($('#topProducts'), `<ul class="rank-list">${top.map((p, i) => `
      <li>
        <div class="rank-row"><span class="chip">#${i + 1}</span><span class="name">${esc(p.name)}</span><span class="val">${money(p.revenue, { round: true })}</span></div>
        <div class="d-flex align-items-center gap-2">
          <div class="progress flex-grow-1" role="progressbar" aria-label="${esc(p.name)} share" aria-valuenow="${Math.round((p.revenue / max) * 100)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${(p.revenue / max) * 100}%"></div></div>
          <span class="small text-muted">${num(p.qty)} sold</span>
        </div>
      </li>`).join('')}</ul>`);
  }

  function renderRecent() {
    const recent = db.all('sales').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 7);
    if (!recent.length) {
      LB.render($('#recentBody'), LB.emptyRow(5, { icon: 'bi-receipt', title: 'No transactions yet', text: 'Record your first sale to see it here.', action: '<a href="sales.html?action=new" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg"></i>New sale</a>' }));
      return;
    }
    LB.render($('#recentBody'), recent.map((s) => {
      const name = sales.customerName(s);
      return `<tr class="row-link" data-href="invoices.html?q=${encodeURIComponent(s.invoiceNo)}">
        <td><a class="inv-link" href="invoices.html?q=${encodeURIComponent(s.invoiceNo)}">${esc(s.invoiceNo)}</a></td>
        <td><div class="person-cell">${LB.avatar(name, 'avatar-sm')}<div><div class="cell-title">${esc(name)}</div><div class="cell-sub">${s.items.length} item${s.items.length === 1 ? '' : 's'}</div></div></div></td>
        <td class="text-nowrap">${date.relative(s.date)}</td>
        <td class="num fw-semibold text-body">${money(s.total)}</td>
        <td>${LB.badge(sales.status(s))}</td>
      </tr>`;
    }).join(''));
  }

  function renderLowStock() {
    const low = db.all('products').filter(LB.isLowStock).sort((a, b) => a.stock - b.stock);
    if (!low.length) {
      LB.render($('#lowStock'), LB.emptyState({ icon: 'bi-check2-circle', title: 'Stock looks healthy', text: 'No products are below their reorder level.', compact: true }));
      return;
    }
    LB.render($('#lowStock'), low.slice(0, 6).map((p) => {
      const meta = LB.PRODUCT_CATEGORIES[p.category] || LB.PRODUCT_CATEGORIES.Other;
      const pctLeft = Math.min(100, (Number(p.stock) / Math.max(1, Number(p.minStock))) * 100);
      const out = Number(p.stock) <= 0;
      return `<div class="stock-item">
        <span class="product-thumb ${meta.tone}"><i class="bi ${meta.icon}"></i></span>
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex justify-content-between gap-2">
            <span class="cell-title text-truncate">${esc(p.name)}</span>
            <span class="small fw-semibold ${out ? 'text-danger' : 'text-warning'} text-nowrap">${out ? 'Out of stock' : `${p.stock} left`}</span>
          </div>
          <div class="progress stock-meter" role="progressbar" aria-label="Stock level" aria-valuenow="${Math.round(pctLeft)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar ${out ? 'bg-danger' : 'bg-warning'}" style="width:${Math.max(pctLeft, 4)}%"></div></div>
          <div class="cell-sub mt-1">Reorder level ${p.minStock} · SKU ${esc(p.sku)}</div>
        </div>
        <a href="products.html?edit=${encodeURIComponent(p.id)}" class="btn btn-sm btn-light" data-bs-toggle="tooltip" title="Update stock for ${esc(p.name)}" aria-label="Restock ${esc(p.name)}"><i class="bi bi-plus-lg"></i></a>
      </div>`;
    }).join('') + (low.length > 6 ? `<a href="products.html?status=low" class="d-block text-center small fw-semibold mt-3">View all ${low.length} items</a>` : ''));
  }

  function renderAll() {
    renderGreeting();
    renderStats();
    renderTopProducts();
    renderRecent();
    renderLowStock();
    renderChart();
  }

  // Range toggle
  $$('[data-range]').forEach((btn) => btn.addEventListener('click', () => {
    $$('[data-range]').forEach((b) => b.classList.toggle('active', b === btn));
    range = Number(btn.dataset.range);
    renderChart();
  }));

  // Whole-row click on recent transactions
  $('#recentBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a')) window.location.href = row.dataset.href;
  });

  document.addEventListener('lb:data', LB.debounce(renderAll, 50));
  document.addEventListener('lb:settings', () => { LB.charts.applyDefaults(); renderAll(); });
  document.addEventListener('lb:layout', () => setTimeout(() => chart && chart.resize(), 260));

  // Brief skeleton state so the first paint feels intentional rather than jumpy.
  setTimeout(renderAll, 280);
});
