/* ==========================================================================
   LocalBiz OS — Invoices
   Invoice list with search/filters and pagination; multi-line invoice
   builder with live totals; view, print, download (HTML) and delete.
   ========================================================================== */
LB.page(() => {
  const { $, $$, db, date, money, num, esc, sales } = LB;
  const form = $('#invoiceForm');
  const lines = $('#lineItems');
  const state = { q: LB.param('q') || '', status: '', period: '', page: 1 };
  let afterSave = 'view';

  function renderStats() {
    const all = db.all('sales');
    const billed = all.reduce((n, s) => n + s.total, 0);
    const paid = all.reduce((n, s) => n + (Number(s.paid) || 0), 0);
    const overdue = all.filter((s) => sales.status(s) === 'Overdue').length;
    const cards = [
      ['Invoices issued', num(all.length), 'bi-receipt', 'tone-accent'],
      ['Total billed', money(billed, { round: true }), 'bi-journal-text', 'tone-info'],
      ['Collected', money(paid, { round: true }), 'bi-check2-circle', 'tone-success'],
      ['Overdue invoices', num(overdue), 'bi-alarm', 'tone-danger']
    ];
    $('#invoiceStats').innerHTML = cards.map(([label, value, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="lb-card mini-stat">
        <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        <div><div class="label">${label}</div><div class="value">${value}</div></div>
      </div></div>`).join('');
  }

  function periodStart() {
    const today = date.today();
    if (state.period === 'month') return date.startOfMonth(today);
    if (state.period) return date.add(today, -(Number(state.period) - 1));
    return '';
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const from = periodStart();
    return db.all('sales').filter((s) => {
      if (from && s.date < from) return false;
      if (state.status && sales.status(s) !== state.status) return false;
      return !q || [s.invoiceNo, sales.customerName(s)].some((f) => f.toLowerCase().includes(q));
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  function renderTable() {
    const list = filtered();
    const p = LB.paginate(list, state.page, 10);
    state.page = p.page;
    if (!list.length) {
      LB.render($('#invoicesBody'), LB.emptyRow(7, db.all('sales').length
        ? { icon: 'bi-search', title: 'No matching invoices', text: 'Try a different invoice number, customer or filter.', action: '<button type="button" class="btn btn-light btn-sm" data-clear>Clear filters</button>' }
        : { icon: 'bi-receipt', title: 'No invoices yet', text: 'Create your first invoice in under a minute.', action: '<button type="button" class="btn btn-primary btn-sm" data-new><i class="bi bi-plus-lg"></i>Create invoice</button>' }));
    } else {
      LB.render($('#invoicesBody'), p.items.map((s) => {
        const status = sales.status(s);
        const name = sales.customerName(s);
        return `<tr>
          <td><a href="#" class="inv-link" data-view="${s.id}">${esc(s.invoiceNo)}</a><div class="cell-sub">${s.items.length} item${s.items.length === 1 ? '' : 's'}</div></td>
          <td><div class="person-cell">${LB.avatar(name, 'avatar-sm')}<span class="cell-title">${esc(name)}</span></div></td>
          <td class="text-nowrap">${date.format(s.date)}</td>
          <td class="text-nowrap ${status === 'Overdue' ? 'text-danger fw-semibold' : ''}">${date.format(s.dueDate)}</td>
          <td class="num"><div class="fw-semibold text-body">${money(s.total)}</div>${sales.due(s) > 0 && status !== 'Pending' && status !== 'Overdue' ? `<div class="cell-sub">${money(sales.due(s))} due</div>` : ''}</td>
          <td>${LB.badge(status)}</td>
          <td class="cell-actions">
            <button type="button" class="btn btn-icon accent" data-view="${s.id}" data-bs-toggle="tooltip" title="View invoice" aria-label="View ${esc(s.invoiceNo)}"><i class="bi bi-eye"></i></button>
            <button type="button" class="btn btn-icon" data-print="${s.id}" data-bs-toggle="tooltip" title="Print" aria-label="Print ${esc(s.invoiceNo)}"><i class="bi bi-printer"></i></button>
            <button type="button" class="btn btn-icon" data-download="${s.id}" data-bs-toggle="tooltip" title="Download (HTML)" aria-label="Download ${esc(s.invoiceNo)}"><i class="bi bi-download"></i></button>
            <button type="button" class="btn btn-icon danger" data-delete="${s.id}" data-bs-toggle="tooltip" title="Delete" aria-label="Delete ${esc(s.invoiceNo)}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
      }).join(''));
    }
    LB.renderPager($('#invoicesPager'), p, (page) => { state.page = page; renderTable(); }, 'invoices');
  }

  /* ---------- Invoice builder ---------- */
  const productOptions = () => '<option value="">Select a product</option>' + db.all('products').sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${p.id}" ${Number(p.stock) <= 0 ? 'disabled' : ''}>${esc(p.name)} (${Number(p.stock) <= 0 ? 'out of stock' : `${p.stock} left`})</option>`).join('');

  function addLine() {
    const node = $('#lineTemplate').content.firstElementChild.cloneNode(true);
    $('[data-field="productId"]', node).innerHTML = productOptions();
    lines.appendChild(node);
    updateSummary();
    return node;
  }

  function readLines() {
    return $$('.line-item', lines).map((row) => ({
      row,
      productId: $('[data-field="productId"]', row).value,
      qty: Number($('[data-field="qty"]', row).value) || 0,
      price: Number($('[data-field="price"]', row).value) || 0
    }));
  }

  /** Recalculate line totals and the invoice summary; validate stock per product. */
  function updateSummary() {
    const items = readLines();
    const used = {};
    items.forEach((it) => { if (it.productId) used[it.productId] = (used[it.productId] || 0) + it.qty; });
    items.forEach((it) => {
      $('[data-field="total"]', it.row).textContent = money(it.qty * it.price);
      const product = db.get('products', it.productId);
      const qtyInput = $('[data-field="qty"]', it.row);
      const over = product && used[it.productId] > Number(product.stock);
      qtyInput.setCustomValidity(over ? `Only ${product.stock} in stock` : '');
      qtyInput.title = over ? `Only ${product.stock} in stock` : '';
    });
    $$('[data-remove]', lines).forEach((btn) => { btn.disabled = items.length <= 1; });

    const totals = LB.calcTotals(items, $('#invDiscount').value, $('#invTax').value);
    $('#sumItems').textContent = items.filter((i) => i.productId).length;
    $('#sumSubtotal').textContent = money(totals.subtotal);
    $('#sumDiscount').textContent = `− ${money(totals.discount)}`;
    $('#sumTax').textContent = money(totals.tax);
    $('#sumTotal').textContent = money(totals.total);

    const status = $('#invPayStatus').value;
    const received = status === 'Paid' ? totals.total : status === 'Partial' ? Number($('#invAmountPaid').value) || 0 : 0;
    $('#sumDue').textContent = money(Math.max(0, totals.total - received));
    $('#invAmountPaid').setCustomValidity(status === 'Partial' && !(received > 0 && received < totals.total) ? 'Invalid amount' : '');
    const due = $('#invDue');
    due.setCustomValidity(due.value && $('#invDate').value && due.value < $('#invDate').value ? 'Due date before invoice date' : '');
  }

  function openBuilder() {
    LB.resetForm(form);
    lines.innerHTML = '';
    $('#invCustomer').innerHTML = LB.options(db.all('customers').filter((c) => c.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })), '', 'Select a customer');
    $('#invMethod').innerHTML = LB.options(LB.PAYMENT_METHODS, 'Credit');
    $('#invTax').value = LB.settings().taxRate;
    $('#invDate').value = date.today();
    $('#invDue').value = date.add(date.today(), 15);
    $('#invoiceNoChip').textContent = sales.nextInvoiceNo();
    $('#invPaidWrap').hidden = true;
    addLine();
    LB.modal('#invoiceModal').show();
  }

  lines.addEventListener('change', (e) => {
    if (e.target.matches('[data-field="productId"]')) {
      const product = db.get('products', e.target.value);
      const priceInput = $('[data-field="price"]', e.target.closest('.line-item'));
      if (product) priceInput.value = product.sellingPrice;
    }
    updateSummary();
  });
  lines.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove && $$('.line-item', lines).length > 1) { remove.closest('.line-item').remove(); updateSummary(); }
  });
  form.addEventListener('input', updateSummary);
  $('#addLineBtn').addEventListener('click', () => { const row = addLine(); $('select', row).focus(); });
  $('#invPayStatus').addEventListener('change', (e) => {
    const status = e.target.value;
    $('#invPaidWrap').hidden = status !== 'Partial';
    $('#invAmountPaid').required = status === 'Partial';
    if (status === 'Pending') $('#invMethod').value = 'Credit';
    else if ($('#invMethod').value === 'Credit') $('#invMethod').value = 'Cash';
    updateSummary();
  });

  $$('button[data-then]', form).forEach((btn) => btn.addEventListener('click', () => { afterSave = btn.dataset.then; }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    updateSummary();
    if (!LB.validate(form)) {
      const overStock = $$('[data-field="qty"]', lines).find((i) => !i.checkValidity() && i.validationMessage);
      if (overStock && overStock.title) LB.toast(overStock.title, 'error');
      return;
    }
    const data = LB.formData(form);
    const result = sales.create({
      customerId: data.customerId,
      items: readLines().map(({ productId, qty, price }) => ({ productId, qty, price })),
      discountPct: data.discountPct, taxPct: data.taxPct, method: data.method,
      paymentStatus: data.paymentStatus, amountPaid: data.amountPaid,
      date: data.date, dueDate: data.dueDate, notes: data.notes
    });
    if (!result.ok) { LB.toast(result.error, 'error'); return; }
    LB.modal('#invoiceModal').hide();
    state.page = 1;
    LB.toast(`Invoice ${result.sale.invoiceNo} created successfully.`);
    $('#invoiceModal').addEventListener('hidden.bs.modal', () => {
      if (afterSave === 'print') LB.invoice.print(result.sale);
      else LB.invoice.show(result.sale);
    }, { once: true });
  });

  /* ---------- Table events ---------- */
  $('#invoicesBody').addEventListener('click', async (e) => {
    if (e.target.closest('[data-new]')) openBuilder();
    if (e.target.closest('[data-clear]')) clearFilters();
    const get = (attr) => { const el = e.target.closest(`[${attr}]`); return el ? db.get('sales', el.getAttribute(attr)) : null; };
    const view = get('data-view');
    const print = get('data-print');
    const dl = get('data-download');
    const del = get('data-delete');
    if (view) { e.preventDefault(); LB.invoice.show(view); }
    if (print) LB.invoice.print(print);
    if (dl) { LB.invoice.download(dl); LB.toast(`${dl.invoiceNo} downloaded.`); }
    if (del) {
      const ok = await LB.confirm({ title: `Delete ${del.invoiceNo}?`, message: 'The invoice and its payments will be removed and the items returned to stock.', confirmText: 'Delete invoice' });
      if (ok) { sales.remove(del.id); LB.toast(`${del.invoiceNo} deleted.`, 'info'); }
    }
  });

  function clearFilters() {
    Object.assign(state, { q: '', status: '', period: '', page: 1 });
    $('#searchInput').value = ''; $('#statusFilter').value = ''; $('#periodFilter').value = '';
    renderTable();
  }

  $('#searchInput').value = state.q;
  $('#searchInput').addEventListener('input', LB.debounce((e) => { state.q = e.target.value; state.page = 1; renderTable(); }, 150));
  $('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; renderTable(); });
  $('#periodFilter').addEventListener('change', (e) => { state.period = e.target.value; state.page = 1; renderTable(); });
  $('#newInvoiceBtn').addEventListener('click', openBuilder);

  $('#exportBtn').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) { LB.toast('No invoices to export.', 'warning'); return; }
    const rows = [['Invoice', 'Customer', 'Date', 'Due date', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', 'Status']];
    list.forEach((s) => rows.push([s.invoiceNo, sales.customerName(s), s.date, s.dueDate, s.subtotal, s.discount, s.tax, s.total, s.paid, sales.due(s), sales.status(s)]));
    LB.downloadCSV(`invoices-${date.today()}.csv`, rows);
    LB.toast(`Exported ${list.length} invoices to CSV.`);
  });

  function renderAll() { renderStats(); renderTable(); }
  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', renderAll);

  renderAll();
  if (LB.param('action') === 'new') { openBuilder(); LB.clearParams('action'); }
  // Deep link from search: open the matching invoice directly.
  const q = LB.param('q');
  if (q) {
    const exact = db.all('sales').find((s) => s.invoiceNo.toLowerCase() === q.toLowerCase());
    if (exact) LB.invoice.show(exact);
    LB.clearParams('q');
  }
});
