/* ==========================================================================
   LocalBiz OS — Products (inventory)
   CRUD, search, category/stock filters, sorting, margin preview and
   automatic low-stock warnings.
   ========================================================================== */
LB.page(() => {
  const { $, db, money, num, esc } = LB;
  const form = $('#productForm');
  const statusParam = LB.param('status');
  const state = { q: LB.param('q') || '', category: '', status: statusParam === 'low' ? 'low' : '', sort: 'name-asc' };
  const categories = Object.keys(LB.PRODUCT_CATEGORIES);

  const margin = (p) => (Number(p.sellingPrice) > 0 ? ((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100 : 0);

  function renderStats() {
    const products = db.all('products');
    const low = products.filter(LB.isLowStock);
    const out = products.filter((p) => Number(p.stock) <= 0);
    const costValue = products.reduce((n, p) => n + p.stock * p.purchasePrice, 0);
    const retailValue = products.reduce((n, p) => n + p.stock * p.sellingPrice, 0);
    const cards = [
      ['Total products', num(products.length), 'bi-box-seam', 'tone-accent'],
      ['Stock value (cost)', money(costValue, { round: true }), 'bi-safe', 'tone-info'],
      ['Stock value (retail)', money(retailValue, { round: true }), 'bi-tags', 'tone-success'],
      ['Low / out of stock', `${low.length} / ${out.length}`, 'bi-exclamation-triangle', 'tone-warning']
    ];
    $('#productStats').innerHTML = cards.map(([label, value, icon, tone]) => `
      <div class="col-6 col-lg-3"><div class="lb-card mini-stat">
        <span class="stat-icon ${tone}"><i class="bi ${icon}"></i></span>
        <div><div class="label">${label}</div><div class="value">${value}</div></div>
      </div></div>`).join('');

    // Low-stock warning banner
    const alert = $('#lowStockAlert');
    alert.hidden = !low.length || !LB.settings().notifications.lowStock;
    alert.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i>
      <div class="alert-text flex-grow-1"><strong>${low.length} product${low.length === 1 ? ' needs' : 's need'} restocking.</strong>
      ${low.slice(0, 3).map((p) => esc(p.name)).join(', ')}${low.length > 3 ? ` and ${low.length - 3} more` : ''} ${low.length === 1 ? 'is' : 'are'} at or below the reorder level.</div>
      <button type="button" class="btn btn-sm btn-light text-nowrap" id="showLowBtn">Show items</button>`;
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const [key, dir] = state.sort.split('-');
    const factor = dir === 'asc' ? 1 : -1;
    return db.all('products').filter((p) => {
      if (state.category && p.category !== state.category) return false;
      const status = LB.productStatus(p);
      if (state.status === 'low' && status === 'In stock') return false;
      if (state.status && state.status !== 'low' && status !== state.status) return false;
      return !q || [p.name, p.sku, p.category].some((f) => String(f).toLowerCase().includes(q));
    }).sort((a, b) => {
      if (key === 'name') return a.name.localeCompare(b.name) * factor;
      if (key === 'stock') return (a.stock - b.stock) * factor;
      if (key === 'price') return (a.sellingPrice - b.sellingPrice) * factor;
      return (margin(a) - margin(b)) * factor;
    });
  }

  function renderTable() {
    const list = filtered();
    const total = db.all('products').length;
    if (!list.length) {
      LB.render($('#productsBody'), LB.emptyRow(8, total
        ? { icon: 'bi-search', title: 'No matching products', text: 'Try another search or clear the filters.', action: '<button type="button" class="btn btn-light btn-sm" data-clear>Clear filters</button>' }
        : { icon: 'bi-box-seam', title: 'Your catalogue is empty', text: 'Add your first product to start selling.', action: '<button type="button" class="btn btn-primary btn-sm" data-add><i class="bi bi-plus-lg"></i>Add product</button>' }));
    } else {
      LB.render($('#productsBody'), list.map((p) => {
        const meta = LB.PRODUCT_CATEGORIES[p.category] || LB.PRODUCT_CATEGORIES.Other;
        const status = LB.productStatus(p);
        const level = Math.min(100, (p.stock / Math.max(1, p.minStock * 3)) * 100);
        const barClass = status === 'Out of stock' ? 'bg-danger' : status === 'Low stock' ? 'bg-warning' : 'bg-success';
        return `<tr>
          <td><div class="product-cell">
            <span class="product-thumb ${meta.tone}"><i class="bi ${meta.icon}"></i></span>
            <div><div class="cell-title">${esc(p.name)}</div><div class="cell-sub">${margin(p).toFixed(1)}% margin</div></div>
          </div></td>
          <td><span class="chip">${esc(p.category)}</span></td>
          <td class="mono text-nowrap">${esc(p.sku)}</td>
          <td class="stock-col">
            <div class="d-flex align-items-center gap-2">
              <span class="fw-semibold ${status === 'In stock' ? 'text-body' : status === 'Low stock' ? 'text-warning' : 'text-danger'}">${num(p.stock)}</span>
              ${status !== 'In stock' ? `<i class="bi bi-exclamation-triangle-fill ${status === 'Low stock' ? 'text-warning' : 'text-danger'}" data-bs-toggle="tooltip" title="Reorder level is ${p.minStock}"></i>` : ''}
            </div>
            <div class="progress mt-1" role="progressbar" aria-label="Stock level" aria-valuenow="${Math.round(level)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar ${barClass}" style="width:${Math.max(level, 3)}%"></div></div>
          </td>
          <td class="num">${money(p.purchasePrice)}</td>
          <td class="num fw-semibold text-body">${money(p.sellingPrice)}</td>
          <td>${LB.badge(status)}</td>
          <td class="cell-actions">
            <a href="sales.html?action=new&amp;product=${encodeURIComponent(p.id)}" class="btn btn-icon accent${Number(p.stock) <= 0 ? ' disabled' : ''}" data-bs-toggle="tooltip" title="Sell this product" aria-label="Sell ${esc(p.name)}"><i class="bi bi-bag-plus"></i></a>
            <button type="button" class="btn btn-icon" data-edit="${p.id}" data-bs-toggle="tooltip" title="Edit product" aria-label="Edit ${esc(p.name)}"><i class="bi bi-pencil-square"></i></button>
            <button type="button" class="btn btn-icon danger" data-delete="${p.id}" data-bs-toggle="tooltip" title="Delete product" aria-label="Delete ${esc(p.name)}"><i class="bi bi-trash3"></i></button>
          </td>
        </tr>`;
      }).join(''));
    }
    $('#productsFooter').innerHTML = `<span>Showing <strong>${list.length}</strong> of <strong>${total}</strong> products</span><span><i class="bi bi-info-circle me-1"></i>Stock bars are relative to 3× the reorder level.</span>`;
  }

  function renderAll() { renderStats(); renderTable(); }

  /* ---------- Modal ---------- */
  function suggestSku(category) {
    const prefix = (category || 'Other').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
    const used = db.all('products').map((p) => p.sku);
    let n = 1001;
    while (used.includes(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  function updateMargin() {
    const buy = Number($('#pBuy').value) || 0;
    const sell = Number($('#pSell').value) || 0;
    const profit = sell - buy;
    const pct = sell > 0 ? (profit / sell) * 100 : 0;
    $('#marginPreview').innerHTML = `
      <div><div class="small text-muted">Profit per unit</div><div class="fw-bold ${profit < 0 ? 'text-danger' : ''}">${money(profit)}</div></div>
      <div><div class="small text-muted">Margin</div><div class="fw-bold ${profit < 0 ? 'text-danger' : ''}">${pct.toFixed(1)}%</div></div>
      ${profit < 0 ? '<div class="small text-danger align-self-center"><i class="bi bi-exclamation-circle"></i> Selling below cost</div>' : ''}`;
  }

  function openModal(product) {
    LB.resetForm(form);
    $('#pCategory').innerHTML = LB.options(categories, product ? product.category : 'Grocery');
    $('#productModalTitle').textContent = product ? 'Edit product' : 'Add product';
    $('#saveProductBtn').innerHTML = `<i class="bi bi-check2"></i>${product ? 'Save changes' : 'Save product'}`;
    if (product) LB.fillForm(form, product);
    else {
      form.elements.id.value = '';
      $('#pSku').value = suggestSku('Grocery');
      $('#pStock').value = 0;
    }
    updateMargin();
    LB.modal('#productModal').show();
  }

  $('#pCategory').addEventListener('change', (e) => { if (!form.elements.id.value) $('#pSku').value = suggestSku(e.target.value); });
  form.addEventListener('input', updateMargin);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const sku = $('#pSku');
    sku.value = sku.value.trim().toUpperCase();
    const id = form.elements.id.value;
    const clash = db.all('products').some((p) => p.sku === sku.value && p.id !== id);
    sku.setCustomValidity(clash ? 'SKU already exists' : '');
    $('#skuFeedback').textContent = clash ? 'Another product already uses this SKU.' : 'Use letters, numbers and dashes.';
    if (!LB.validate(form)) return;

    const data = LB.formData(form);
    const existing = id ? db.get('products', id) : null;
    const product = Object.assign({}, existing || { id: LB.uid('p_'), createdAt: LB.date.today() }, {
      name: data.name, category: data.category, sku: sku.value, description: data.description,
      stock: Math.floor(Number(data.stock)), minStock: Math.floor(Number(data.minStock)),
      purchasePrice: LB.round2(data.purchasePrice), sellingPrice: LB.round2(data.sellingPrice)
    });
    db.upsert('products', product);
    LB.modal('#productModal').hide();
    LB.toast(existing ? `${product.name} updated successfully.` : 'Product added successfully.');
    if (LB.isLowStock(product)) setTimeout(() => LB.toast(`${product.name} is at or below its reorder level.`, 'warning'), 400);
  });

  /* ---------- Events ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('#showLowBtn')) { state.status = 'low'; $('#statusFilter').value = 'low'; renderTable(); }
  });

  $('#productsBody').addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) openModal();
    if (e.target.closest('[data-clear]')) clearFilters();
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (edit) openModal(db.get('products', edit.dataset.edit));
    if (del) {
      const p = db.get('products', del.dataset.delete);
      if (!p) return;
      const ok = await LB.confirm({ title: `Delete ${p.name}?`, message: 'It will be removed from your catalogue. Past sales and invoices keep their records.', confirmText: 'Delete product' });
      if (ok) { db.remove('products', p.id); LB.toast(`${p.name} deleted.`, 'info'); }
    }
  });

  function clearFilters() {
    Object.assign(state, { q: '', category: '', status: '' });
    $('#searchInput').value = ''; $('#categoryFilter').value = ''; $('#statusFilter').value = '';
    renderTable();
  }

  $('#categoryFilter').innerHTML = LB.options(categories, '', 'All categories');
  $('#searchInput').value = state.q;
  $('#statusFilter').value = state.status;
  $('#searchInput').addEventListener('input', LB.debounce((e) => { state.q = e.target.value; renderTable(); }, 150));
  $('#categoryFilter').addEventListener('change', (e) => { state.category = e.target.value; renderTable(); });
  $('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; renderTable(); });
  $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderTable(); });
  $('#addProductBtn').addEventListener('click', () => openModal());

  $('#exportBtn').addEventListener('click', () => {
    const list = filtered();
    if (!list.length) { LB.toast('No products to export.', 'warning'); return; }
    const rows = [['Name', 'Category', 'SKU', 'Stock', 'Reorder level', 'Purchase price', 'Selling price', 'Margin %', 'Status']];
    list.forEach((p) => rows.push([p.name, p.category, p.sku, p.stock, p.minStock, p.purchasePrice, p.sellingPrice, margin(p).toFixed(1), LB.productStatus(p)]));
    LB.downloadCSV(`products-${LB.date.today()}.csv`, rows);
    LB.toast(`Exported ${list.length} products to CSV.`);
  });

  document.addEventListener('lb:data', renderAll);
  document.addEventListener('lb:settings', renderAll);

  renderAll();
  if (LB.param('action') === 'new') { openModal(); LB.clearParams('action'); }
  const editId = LB.param('edit');
  if (editId && db.get('products', editId)) { openModal(db.get('products', editId)); LB.clearParams('edit'); }
  if (LB.param('q') || statusParam) LB.clearParams('q', 'status');
});
