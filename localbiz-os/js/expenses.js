/* ==========================================================================
   LocalBiz OS — Expenses
   CRUD, search, category/month/method filters, totals and a live
   category breakdown for whatever is currently filtered.
   ========================================================================== */
LB.page(() => {
  const { $, db, date, money, esc } = LB;
  const form = $('#expenseForm');
  const categories = Object.keys(LB.EXPENSE_CATEGORIES);
  const methods = LB.PAYMENT_METHODS.filter((m) => m !== 'Credit');
  const state = { q: '', category: '', month: '', method: '', page: 1 };

  function renderStats() {
    const all = db.all('expenses');
    const today = date.today();
    const thisMonth = all.filter((e) => e.date >= date.startOfMonth(today));
    const lastMonthStart = date.startOfMonth(date.add(date.startOfMonth(today), -1));
    const lastMonth = all.filter((e) => e.date >= lastMonthStart && e.date < date.startOfMonth(today));
    const sum = (list) => list.reduce((n, e) => n + Number(e.amount), 0);
    const byCat = {};
    all.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const cards = [
      ['Total expenses', money(sum(all), { round: true }), 'bi-wallet2', 'tone-accent'],
      ['This month', money(sum(thisMonth), { round: true }), 'bi-calendar-month', 'tone-warning'],
      ['Last month', money(sum(lastMonth), { round: true }), 'bi-calendar-check', 'tone-info'],
      ['Largest category', top ? esc(top[0]) : '—', 'bi-pie-chart', 'tone-danger']
    ];
    $('#expenseStats').innerHTML = cards.map(([label, value, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="lb-card mini-stat">
        <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        <div><div class="label">${label}</div><div class="value">${value}</div></div>
      </div></div>`).join('');
  }

  function fillFilters() {
    const months = [...new Set(db.all('expenses').map((e) => e.date.slice(0, 7)))].sort().reverse();
    $('#categoryFilter').innerHTML = LB.options(categories, state.category, 'All categories');
    $('#monthFilter').innerHTML = LB.options(months.map((m) => ({ value: m, label: date.format(`${m}-01`, { month: 'long', year: 'numeric' }) })), state.month, 'All months');
    $('#methodFilter').innerHTML = LB.options(methods, state.method, 'All methods');
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return db.all('expenses').filter((e) => {
      if (state.category && e.category !== state.category) return false;
      if (state.month && !e.date.startsWith(state.month)) return false;
      if (state.method && e.method !== state.method) return false;
      return !q || [e.name, e.category, e.notes].some((f) => String(f || '').toLowerCase().includes(q));
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  function renderTable() {
    const list = filtered();
    const p = LB.paginate(list, state.page, 10);
    state.page = p.page;
    const total = list.reduce((n, e) => n + Number(e.amount), 0);

    if (!list.length) {
      LB.render($('#expensesBody'), LB.emptyRow(6, db.all('expenses').length
        ? { icon: 'bi-search', title: 'No matching expenses', text: 'Try another search or clear the filters.', action: '<button type="button" class="btn btn-light btn-sm" data-clear>Clear filters</button>' }
        : { icon: 'bi-wallet2', title: 'No expenses recorded', text: 'Track rent, bills and purchases to see your real profit.', action: '<button type="button" class="btn btn-primary btn-sm" data-add><i class="bi bi-plus-lg"></i>Add expense</button>' }));
    } else {
      LB.render($('#expensesBody'), p.items.map((e) => {
        const meta = LB.EXPENSE_CATEGORIES[e.category] || LB.EXPENSE_CATEGORIES.Other;
        return `<tr>
          <td><div class="product-cell">
            <span class="product-thumb tone-neutral"><i class="bi ${meta.icon}"></i></span>
            <div class="min-w-0"><div class="cell-title">${esc(e.name)}</div>${e.notes ? `<div class="cell-sub text-truncate">${esc(e.notes)}</div>` : ''}</div>
          </div></td>
          <td><span class="chip"><span class="legend-dot" style="background:${meta.color}"></span>${esc(e.category)}</span></td>
          <td class="text-nowrap">${date.format(e.date)}</td>
          <td>${esc(e.method)}</td>
          <td class="num fw-semibold text-body">${money(e.amount)}</td>
          <td class="cell-actions">
            <button type="button" class="btn btn-icon" data-edit="${e.id}" data-bs-toggle="tooltip" title="Edit expense" aria-label="Edit ${esc(e.name)}"><i class="bi bi-pencil-square"></i></button>
            <button type="button" class="btn btn-icon danger" data-delete="${e.id}" data-bs-toggle="tooltip" title="Delete expense" aria-label="Delete ${esc(e.name)}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
      }).join(''));
    }
    $('#filteredTotal').innerHTML = list.length ? `Total for ${list.length} expense${list.length === 1 ? '' : 's'}: <strong class="text-body">${money(total)}</strong>` : '';
    LB.renderPager($('#expensesPager'), p, (page) => { state.page = page; renderTable(); }, 'expenses');
    $('#expensesPager').firstElementChild && $('#expensesPager').firstElementChild.classList.add('d-none', 'd-md-inline');
    renderBreakdown(list, total);
  }

  function renderBreakdown(list, total) {
    const byCat = {};
    list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    $('#breakdownSub').textContent = state.category || state.month || state.method || state.q ? 'For the current filters' : 'All recorded expenses';
    if (!rows.length) {
      $('#categoryBreakdown').innerHTML = LB.emptyState({ icon: 'bi-pie-chart', title: 'Nothing to show', text: 'Category totals will appear here.', compact: true });
      return;
    }
    $('#categoryBreakdown').innerHTML = `<ul class="rank-list">${rows.map(([cat, amount]) => {
      const meta = LB.EXPENSE_CATEGORIES[cat] || LB.EXPENSE_CATEGORIES.Other;
      const share = total ? (amount / total) * 100 : 0;
      return `<li>
        <div class="rank-row"><span class="stat-icon sm tone-neutral"><i class="bi ${meta.icon}"></i></span><span class="name">${esc(cat)}</span><span class="val">${money(amount, { round: true })}</span></div>
        <div class="d-flex align-items-center gap-2"><div class="progress flex-grow-1" role="progressbar" aria-label="${esc(cat)} share" aria-valuenow="${Math.round(share)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${share}%;background:${meta.color}"></div></div><span class="small text-muted tabular">${share.toFixed(1)}%</span></div>
      </li>`;
    }).join('')}</ul>
    <div class="calc-row total mt-3"><span>Total</span><span>${money(total)}</span></div>`;
  }

  /* ---------- Modal ---------- */
  function openModal(expense) {
    LB.resetForm(form);
    $('#eCategory').innerHTML = LB.options(categories, expense ? expense.category : 'Other');
    $('#eMethod').innerHTML = LB.options(methods, expense ? expense.method : 'Cash');
    $('#eDate').max = date.today();
    $('#expenseModalTitle').textContent = expense ? 'Edit expense' : 'Add expense';
    $('#saveExpenseBtn').innerHTML = `<i class="bi bi-check2"></i>${expense ? 'Save changes' : 'Save expense'}`;
    if (expense) LB.fillForm(form, expense);
    else { form.elements.id.value = ''; $('#eDate').value = date.today(); }
    LB.modal('#expenseModal').show();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!LB.validate(form)) return;
    const data = LB.formData(form);
    const existing = data.id ? db.get('expenses', data.id) : null;
    const expense = Object.assign({}, existing || { id: LB.uid('e_'), createdAt: Date.now() }, {
      name: data.name, category: data.category, amount: LB.round2(data.amount), date: data.date, method: data.method, notes: data.notes
    });
    db.upsert('expenses', expense);
    LB.modal('#expenseModal').hide();
    LB.toast(existing ? 'Expense updated successfully.' : 'Expense added successfully.');
  });

  /* ---------- Events ---------- */
  $('#expensesBody').addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) openModal();
    if (e.target.closest('[data-clear]')) clearFilters();
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (edit) openModal(db.get('expenses', edit.dataset.edit));
    if (del) {
      const x = db.get('expenses', del.dataset.delete);
      if (!x) return;
      const ok = await LB.confirm({ title: 'Delete this expense?', message: `“${x.name}” (${money(x.amount)}) will be removed permanently.`, confirmText: 'Delete expense' });
      if (ok) { db.remove('expenses', x.id); LB.toast('Expense deleted.', 'info'); }
    }
  });

  function clearFilters() {
    Object.assign(state, { q: '', category: '', month: '', method: '', page: 1 });
    $('#searchInput').value = '';
    fillFilters();
    renderTable();
  }

  $('#searchInput').addEventListener('input', LB.debounce((e) => { state.q = e.target.value; state.page = 1; renderTable(); }, 150));
  ['category', 'month', 'method'].forEach((key) => $(`#${key}Filter`).addEventListener('change', (e) => { state[key] = e.target.value; state.page = 1; renderTable(); }));
  $('#addExpenseBtn').addEventListener('click', () => openModal());

  $('#exportBtn').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) { LB.toast('No expenses to export.', 'warning'); return; }
    const rows = [['Expense', 'Category', 'Date', 'Payment method', 'Amount', 'Notes']];
    list.forEach((e) => rows.push([e.name, e.category, e.date, e.method, e.amount, e.notes]));
    LB.downloadCSV(`expenses-${date.today()}.csv`, rows);
    LB.toast(`Exported ${list.length} expenses to CSV.`);
  });

  function renderAll() { fillFilters(); renderStats(); renderTable(); }
  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', renderAll);

  renderAll();
  if (LB.param('action') === 'new') { openModal(); LB.clearParams('action'); }
});
