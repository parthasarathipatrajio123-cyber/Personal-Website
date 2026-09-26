/* ==========================================================================
   LocalBiz OS — Customers
   CRUD, search, filters, sorting and a profile panel with purchase history.
   Purchase totals and dues are derived from sales, never stored twice.
   ========================================================================== */
LB.page(() => {
  const { $, db, date, money, num, esc, sales } = LB;
  const form = $('#customerForm');
  const state = { q: LB.param('q') || '', status: '', sort: 'name' };
  let profileId = null;

  /** Purchase stats for every customer, computed from sales in one pass. */
  function customerStats() {
    const stats = {};
    db.all('sales').forEach((s) => {
      const st = stats[s.customerId] || (stats[s.customerId] = { total: 0, due: 0, orders: 0, last: '' });
      st.total += s.total;
      st.due += sales.due(s);
      st.orders += 1;
      if (s.date > st.last) st.last = s.date;
    });
    return stats;
  }
  const blank = { total: 0, due: 0, orders: 0, last: '' };

  function renderStats() {
    const customers = db.all('customers');
    const stats = customerStats();
    const monthStart = date.startOfMonth(date.today());
    const due = Object.values(stats).reduce((n, s) => n + s.due, 0);
    const cards = [
      ['Total customers', num(customers.length), 'bi-people', 'tone-accent'],
      ['Active', num(customers.filter((c) => c.status === 'Active').length), 'bi-person-check', 'tone-success'],
      ['Outstanding dues', money(due, { round: true }), 'bi-hourglass-split', 'tone-warning'],
      ['New this month', num(customers.filter((c) => c.createdAt >= monthStart).length), 'bi-person-plus', 'tone-info']
    ];
    $('#customerStats').innerHTML = cards.map(([label, value, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="lb-card mini-stat">
        <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        <div><div class="label">${label}</div><div class="value">${value}</div></div>
      </div></div>`).join('');
  }

  function filtered(stats) {
    const q = state.q.trim().toLowerCase();
    return db.all('customers').filter((c) => {
      const st = stats[c.id] || blank;
      if (state.status === 'due' && st.due <= 0) return false;
      if (state.status && state.status !== 'due' && c.status !== state.status) return false;
      return !q || [c.name, c.phone, c.email].some((f) => String(f || '').toLowerCase().includes(q));
    }).sort((a, b) => {
      const sa = stats[a.id] || blank;
      const sb = stats[b.id] || blank;
      if (state.sort === 'purchases') return sb.total - sa.total;
      if (state.sort === 'due') return sb.due - sa.due;
      if (state.sort === 'recent') return sb.last.localeCompare(sa.last);
      return a.name.localeCompare(b.name);
    });
  }

  function renderTable() {
    const stats = customerStats();
    const list = filtered(stats);
    const total = db.all('customers').length;
    if (!list.length) {
      LB.render($('#customersBody'), LB.emptyRow(8, total
        ? { icon: 'bi-search', title: 'No matching customers', text: 'Try another name or phone number.', action: '<button type="button" class="btn btn-light btn-sm" data-clear>Clear filters</button>' }
        : { icon: 'bi-people', title: 'No customers yet', text: 'Save your regular customers to bill them faster.', action: '<button type="button" class="btn btn-primary btn-sm" data-add><i class="bi bi-person-plus"></i>Add customer</button>' }));
    } else {
      LB.render($('#customersBody'), list.map((c) => {
        const st = stats[c.id] || blank;
        return `<tr>
          <td><a href="#" class="person-cell text-reset" data-view="${c.id}">${LB.avatar(c.name)}<div><div class="cell-title">${esc(c.name)}</div><div class="cell-sub">${st.orders} order${st.orders === 1 ? '' : 's'} · since ${date.format(c.createdAt, { month: 'short', year: 'numeric' })}</div></div></a></td>
          <td class="text-nowrap">${esc(c.phone)}</td>
          <td>${c.email ? `<a href="mailto:${esc(c.email)}" class="text-reset">${esc(c.email)}</a>` : '<span class="text-muted">—</span>'}</td>
          <td class="num fw-semibold text-body">${money(st.total)}</td>
          <td class="num ${st.due > 0 ? 'text-danger fw-semibold' : 'text-muted'}">${st.due > 0 ? money(st.due) : '—'}</td>
          <td class="text-nowrap">${st.last ? date.relative(st.last) : '<span class="text-muted">No purchases</span>'}</td>
          <td>${LB.badge(c.status)}</td>
          <td class="cell-actions">
            <button type="button" class="btn btn-icon accent" data-view="${c.id}" data-bs-toggle="tooltip" title="View profile" aria-label="View ${esc(c.name)}"><i class="bi bi-person-lines-fill"></i></button>
            <button type="button" class="btn btn-icon" data-edit="${c.id}" data-bs-toggle="tooltip" title="Edit customer" aria-label="Edit ${esc(c.name)}"><i class="bi bi-pencil-square"></i></button>
            <button type="button" class="btn btn-icon danger" data-delete="${c.id}" data-bs-toggle="tooltip" title="Delete customer" aria-label="Delete ${esc(c.name)}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
      }).join(''));
    }
    $('#customersFooter').innerHTML = `<span>Showing <strong>${list.length}</strong> of <strong>${total}</strong> customers</span>`;
  }

  /* ---------- Profile panel ---------- */
  function renderProfile() {
    const c = db.get('customers', profileId);
    if (!c) return;
    const history = db.all('sales').filter((s) => s.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    const total = history.reduce((n, s) => n + s.total, 0);
    const due = history.reduce((n, s) => n + sales.due(s), 0);

    $('#profileHead').innerHTML = `${LB.avatar(c.name, 'avatar-lg')}
      <div><h2 class="h5 text-white mb-1" id="profileTitle">${esc(c.name)}</h2>
      <div class="small text-muted">Customer since ${date.format(c.createdAt)}</div>
      <div class="mt-2">${LB.badge(c.status)}</div></div>`;

    $('#profileBody').innerHTML = `
      <div class="profile-stats mb-4">
        <div><div class="label">Total purchases</div><div class="value">${money(total, { round: true })}</div></div>
        <div><div class="label">Orders</div><div class="value">${num(history.length)}</div></div>
        <div><div class="label">Outstanding</div><div class="value ${due > 0 ? 'text-danger' : ''}">${money(due, { round: true })}</div></div>
      </div>
      <p class="form-section-title">Contact</p>
      <div class="info-list mb-4">
        <div><i class="bi bi-telephone"></i><a href="tel:${esc(c.phone.replace(/\s/g, ''))}" class="text-reset">${esc(c.phone)}</a></div>
        <div><i class="bi bi-envelope"></i>${c.email ? `<a href="mailto:${esc(c.email)}" class="text-reset">${esc(c.email)}</a>` : '<span class="text-muted">No email</span>'}</div>
        <div><i class="bi bi-geo-alt"></i>${c.address ? esc(c.address) : '<span class="text-muted">No address</span>'}</div>
        ${c.notes ? `<div><i class="bi bi-sticky"></i>${esc(c.notes)}</div>` : ''}
      </div>
      <div class="d-flex gap-2 mb-4">
        <a href="sales.html?action=new&amp;customer=${encodeURIComponent(c.id)}" class="btn btn-primary btn-sm flex-fill ${c.status !== 'Active' ? 'disabled' : ''}"><i class="bi bi-bag-plus"></i>New sale</a>
        ${due > 0 ? `<a href="payments.html?q=${encodeURIComponent(c.name)}" class="btn btn-light btn-sm flex-fill"><i class="bi bi-cash-coin"></i>Collect dues</a>` : ''}
        <button type="button" class="btn btn-light btn-sm flex-fill" data-edit="${c.id}"><i class="bi bi-pencil-square"></i>Edit</button>
      </div>
      <p class="form-section-title">Purchase history</p>
      ${history.length ? history.slice(0, 25).map((s) => `
        <div class="history-item">
          <div class="min-w-0">
            <a href="#" class="inv-link" data-invoice="${s.id}">${esc(s.invoiceNo)}</a>
            <div class="cell-sub text-truncate">${date.format(s.date)} · ${s.items.map((i) => esc(i.name)).join(', ')}</div>
          </div>
          <div class="text-end"><div class="fw-semibold">${money(s.total)}</div>${LB.badge(sales.status(s))}</div>
        </div>`).join('') + (history.length > 25 ? `<p class="small text-muted mt-2">Showing latest 25 of ${history.length} purchases.</p>` : '')
        : LB.emptyState({ icon: 'bi-bag', title: 'No purchases yet', text: 'Sales for this customer will be listed here.', compact: true })}`;
  }

  function openProfile(id) {
    profileId = id;
    renderProfile();
    bootstrap.Offcanvas.getOrCreateInstance($('#profilePanel')).show();
  }

  $('#profilePanel').addEventListener('click', (e) => {
    const inv = e.target.closest('[data-invoice]');
    if (inv) { e.preventDefault(); const s = db.get('sales', inv.dataset.invoice); if (s) LB.invoice.show(s); }
    const edit = e.target.closest('[data-edit]');
    if (edit) { bootstrap.Offcanvas.getInstance($('#profilePanel')).hide(); openModal(db.get('customers', edit.dataset.edit)); }
  });

  /* ---------- Modal ---------- */
  function openModal(customer) {
    LB.resetForm(form);
    $('#customerModalTitle').textContent = customer ? 'Edit customer' : 'Add customer';
    $('#saveCustomerBtn').innerHTML = `<i class="bi bi-check2"></i>${customer ? 'Save changes' : 'Save customer'}`;
    if (customer) LB.fillForm(form, customer);
    else form.elements.id.value = '';
    LB.modal('#customerModal').show();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone = $('#cPhone');
    const id = form.elements.id.value;
    const digits = phone.value.replace(/\D/g, '').slice(-10);
    const duplicate = digits.length === 10 && db.all('customers').some((c) => c.id !== id && c.phone.replace(/\D/g, '').slice(-10) === digits);
    phone.setCustomValidity(duplicate ? 'Duplicate phone' : '');
    $('#phoneFeedback').textContent = duplicate ? 'A customer with this phone number already exists.' : 'Enter a valid 10-digit phone number.';
    if (!LB.validate(form)) return;

    const data = LB.formData(form);
    const existing = id ? db.get('customers', id) : null;
    const customer = Object.assign({}, existing || { id: LB.uid('c_'), createdAt: date.today() }, {
      name: data.name, phone: data.phone, email: data.email, address: data.address, status: data.status, notes: data.notes
    });
    db.upsert('customers', customer);
    // Keep the name snapshot on existing invoices in sync.
    if (existing && existing.name !== customer.name) {
      db.save('sales', db.all('sales').map((s) => (s.customerId === customer.id ? Object.assign(s, { customerName: customer.name }) : s)));
    }
    LB.modal('#customerModal').hide();
    LB.toast(existing ? `${customer.name} updated successfully.` : 'Customer added successfully.');
  });

  /* ---------- Events ---------- */
  $('#customersBody').addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) openModal();
    if (e.target.closest('[data-clear]')) clearFilters();
    const view = e.target.closest('[data-view]');
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (view) { e.preventDefault(); openProfile(view.dataset.view); }
    if (edit) openModal(db.get('customers', edit.dataset.edit));
    if (del) {
      const c = db.get('customers', del.dataset.delete);
      if (!c) return;
      const orders = db.all('sales').filter((s) => s.customerId === c.id).length;
      const ok = await LB.confirm({
        title: `Delete ${c.name}?`,
        message: orders ? `Their ${orders} invoice(s) will be kept with the customer's name for your records.` : 'This customer will be removed permanently.',
        confirmText: 'Delete customer'
      });
      if (ok) { db.remove('customers', c.id); LB.toast(`${c.name} deleted.`, 'info'); }
    }
  });

  function clearFilters() {
    Object.assign(state, { q: '', status: '' });
    $('#searchInput').value = ''; $('#statusFilter').value = '';
    renderTable();
  }

  $('#searchInput').value = state.q;
  $('#searchInput').addEventListener('input', LB.debounce((e) => { state.q = e.target.value; renderTable(); }, 150));
  $('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; renderTable(); });
  $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderTable(); });
  $('#addCustomerBtn').addEventListener('click', () => openModal());

  $('#exportBtn').addEventListener('click', () => {
    const stats = customerStats();
    const list = filtered(stats);
    if (!list.length) { LB.toast('No customers to export.', 'warning'); return; }
    const rows = [['Name', 'Phone', 'Email', 'Address', 'Status', 'Orders', 'Total purchases', 'Outstanding', 'Last purchase', 'Customer since']];
    list.forEach((c) => { const st = stats[c.id] || blank; rows.push([c.name, c.phone, c.email, c.address, c.status, st.orders, LB.round2(st.total), LB.round2(st.due), st.last, c.createdAt]); });
    LB.downloadCSV(`customers-${date.today()}.csv`, rows);
    LB.toast(`Exported ${list.length} customers to CSV.`);
  });

  function renderAll() { renderStats(); renderTable(); if (profileId && $('#profilePanel').classList.contains('show')) renderProfile(); }
  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', renderAll);

  renderAll();
  if (LB.param('action') === 'new') { openModal(); LB.clearParams('action'); }
  if (LB.param('q')) LB.clearParams('q');
});
