/* ==========================================================================
   LocalBiz OS — Settings
   Business profile, theme, currency, notification toggles, account and
   demo-data controls. Everything is saved to localStorage.
   ========================================================================== */
LB.page(() => {
  const { $, $$, esc } = LB;
  const profileForm = $('#profileForm');
  const accountForm = $('#accountForm');

  function loadProfile() {
    const s = LB.settings();
    $('#sType').innerHTML = LB.options(LB.BUSINESS_TYPES, s.businessType);
    LB.fillForm(profileForm, s);
    profileForm.classList.remove('was-validated');
  }

  function loadAccount() {
    const s = LB.settings();
    const session = LB.auth.session() || {};
    accountForm.elements.ownerName.value = s.ownerName;
    accountForm.elements.email.value = session.email || s.email;
    $('#accountHead').innerHTML = `${LB.avatar(s.ownerName, 'avatar-lg')}
      <div><div class="fw-semibold">${esc(s.ownerName)}</div><div class="small text-muted">${esc(session.email || s.email)}</div>
      <span class="demo-pill mt-1"><i class="bi bi-shield-check"></i>Demo account · no password stored</span></div>`;
  }

  function loadPreferences() {
    const s = LB.settings();
    $$('input[name="theme"]').forEach((r) => { r.checked = r.value === s.theme; });
    $$('input[name="currency"]').forEach((r) => { r.checked = r.value === s.currency; });
    $$('[data-notify]').forEach((el) => { el.checked = Boolean(s.notifications[el.dataset.notify]); });
    $('#currencyPreview').textContent = `${LB.money(125000)} · ${LB.money(125000, { compact: true })}`;
  }

  /* ---------- Business profile ---------- */
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!LB.validate(profileForm)) return;
    const data = LB.formData(profileForm);
    data.taxRate = Number(data.taxRate);
    LB.saveSettings(data);
    const user = LB.auth.user();
    if (user) LB.auth.saveUser(Object.assign(user, { businessName: data.businessName, ownerName: data.ownerName, businessType: data.businessType }));
    loadAccount();
    LB.toast('Business profile saved successfully.');
  });
  profileForm.addEventListener('reset', (e) => { e.preventDefault(); loadProfile(); LB.toast('Changes discarded.', 'info', 2000); });

  /* ---------- Appearance, currency, notifications (saved instantly) ---------- */
  $$('input[name="theme"]').forEach((radio) => radio.addEventListener('change', () => {
    LB.saveSettings({ theme: radio.value });
    LB.applyTheme(radio.value);
    const icon = $('[data-action="toggle-theme"] i');
    if (icon) icon.className = `bi ${radio.value === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`;
    LB.toast(`${radio.value === 'dark' ? 'Dark' : 'Light'} mode enabled.`, 'info', 2200);
  }));

  $$('input[name="currency"]').forEach((radio) => radio.addEventListener('change', () => {
    LB.saveSettings({ currency: radio.value });
    loadPreferences();
    LB.toast(`Currency set to ${radio.value}.`, 'info', 2200);
  }));

  $$('[data-notify]').forEach((toggle) => toggle.addEventListener('change', () => {
    const notifications = Object.assign({}, LB.settings().notifications, { [toggle.dataset.notify]: toggle.checked });
    LB.saveSettings({ notifications });
    LB.toast(`${toggle.getAttribute('aria-label')} ${toggle.checked ? 'turned on' : 'turned off'}.`, 'info', 2200);
  }));

  /* ---------- Account ---------- */
  accountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!LB.validate(accountForm)) return;
    const data = LB.formData(accountForm);
    LB.saveSettings({ ownerName: data.ownerName });
    const session = LB.auth.session();
    const remembered = Boolean(LB.store.get(LB.KEYS.session, null));
    if (session) LB.auth.signIn(data.email, remembered);
    const user = LB.auth.user() || {};
    LB.auth.saveUser(Object.assign(user, { ownerName: data.ownerName, email: data.email }));
    accountForm.classList.remove('was-validated');
    loadAccount();
    loadProfile();
    LB.toast('Profile updated successfully.');
  });

  /* ---------- Data ---------- */
  $('#resetDataBtn').addEventListener('click', async () => {
    const ok = await LB.confirm({ title: 'Restore sample data?', message: 'Your current products, customers, sales, payments and expenses will be replaced with fresh demo records.', confirmText: 'Restore data', variant: 'primary', icon: 'bi-arrow-counterclockwise' });
    if (ok) { LB.resetDemoData(); LB.toast('Sample data restored.'); }
  });

  $('#clearDataBtn').addEventListener('click', async () => {
    const ok = await LB.confirm({ title: 'Clear all records?', message: 'Every product, customer, sale, payment and expense will be deleted from this browser. You can restore the sample data later.', confirmText: 'Clear everything' });
    if (!ok) return;
    ['products', 'customers', 'sales', 'payments', 'expenses'].forEach((name) => LB.db.save(name, []));
    LB.toast('All records cleared. Your workspace is empty.', 'info');
  });

  /* ---------- Section nav: highlight the section in view ---------- */
  const links = $$('.settings-nav a');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  $$('.settings-section').forEach((section) => observer.observe(section));

  document.addEventListener('lb:settings', loadPreferences);

  loadProfile();
  loadAccount();
  loadPreferences();
});
