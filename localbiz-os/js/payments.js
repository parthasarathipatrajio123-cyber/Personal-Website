/* ==========================================================================
   LocalBiz OS — Payments & dues
   Lists invoices with paid / due amounts and status (Paid, Partial,
   Pending, Overdue). Recording a payment updates the invoice balance and
   adds an entry to the payment log.
   ========================================================================== */
LB.page(() => {
  const { $, $$, db, date, money, num, esc, sales } = LB;
  const form = $('#paymentForm');
  const state = { status: 'open', q: LB.param('q') || '', page: 1 };
  let current = null;

  function renderStats() {
    const all = db.all('sales');
    const today = date.today();
    const open = all.filter((s) => sales.due(s) > 0);
    const overdue = open.filter((s) => sales.status(s) === 'Overdue');
    const weekEnd = date.add(today, 7);
    const dueSoon = open.filter((s) => s.dueDate >= today && s.dueDate <= weekEnd);
    const collected = db.all('payments').filter((p) => p.date >= date.startOfMonth(today)).reduce((n, p) => n + p.amount, 0);
    const sum = (list) => list.reduce((n, s) => n + sales.due(s), 0);
    const cards = [
      ['Total receivable', money(sum(open), { round: true }), `${open.length} open invoices`, 'bi-hourglass-split', 'tone-accent'],
      ['Overdue', money(sum(overdue), { round: true }), `${overdue.length} invoices past due`, 'bi-alarm', 'tone-danger'],
      ['Due in 7 days', money(sum(dueSoon), { round: true }), `${dueSoon.length} invoices`, 'bi-calendar-event', 'tone-warning'],
      ['Collected this month', money(collected, { round: true }), 'All payment methods', 'bi-cash-coin', 'tone-success']
    ];
    $('#paymentStats').innerHTML = cards.map(([label, value, sub, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="lb-card mini-stat">
        <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        <div class="min-w-0"><div class="label">${label}</div><div class="value">${value}</div><div class="cell-sub text-truncate">${sub}</div></div>
      </div></div>`).join('');
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const order = { Overdue: 0, Partial: 1, Pending: 2, Paid: 3 };
    return db.all('sales').filter((s) => {
      const status = sales.status(s);
      if (state.status === 'open' && status === 'Paid') return false;
      if (state.status && state.status !== 'open' && status !== state.status) return false;
      return !q || [s.invoiceNo, sales.customerName(s)].some((f) => f.toLowerCase().includes(q));
    }).sort((a, b) => (order[sales.status(a)] - order[sales.status(b)]) || a.dueDate.localeCompare(b.dueDate));
  }

  function renderTable() {
    const list = filtered();
    const p = LB.paginate(list, state.page, 10);
    state.page = p.page;
    const today = date.today();
    if (!list.length) {
      LB.render($('#paymentsBody'), LB.emptyRow(8, state.status === 'open' && !state.q
        ? { icon: 'bi-emoji-smile', title: 'No outstanding dues', text: 'Every invoice has been paid in full. Nice work!' }
        : { icon: 'bi-search', title: 'Nothing matches', text: 'Try a different status or search term.' }));
    } else {
      LB.render($('#paymentsBody'), p.items.map((s) => {
        const status = sales.status(s);
        const due = sales.due(s);
        const name = sales.customerName(s);
        const days = date.diff(today, s.dueDate);
        const dueNote = status === 'Paid' ? '' : days > 0 ? `${days} day${days === 1 ? '' : 's'} late` : days === 0 ? 'Due today' : `in ${-days} day${days === -1 ? '' : 's'}`;
        return `<tr>
          <td><div class="person-cell">${LB.avatar(name, 'avatar-sm')}<span class="cell-title">${esc(name)}</span></div></td>
          <td><a href="#" class="inv-link" data-view="${s.id}">${esc(s.invoiceNo)}</a><div class="cell-sub">${date.format(s.date)}</div></td>
          <td class="num">${money(s.total)}</td>
          <td class="num text-success">${money(s.paid)}</td>
          <td class="num fw-semibold ${due > 0 ? 'text-danger' : 'text-muted'}">${money(due)}</td>
          <td class="text-nowrap">${date.format(s.dueDate)}${dueNote ? `<div class="cell-sub ${status === 'Overdue' ? 'text-danger' : ''}">${dueNote}</div>` : ''}</td>
          <td>${LB.badge(status)}</td>
          <td class="cell-actions">${due > 0
            ? `<button type="button" class="btn btn-sm btn-primary" data-pay="${s.id}"><i class="bi bi-cash-coin"></i>Record</button>`
            : `<button type="button" class="btn btn-sm btn-light" data-view="${s.id}"><i class="bi bi-eye"></i>View</button>`}</td>
        </tr>`;
      }).join(''));
    }
    LB.renderPager($('#paymentsPager'), p, (page) => { state.page = page; renderTable(); }, 'invoices');
  }

  function renderRecent() {
    const list = db.all('payments').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 8);
    if (!list.length) {
      $('#recentPayments').innerHTML = LB.emptyState({ icon: 'bi-cash-stack', title: 'No payments yet', text: 'Recorded payments will appear here.', compact: true });
      return;
    }
    const icons = { Cash: 'bi-cash', UPI: 'bi-phone', Card: 'bi-credit-card', 'Bank Transfer': 'bi-bank' };
    $('#recentPayments').innerHTML = list.map((p) => {
      const customer = db.get('customers', p.customerId);
      return `<div class="history-item">
        <div class="d-flex align-items-center gap-3 min-w-0">
          <span class="stat-icon tone-success"><i class="bi ${icons[p.method] || 'bi-cash-coin'}"></i></span>
          <div class="min-w-0"><div class="cell-title text-truncate">${esc(customer ? customer.name : 'Customer')}</div>
          <div class="cell-sub text-truncate">${esc(p.invoiceNo)} · ${esc(p.method)} · ${date.relative(p.date)}</div></div>
        </div>
        <span class="fw-semibold text-success text-nowrap">+ ${money(p.amount)}</span>
      </div>`;
    }).join('');
  }

  /* ---------- Record payment ---------- */
  function updateRemaining() {
    if (!current) return;
    const due = sales.due(current);
    const amountInput = $('#payAmount');
    const amount = Number(amountInput.value) || 0;
    const over = amount > due + 0.001;
    amountInput.setCustomValidity(over || amount <= 0 ? 'Invalid amount' : '');
    $('#payAmountFeedback').textContent = over ? `The balance due is only ${money(due)}.` : 'Enter an amount greater than zero.';
    const remaining = Math.max(0, due - amount);
    $('#remainingNote').innerHTML = over
      ? '<i class="bi bi-exclamation-circle"></i><div class="alert-text">Amount is more than the balance due.</div>'
      : remaining <= 0.001
        ? '<i class="bi bi-check2-circle"></i><div class="alert-text"><strong>Fully paid.</strong> This invoice will be marked as Paid.</div>'
        : `<i class="bi bi-info-circle"></i><div class="alert-text">Remaining due after this payment: <strong>${money(remaining)}</strong> — status will be <strong>${amount > 0 || current.paid > 0 ? 'Partial' : 'Pending'}</strong>${current.dueDate < date.today() ? ' (still overdue)' : ''}.</div>`;
  }

  function openPayment(sale) {
    current = sale;
    LB.resetForm(form);
    const due = sales.due(sale);
    form.elements.saleId.value = sale.id;
    $('#paymentSub').textContent = `${sale.invoiceNo} · ${sales.customerName(sale)}`;
    $('#paymentSummary').innerHTML = `
      <div class="calc-row"><span>Invoice total</span><span>${money(sale.total)}</span></div>
      <div class="calc-row"><span>Already paid</span><span class="text-success">${money(sale.paid)}</span></div>
      <div class="calc-row total"><span>Balance due</span><span class="text-danger">${money(due)}</span></div>`;
    $('#payMethod').innerHTML = LB.options(LB.PAYMENT_METHODS.filter((m) => m !== 'Credit'), 'UPI');
    $('#payDate').value = date.today();
    $('#payDate').max = date.today();
    $('#payDate').min = sale.date;
    $('#payAmount').value = due;
    $('#payAmount').max = due;
    updateRemaining();
    LB.modal('#paymentModal').show();
  }

  $('#payFullBtn').addEventListener('click', () => { if (current) { $('#payAmount').value = sales.due(current); updateRemaining(); } });
  $('#payAmount').addEventListener('input', updateRemaining);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    updateRemaining();
    if (!LB.validate(form)) return;
    const data = LB.formData(form);
    const sale = db.get('sales', data.saleId);
    if (!sale) return;
    const amount = Math.min(LB.round2(data.amount), sales.due(sale));
    sale.paid = LB.round2((Number(sale.paid) || 0) + amount);
    if (sale.method === 'Credit') sale.method = data.method;
    db.upsert('payments', { id: LB.uid('pay_'), saleId: sale.id, invoiceNo: sale.invoiceNo, customerId: sale.customerId, amount, method: data.method, date: data.date, note: data.note, createdAt: Date.now() });
    db.upsert('sales', sale);
    LB.modal('#paymentModal').hide();
    LB.toast(sales.due(sale) <= 0 ? `Payment recorded successfully. ${sale.invoiceNo} is now fully paid.` : `Payment recorded successfully. ${money(sales.due(sale))} still due.`);
  });

  /* ---------- Events ---------- */
  $('#paymentsBody').addEventListener('click', (e) => {
    const pay = e.target.closest('[data-pay]');
    const view = e.target.closest('[data-view]');
    if (pay) openPayment(db.get('sales', pay.dataset.pay));
    if (view) { e.preventDefault(); LB.invoice.show(db.get('sales', view.dataset.view)); }
  });

  $$('#statusTabs [data-status]').forEach((btn) => btn.addEventListener('click', () => {
    $$('#statusTabs [data-status]').forEach((b) => b.classList.toggle('active', b === btn));
    state.status = btn.dataset.status;
    state.page = 1;
    renderTable();
  }));

  $('#searchInput').value = state.q;
  if (state.q) { state.status = ''; $$('#statusTabs [data-status]').forEach((b) => b.classList.toggle('active', b.dataset.status === '')); }
  $('#searchInput').addEventListener('input', LB.debounce((e) => { state.q = e.target.value; state.page = 1; renderTable(); }, 150));

  $('#exportBtn').addEventListener('click', () => {
    const list = db.all('sales').filter((s) => sales.due(s) > 0);
    if (!list.length) { LB.toast('There are no outstanding dues to export.', 'warning'); return; }
    const rows = [['Customer', 'Invoice', 'Invoice date', 'Due date', 'Total', 'Paid', 'Due', 'Status']];
    list.forEach((s) => rows.push([sales.customerName(s), s.invoiceNo, s.date, s.dueDate, s.total, s.paid, sales.due(s), sales.status(s)]));
    LB.downloadCSV(`dues-${date.today()}.csv`, rows);
    LB.toast(`Exported ${list.length} open invoices to CSV.`);
  });

  function renderAll() { renderStats(); renderTable(); renderRecent(); }
  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', renderAll);

  renderAll();
  const invoiceId = LB.param('invoice');
  if (invoiceId) {
    const sale = db.get('sales', invoiceId);
    if (sale && sales.due(sale) > 0) openPayment(sale);
    LB.clearParams('invoice');
  }
  if (LB.param('q')) LB.clearParams('q');
});
