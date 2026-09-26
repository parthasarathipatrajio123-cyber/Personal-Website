/* ==========================================================================
   LocalBiz OS — Sales
   List, search, filter (date + payment status), sort, paginate, create,
   view and delete sales. New sales reduce stock; deleting restores it.
   ========================================================================== */
LB.page(() => {
  const { $, $$, db, date, money, num, esc, sales } = LB;
  const form = $('#saleForm');
  const state = { q: LB.param('q') || '', from: '', to: '', status: LB.param('status') || '', page: 1, sort: 'date', dir: 'desc' };

  /* ---------- Overview cards ---------- */
  function renderStats() {
    const today = date.today();
    const month = LB.summarize(date.startOfMonth(today), today);
    const outstanding = db.all('sales').reduce((n, s) => n + sales.due(s), 0);
    const avg = month.orders ? month.revenue / month.orders : 0;
    const cards = [
      ['Sales this month', money(month.revenue, { round: true }), 'bi-graph-up', 'tone-accent'],
      ['Orders this month', num(month.orders), 'bi-bag-check', 'tone-success'],
      ['Average order value', money(avg, { round: true }), 'bi-calculator', 'tone-info'],
      ['Outstanding dues', money(outstanding, { round: true }), 'bi-hourglass-split', 'tone-warning']
    ];
    $('#salesStats').innerHTML = cards.map(([label, value, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="lb-card mini-stat">
        <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        <div><div class="label">${label}</div><div class="value">${value}</div></div>
      </div></div>`).join('');
  }

  /* ---------- Table ---------- */
  function filtered() {
    const q = state.q.trim().toLowerCase();
    const list = db.all('sales').filter((s) => {
      if (!date.inRange(s.date, state.from, state.to)) return false;
      if (state.status && sales.status(s) !== state.status) return false;
      if (!q) return true;
      return [s.invoiceNo, sales.customerName(s), s.method, ...s.items.map((i) => i.name)].some((f) => String(f).toLowerCase().includes(q));
    });
    const dir = state.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      let cmp;
      if (state.sort === 'total') cmp = a.total - b.total;
      else if (state.sort === 'invoiceNo') cmp = a.invoiceNo.localeCompare(b.invoiceNo, undefined, { numeric: true });
      else cmp = a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
      return cmp * dir;
    });
  }

  function renderTable() {
    const list = filtered();
    const p = LB.paginate(list, state.page, 10);
    state.page = p.page;
    const hasFilters = state.q || state.from || state.to || state.status;

    if (!list.length) {
      LB.render($('#salesBody'), LB.emptyRow(8, hasFilters
        ? { icon: 'bi-search', title: 'No matching sales', text: 'Try a different search term or clear the filters.', action: '<button type="button" class="btn btn-light btn-sm" data-clear>Clear filters</button>' }
        : { icon: 'bi-bag', title: 'No sales yet', text: 'Record your first sale to start tracking revenue.', action: '<button type="button" class="btn btn-primary btn-sm" data-new><i class="bi bi-plus-lg"></i>New sale</button>' }));
    } else {
      LB.render($('#salesBody'), p.items.map((s) => {
        const name = sales.customerName(s);
        const itemsLabel = s.items.length === 1 ? `${esc(s.items[0].name)} × ${s.items[0].qty}` : `${s.items.length} products`;
        return `<tr>
          <td><a href="#" class="inv-link" data-view="${s.id}">${esc(s.invoiceNo)}</a></td>
          <td><div class="person-cell">${LB.avatar(name, 'avatar-sm')}<span class="cell-title">${esc(name)}</span></div></td>
          <td class="text-nowrap">${date.format(s.date)}</td>
          <td><span class="d-inline-block text-truncate cell-truncate">${itemsLabel}</span></td>
          <td><span class="chip">${esc(s.method)}</span></td>
          <td class="num fw-semibold text-body">${money(s.total)}</td>
          <td>${LB.badge(sales.status(s))}</td>
          <td class="cell-actions">
            <button type="button" class="btn btn-icon accent" data-view="${s.id}" data-bs-toggle="tooltip" title="View sale" aria-label="View ${esc(s.invoiceNo)}"><i class="bi bi-eye"></i></button>
            <button type="button" class="btn btn-icon" data-print="${s.id}" data-bs-toggle="tooltip" title="Print invoice" aria-label="Print ${esc(s.invoiceNo)}"><i class="bi bi-printer"></i></button>
            <button type="button" class="btn btn-icon danger" data-delete="${s.id}" data-bs-toggle="tooltip" title="Delete sale" aria-label="Delete ${esc(s.invoiceNo)}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
      }).join(''));
    }
    LB.renderPager($('#salesPager'), p, (page) => { state.page = page; renderTable(); }, 'sales');

    $$('th[data-sort]').forEach((th) => {
      const active = th.dataset.sort === state.sort;
      th.querySelector('i').className = `bi ${active ? (state.dir === 'asc' ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up'}`;
      th.setAttribute('aria-sort', active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function renderAll() { renderStats(); renderTable(); }

  /* ---------- New sale modal ---------- */
  const productSelect = $('#saleProduct');

  function fillSelects() {
    const s = LB.settings();
    $('#saleCustomer').innerHTML = LB.options(
      db.all('customers').filter((c) => c.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}` })),
      '', 'Select a customer');
    productSelect.innerHTML = '<option value="">Select a product</option>' + db.all('products').sort((a, b) => a.name.localeCompare(b.name)).map((p) =>
      `<option value="${p.id}" ${Number(p.stock) <= 0 ? 'disabled' : ''}>${esc(p.name)} — ${money(p.sellingPrice)} (${Number(p.stock) <= 0 ? 'out of stock' : `${p.stock} in stock`})</option>`).join('');
    $('#saleMethod').innerHTML = LB.options(LB.PAYMENT_METHODS, 'Cash');
    $('#saleTax').value = s.taxRate;
  }

  function openNewSale(preset = {}) {
    LB.resetForm(form);
    fillSelects();
    $('#saleDate').value = date.today();
    $('#saleInvoiceNo').textContent = sales.nextInvoiceNo();
    if (preset.customerId) $('#saleCustomer').value = preset.customerId;
    if (preset.productId) { productSelect.value = preset.productId; onProductChange(); }
    togglePartial();
    updateSummary();
    LB.modal('#saleModal').show();
  }

  function selectedProduct() { return db.get('products', productSelect.value); }

  function onProductChange() {
    const p = selectedProduct();
    if (p) $('#salePrice').value = p.sellingPrice;
    updateSummary();
  }

  function togglePartial() {
    const partial = $('#salePayStatus').value === 'Partial';
    $('#amountPaidWrap').hidden = !partial;
    $('#saleAmountPaid').required = partial;
    if ($('#salePayStatus').value === 'Pending') $('#saleMethod').value = 'Credit';
    else if ($('#saleMethod').value === 'Credit') $('#saleMethod').value = 'Cash';
  }

  /** Live bill calculation + stock / partial-amount validation. */
  function updateSummary() {
    const p = selectedProduct();
    const qty = Number($('#saleQty').value) || 0;
    const price = Number($('#salePrice').value) || 0;
    const totals = LB.calcTotals([{ qty, price }], $('#saleDiscount').value, $('#saleTax').value);

    $('#calcSubtotal').textContent = money(totals.subtotal);
    $('#calcDiscount').textContent = `− ${money(totals.discount)}`;
    $('#calcTax').textContent = money(totals.tax);
    $('#calcTotal').textContent = money(totals.total);

    const status = $('#salePayStatus').value;
    const received = status === 'Paid' ? totals.total : status === 'Partial' ? Number($('#saleAmountPaid').value) || 0 : 0;
    $('#calcDue').textContent = money(Math.max(0, totals.total - received));

    const qtyInput = $('#saleQty');
    if (p && qty > Number(p.stock)) {
      qtyInput.setCustomValidity('Not enough stock');
      $('#qtyFeedback').textContent = `Only ${p.stock} in stock.`;
    } else {
      qtyInput.setCustomValidity('');
      $('#qtyFeedback').textContent = 'Enter a quantity of at least 1.';
    }
    const paidInput = $('#saleAmountPaid');
    paidInput.setCustomValidity(status === 'Partial' && !(received > 0 && received < totals.total) ? 'Invalid partial amount' : '');

    $('#stockHint').textContent = p ? `${p.stock} available · SKU ${p.sku}` : '';
    const meta = p ? (LB.PRODUCT_CATEGORIES[p.category] || LB.PRODUCT_CATEGORIES.Other) : null;
    $('#summaryProduct').innerHTML = p
      ? `<span class="product-thumb ${meta.tone}"><i class="bi ${meta.icon}"></i></span><div class="min-w-0"><div class="cell-title text-truncate">${esc(p.name)}</div><div class="cell-sub">${qty || 0} × ${money(price)}</div></div>`
      : '<span class="product-thumb tone-neutral"><i class="bi bi-box"></i></span><div class="text-muted small">Select a product to see the bill.</div>';
  }

  form.addEventListener('input', updateSummary);
  productSelect.addEventListener('change', onProductChange);
  $('#salePayStatus').addEventListener('change', () => { togglePartial(); updateSummary(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    updateSummary();
    if (!LB.validate(form)) return;
    const data = LB.formData(form);
    const btn = $('#saveSaleBtn');
    LB.btnLoading(btn, true, 'Saving…');
    // Short delay so the loading state is perceivable.
    setTimeout(() => {
      const result = sales.create({
        customerId: data.customerId,
        items: [{ productId: data.productId, qty: data.qty, price: data.price }],
        discountPct: data.discountPct, taxPct: data.taxPct, method: data.method,
        paymentStatus: data.paymentStatus, amountPaid: data.amountPaid, date: data.date
      });
      LB.btnLoading(btn, false);
      if (!result.ok) { LB.toast(result.error, 'error'); return; }
      LB.modal('#saleModal').hide();
      state.page = 1;
      LB.toast(`Sale recorded — ${result.sale.invoiceNo} created successfully.`);
    }, 350);
  });

  /* ---------- Table events ---------- */
  $('#salesBody').addEventListener('click', async (e) => {
    const view = e.target.closest('[data-view]');
    const print = e.target.closest('[data-print]');
    const del = e.target.closest('[data-delete]');
    if (e.target.closest('[data-new]')) openNewSale();
    if (e.target.closest('[data-clear]')) clearFilters();
    if (view) { e.preventDefault(); const s = db.get('sales', view.dataset.view); if (s) LB.invoice.show(s); }
    if (print) { const s = db.get('sales', print.dataset.print); if (s) LB.invoice.print(s); }
    if (del) {
      const s = db.get('sales', del.dataset.delete);
      if (!s) return;
      const ok = await LB.confirm({ title: `Delete ${s.invoiceNo}?`, message: 'The sale and its payment records will be removed and the items returned to stock. This cannot be undone.', confirmText: 'Delete sale' });
      if (ok) { sales.remove(s.id); LB.toast(`${s.invoiceNo} deleted.`, 'info'); }
    }
  });

  $$('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    if (state.sort === th.dataset.sort) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = th.dataset.sort; state.dir = th.dataset.sort === 'invoiceNo' ? 'asc' : 'desc'; }
    renderTable();
  }));

  /* ---------- Filters ---------- */
  const search = $('#searchInput');
  search.value = state.q;
  $('#statusFilter').value = state.status;
  search.addEventListener('input', LB.debounce(() => { state.q = search.value; state.page = 1; renderTable(); }, 150));
  $('#fromDate').addEventListener('change', (e) => { state.from = e.target.value; state.page = 1; renderTable(); });
  $('#toDate').addEventListener('change', (e) => { state.to = e.target.value; state.page = 1; renderTable(); });
  $('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; renderTable(); });

  function clearFilters() {
    Object.assign(state, { q: '', from: '', to: '', status: '', page: 1 });
    search.value = ''; $('#fromDate').value = ''; $('#toDate').value = ''; $('#statusFilter').value = '';
    renderTable();
  }
  $('#clearFilters').addEventListener('click', clearFilters);

  $('#newSaleBtn').addEventListener('click', () => openNewSale());

  $('#exportBtn').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) { LB.toast('There are no sales to export for these filters.', 'warning'); return; }
    const rows = [['Invoice', 'Date', 'Customer', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Due', 'Method', 'Status']];
    list.forEach((s) => rows.push([s.invoiceNo, s.date, sales.customerName(s), s.items.map((i) => `${i.name} x${i.qty}`).join('; '), s.subtotal, s.discount, s.tax, s.total, s.paid, sales.due(s), s.method, sales.status(s)]));
    LB.downloadCSV(`sales-${date.today()}.csv`, rows);
    LB.toast(`Exported ${list.length} sales to CSV.`);
  });

  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', renderAll);

  renderAll();
  if (LB.param('action') === 'new') { openNewSale({ customerId: LB.param('customer'), productId: LB.param('product') }); LB.clearParams('action', 'customer', 'product'); }
  if (LB.param('q')) LB.clearParams('q');
});
