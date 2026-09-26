/* ==========================================================================
   LocalBiz OS — Reports
   Date-range analytics: KPIs, profit equation, revenue by day/week/month,
   expense breakdown, product and customer performance, CSV export.
   ========================================================================== */
LB.page(() => {
  const { $, $$, db, date, money, num, esc, sales } = LB;
  const state = { range: '30', from: '', to: '', group: 'day' };
  const chartRefs = {};

  /** Resolve the selected range into from/to ISO dates. */
  function resolveRange() {
    const today = date.today();
    switch (state.range) {
      case 'month': return { from: date.startOfMonth(today), to: today, label: 'This month' };
      case 'lastmonth': {
        const end = date.add(date.startOfMonth(today), -1);
        return { from: date.startOfMonth(end), to: end, label: 'Last month' };
      }
      case 'all': {
        const dates = db.all('sales').map((s) => s.date).concat(db.all('expenses').map((e) => e.date)).sort();
        return { from: dates[0] || today, to: today, label: 'All time' };
      }
      case 'custom': return { from: state.from, to: state.to, label: 'Custom range' };
      default: return { from: date.add(today, -(Number(state.range) - 1)), to: today, label: `Last ${state.range} days` };
    }
  }

  /** Aggregate everything the page needs for one range. */
  function compute() {
    const { from, to, label } = resolveRange();
    const summary = LB.summarize(from, to);
    const days = date.diff(to, from) + 1;
    const prev = LB.summarize(date.add(from, -days), date.add(from, -1));

    const products = {};
    db.all('products').forEach((p) => { products[p.id] = { name: p.name, qty: 0, revenue: 0, stock: p.stock }; });
    const customers = {};
    summary.sales.forEach((s) => {
      s.items.forEach((it) => {
        const row = products[it.productId] || (products[it.productId] = { name: it.name, qty: 0, revenue: 0, stock: 0, removed: true });
        row.qty += it.qty;
        row.revenue += it.qty * it.price;
      });
      const c = customers[s.customerId] || (customers[s.customerId] = { name: sales.customerName(s), orders: 0, spent: 0 });
      c.orders += 1;
      c.spent += s.total;
    });

    const expenseByCat = {};
    summary.expenseList.forEach((e) => { expenseByCat[e.category] = (expenseByCat[e.category] || 0) + Number(e.amount); });

    return {
      from, to, label, days, summary, prev,
      productRows: Object.values(products),
      customerRows: Object.values(customers).sort((a, b) => b.spent - a.spent),
      expenseByCat: Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]),
      newCustomers: db.all('customers').filter((c) => date.inRange(c.createdAt, from, to)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  }

  const change = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
  function delta(value, inverse) {
    if (value === null) return '<span class="delta flat">new</span>';
    const good = inverse ? value <= 0 : value >= 0;
    return `<span class="delta ${Math.abs(value) < 0.5 ? 'flat' : good ? 'up' : 'down'}"><i class="bi ${value >= 0 ? 'bi-arrow-up-short' : 'bi-arrow-down-short'}"></i>${Math.abs(value).toFixed(1)}%</span>`;
  }

  function renderKpis(d) {
    const s = d.summary;
    const p = d.prev;
    const aov = s.orders ? s.revenue / s.orders : 0;
    const prevAov = p.orders ? p.revenue / p.orders : 0;
    const cards = [
      ['Revenue', money(s.revenue, { round: true }), delta(change(s.revenue, p.revenue)), 'bi-graph-up-arrow', 'tone-accent'],
      ['Expenses', money(s.expenses, { round: true }), delta(change(s.expenses, p.expenses), true), 'bi-wallet2', 'tone-warning'],
      ['Net profit', money(s.profit, { round: true }), delta(change(s.profit, p.profit)), 'bi-cash-stack', s.profit >= 0 ? 'tone-success' : 'tone-danger'],
      ['Orders', num(s.orders), delta(change(s.orders, p.orders)), 'bi-bag-check', 'tone-info'],
      ['Avg. order value', money(aov, { round: true }), delta(change(aov, prevAov)), 'bi-calculator', 'tone-neutral'],
      ['Collected', money(s.collected, { round: true }), `<span>${s.revenue ? ((s.collected / s.revenue) * 100).toFixed(0) : 0}% of billed</span>`, 'bi-check2-circle', 'tone-success']
    ];
    $('#kpis').innerHTML = cards.map(([label, value, foot, icon, tone]) => `
      <div class="col-6 col-md-4 col-xxl-2"><div class="lb-card stat-card">
        <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span></div>
        <div class="stat-value">${value}</div>
        <div class="stat-foot">${foot}<span>vs previous ${d.days} days</span></div>
      </div></div>`).join('');
    // "Collected" has no comparison.
    const last = $('#kpis .col-6:last-child .stat-foot span:last-child');
    if (last) last.remove();
  }

  function renderEquation(d) {
    const s = d.summary;
    const margin = s.revenue ? (s.profit / s.revenue) * 100 : 0;
    $('#equation').innerHTML = `
      <div class="eq-box"><div class="label"><i class="bi bi-graph-up-arrow me-1"></i>Revenue</div><div class="value">${money(s.revenue)}</div><div class="cell-sub">${num(s.orders)} orders</div></div>
      <div class="eq-op" aria-hidden="true">−</div>
      <div class="eq-box"><div class="label"><i class="bi bi-wallet2 me-1"></i>Expenses</div><div class="value">${money(s.expenses)}</div><div class="cell-sub">${num(s.expenseList.length)} entries</div></div>
      <div class="eq-op" aria-hidden="true">=</div>
      <div class="eq-box result ${s.profit < 0 ? 'negative' : ''}"><div class="label"><i class="bi bi-cash-stack me-1"></i>Net profit</div><div class="value">${money(s.profit)}</div><div class="cell-sub">${s.profit < 0 ? 'Loss for this period' : 'Profit for this period'}</div></div>`;
    $('#marginChip').innerHTML = `<i class="bi bi-percent"></i> ${margin.toFixed(1)}% net margin`;
  }

  /* ---------- Charts ---------- */
  function draw(id, config) {
    if (!window.Chart) return;
    if (chartRefs[id]) chartRefs[id].destroy();
    chartRefs[id] = new Chart($(`#${id}`), config);
  }

  /** Bucket key for a date according to the grouping. Weeks start on Monday. */
  function bucket(iso) {
    if (state.group === 'month') return iso.slice(0, 7);
    if (state.group === 'week') {
      const d = date.parse(iso);
      const offset = (d.getDay() + 6) % 7;
      return date.add(iso, -offset);
    }
    return iso;
  }

  function bucketLabel(key) {
    if (state.group === 'month') return date.format(`${key}-01`, { month: 'short', year: 'numeric' });
    if (state.group === 'week') return `Wk of ${date.short(key)}`;
    return date.short(key);
  }

  function renderRevenueChart(d) {
    const keys = [];
    for (let iso = d.from; iso <= d.to; iso = date.add(iso, 1)) {
      const k = bucket(iso);
      if (!keys.includes(k)) keys.push(k);
    }
    const rev = Object.fromEntries(keys.map((k) => [k, 0]));
    const exp = Object.fromEntries(keys.map((k) => [k, 0]));
    d.summary.sales.forEach((s) => { rev[bucket(s.date)] += s.total; });
    d.summary.expenseList.forEach((e) => { exp[bucket(e.date)] += Number(e.amount); });
    const accent = LB.charts.css('--lb-accent');
    const names = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
    const avg = keys.length ? d.summary.revenue / keys.length : 0;
    $('#revenueSub').textContent = `${names[state.group]} revenue · average ${money(avg, { round: true })} per ${state.group}`;

    draw('revenueChart', {
      type: 'bar',
      data: {
        labels: keys.map(bucketLabel),
        datasets: [
          { label: 'Revenue', data: keys.map((k) => LB.round2(rev[k])), backgroundColor: accent, borderRadius: 6, maxBarThickness: 36 },
          { label: 'Expenses', data: keys.map((k) => LB.round2(exp[k])), backgroundColor: LB.charts.alpha('#94a3b8', 0.55), borderRadius: 6, maxBarThickness: 36 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
          tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}: ${money(item.raw)}` } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 12, maxRotation: 0 } },
          y: { beginAtZero: true, suggestedMax: d.summary.revenue + d.summary.expenses > 0 ? undefined : 1000, border: { display: false }, grid: { color: LB.charts.css('--lb-border') }, ticks: { maxTicksLimit: 5, callback: LB.charts.moneyTick } }
        }
      }
    });
  }

  function renderExpenses(d) {
    const rows = d.expenseByCat;
    const total = rows.reduce((n, [, v]) => n + v, 0);
    if (!rows.length) {
      if (chartRefs.expenseChart) { chartRefs.expenseChart.destroy(); delete chartRefs.expenseChart; }
      $('#expenseLegend').innerHTML = `<li>${LB.emptyState({ icon: 'bi-pie-chart', title: 'No expenses', text: 'Nothing was spent in this period.', compact: true })}</li>`;
      return;
    }
    const colors = rows.map(([cat]) => (LB.EXPENSE_CATEGORIES[cat] || LB.EXPENSE_CATEGORIES.Other).color);
    draw('expenseChart', {
      type: 'doughnut',
      data: { labels: rows.map(([c]) => c), datasets: [{ data: rows.map(([, v]) => LB.round2(v)), backgroundColor: colors, borderColor: LB.charts.css('--lb-surface'), borderWidth: 3, hoverOffset: 6 }] },
      options: { cutout: '70%', plugins: { tooltip: { callbacks: { label: (item) => ` ${item.label}: ${money(item.raw)} (${((item.raw / total) * 100).toFixed(1)}%)` } } } }
    });
    $('#expenseLegend').innerHTML = rows.map(([cat, v], i) => `<li><span class="swatch" style="background:${colors[i]}"></span>${esc(cat)}<span class="val">${money(v, { round: true })}</span><span class="pct">${((v / total) * 100).toFixed(1)}%</span></li>`).join('');
  }

  function renderProducts(d) {
    const best = d.productRows.filter((p) => p.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
    const palette = LB.charts.palette;
    if (best.length) {
      draw('productChart', {
        type: 'bar',
        data: { labels: best.map((p) => p.name), datasets: [{ label: 'Revenue', data: best.map((p) => LB.round2(p.revenue)), backgroundColor: best.map((_, i) => LB.charts.alpha(palette[0], 1 - i * 0.12)), borderRadius: 6, maxBarThickness: 26 }] },
        options: {
          indexAxis: 'y',
          plugins: { tooltip: { callbacks: { label: (item) => ` ${money(item.raw)} · ${num(best[item.dataIndex].qty)} units` } } },
          scales: {
            x: { beginAtZero: true, border: { display: false }, grid: { color: LB.charts.css('--lb-border') }, ticks: { maxTicksLimit: 5, callback: LB.charts.moneyTick } },
            y: { grid: { display: false }, border: { display: false }, ticks: { callback(value) { const l = this.getLabelForValue(value); return l.length > 22 ? `${l.slice(0, 21)}…` : l; } } }
          }
        }
      });
    } else if (chartRefs.productChart) { chartRefs.productChart.destroy(); delete chartRefs.productChart; }

    const low = d.productRows.filter((p) => !p.removed).sort((a, b) => a.qty - b.qty || a.revenue - b.revenue).slice(0, 5);
    $('#lowProducts').innerHTML = low.length ? low.map((p) => `<tr>
        <td><span class="cell-title">${esc(p.name)}</span>${p.qty === 0 ? '<div class="cell-sub text-danger">No sales in this period</div>' : ''}</td>
        <td class="num">${num(p.qty)}</td>
        <td class="num">${money(p.revenue, { round: true })}</td>
        <td class="num">${num(p.stock)}</td>
      </tr>`).join('') : LB.emptyRow(4, { icon: 'bi-box', title: 'No products', compact: true });
  }

  function renderCustomers(d) {
    const top = d.customerRows.slice(0, 6);
    const total = d.summary.revenue;
    $('#topCustomers').innerHTML = top.length ? top.map((c, i) => `<tr>
        <td><span class="chip">${i + 1}</span></td>
        <td><div class="person-cell">${LB.avatar(c.name, 'avatar-sm')}<span class="cell-title">${esc(c.name)}</span></div></td>
        <td class="num">${num(c.orders)}</td>
        <td class="num fw-semibold text-body">${money(c.spent, { round: true })}</td>
        <td class="num">${total ? ((c.spent / total) * 100).toFixed(1) : 0}%</td>
      </tr>`).join('') : LB.emptyRow(5, { icon: 'bi-people', title: 'No customer sales', text: 'No sales were recorded in this period.', compact: true });

    const salesList = db.all('sales');
    $('#newCustomersSub').textContent = `${d.newCustomers.length} added in this period`;
    $('#newCustomers').innerHTML = d.newCustomers.length ? d.newCustomers.slice(0, 6).map((c) => {
      const theirs = salesList.filter((s) => s.customerId === c.id);
      const spent = theirs.reduce((n, s) => n + s.total, 0);
      return `<div class="history-item">
        <div class="d-flex align-items-center gap-3 min-w-0">${LB.avatar(c.name)}
          <div class="min-w-0"><div class="cell-title text-truncate">${esc(c.name)}</div><div class="cell-sub">Joined ${date.format(c.createdAt)}</div></div></div>
        <div class="text-end"><div class="fw-semibold">${money(spent, { round: true })}</div><div class="cell-sub">${theirs.length} order${theirs.length === 1 ? '' : 's'}</div></div>
      </div>`;
    }).join('') : LB.emptyState({ icon: 'bi-person-plus', title: 'No new customers', text: 'Customers added in this period will show here.', compact: true });
  }

  function renderAll() {
    const d = compute();
    $('#rangeLabel').textContent = `${d.label} · ${date.format(d.from)} – ${date.format(d.to)}`;
    renderKpis(d);
    renderEquation(d);
    renderRevenueChart(d);
    renderExpenses(d);
    renderProducts(d);
    renderCustomers(d);
  }

  /* ---------- Export ---------- */
  function exportCSV() {
    const d = compute();
    const s = d.summary;
    const rows = [
      ['LocalBiz OS report (demo data)'],
      ['Business', LB.settings().businessName],
      ['Period', d.from, d.to],
      [],
      ['Summary'], ['Revenue', s.revenue], ['Expenses', s.expenses], ['Net profit', s.profit], ['Orders', s.orders], ['Collected', s.collected],
      [],
      ['Daily revenue'], ['Date', 'Revenue', 'Expenses', 'Profit']
    ];
    for (let iso = d.from; iso <= d.to; iso = date.add(iso, 1)) {
      const r = s.sales.filter((x) => x.date === iso).reduce((n, x) => n + x.total, 0);
      const e = s.expenseList.filter((x) => x.date === iso).reduce((n, x) => n + Number(x.amount), 0);
      rows.push([iso, LB.round2(r), LB.round2(e), LB.round2(r - e)]);
    }
    rows.push([], ['Expenses by category'], ['Category', 'Amount']);
    d.expenseByCat.forEach(([c, v]) => rows.push([c, LB.round2(v)]));
    rows.push([], ['Product performance'], ['Product', 'Units sold', 'Revenue', 'Current stock']);
    d.productRows.sort((a, b) => b.revenue - a.revenue).forEach((p) => rows.push([p.name, p.qty, LB.round2(p.revenue), p.stock]));
    rows.push([], ['Customers'], ['Customer', 'Orders', 'Spent']);
    d.customerRows.forEach((c) => rows.push([c.name, c.orders, LB.round2(c.spent)]));
    LB.downloadCSV(`localbiz-report-${d.from}-to-${d.to}.csv`, rows);
    LB.toast('Report exported as CSV.');
  }

  /* ---------- Events ---------- */
  $('#rangeSelect').addEventListener('change', (e) => {
    state.range = e.target.value;
    const custom = state.range === 'custom';
    $('#customRange').hidden = !custom;
    if (custom) {
      $('#customFrom').value = state.from || date.add(date.today(), -13);
      $('#customTo').value = state.to || date.today();
      state.from = $('#customFrom').value;
      state.to = $('#customTo').value;
    }
    renderAll();
  });

  $('#customForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const to = $('#customTo');
    to.setCustomValidity($('#customFrom').value && to.value < $('#customFrom').value ? 'Invalid range' : '');
    if (!LB.validate(e.target)) return;
    state.from = $('#customFrom').value;
    state.to = to.value;
    renderAll();
    LB.toast('Custom range applied.', 'info', 2000);
  });

  $$('[data-group]').forEach((btn) => btn.addEventListener('click', () => {
    $$('[data-group]').forEach((b) => b.classList.toggle('active', b === btn));
    state.group = btn.dataset.group;
    renderRevenueChart(compute());
  }));

  $('#exportBtn').addEventListener('click', exportCSV);
  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', () => { LB.charts.applyDefaults(); renderAll(); });
  document.addEventListener('lb:layout', () => setTimeout(() => Object.values(chartRefs).forEach((c) => c.resize()), 260));

  renderAll();
});
