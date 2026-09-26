/* ==========================================================================
   LocalBiz OS — Login & registration (demo only)
   No real authentication happens: passwords are validated in the browser
   and never stored. A session flag in localStorage/sessionStorage unlocks
   the app pages.
   ========================================================================== */
LB.page(() => {
  const { $, $$ } = LB;
  const DEMO_EMAIL = 'demo@localbiz.app';

  // Already signed in? Go straight to the workspace.
  if (LB.auth.session()) { window.location.replace('dashboard.html'); return; }

  /* ---------- Show / hide password ---------- */
  $$('[data-pw-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(`#${btn.dataset.pwToggle}`);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

  /** Sign in, make sure demo data exists and go to the dashboard. */
  function enterWorkspace(email, remember, message) {
    LB.auth.signIn(email, remember);
    if (!LB.store.get(LB.KEYS.seeded, null)) LB.seedDemoData();
    LB.flash(message, 'success');
    window.location.href = 'dashboard.html';
  }

  /* ---------- Login ---------- */
  const loginForm = $('#loginForm');
  if (loginForm) {
    const sample = $('#sampleRevenue');
    if (sample) sample.textContent = LB.money(LB.summarize(LB.date.add(LB.date.today(), -29), LB.date.today()).revenue, { round: true });

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!LB.validate(loginForm)) return;
      const data = LB.formData(loginForm);
      const btn = $('#loginBtn');
      LB.btnLoading(btn, true, 'Signing in…');
      setTimeout(() => {
        const user = LB.auth.user();
        if (!user) LB.auth.saveUser({ email: data.email, ownerName: LB.settings().ownerName, createdAt: LB.date.today() });
        const name = LB.settings().ownerName.split(' ')[0];
        enterWorkspace(data.email.toLowerCase(), Boolean(loginForm.elements.remember.checked), `Welcome back, ${name}!`);
      }, 600);
    });

    $('#demoLoginBtn').addEventListener('click', (e) => {
      $('#loginEmail').value = DEMO_EMAIL;
      $('#loginPassword').value = 'demo1234';
      LB.btnLoading(e.currentTarget, true, 'Opening demo workspace…');
      setTimeout(() => enterWorkspace(DEMO_EMAIL, true, 'You are exploring the demo workspace.'), 600);
    });

    const forgot = $('#forgotForm');
    forgot.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!LB.validate(forgot)) return;
      LB.modal('#forgotModal').hide();
      LB.resetForm(forgot);
      LB.toast('Demo mode: no email was sent. You can sign in with any password of 6+ characters.', 'info', 5000);
    });
  }

  /* ---------- Registration ---------- */
  const regForm = $('#registerForm');
  if (regForm) {
    $('#regType').innerHTML = LB.options(LB.BUSINESS_TYPES, '', 'Select business type');
    const pw = $('#regPassword');
    const confirmPw = $('#regConfirm');
    const meter = $('#pwMeter');
    const hint = $('#pwHint');

    /** Score 0–4 based on length and character variety. */
    function passwordScore(value) {
      if (!value) return 0;
      let score = 0;
      if (value.length >= 8) score++;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
      if (/\d/.test(value)) score++;
      if (/[^A-Za-z0-9]/.test(value)) score++;
      if (value.length >= 12 && score < 4) score++;
      return Math.max(1, Math.min(4, score));
    }

    function checkPasswords() {
      const value = pw.value;
      const score = passwordScore(value);
      meter.dataset.score = score;
      const labels = ['Use 8+ characters with letters, numbers and a symbol.', 'Weak — add more characters and variety.', 'Fair — add numbers or symbols.', 'Good — almost there.', 'Strong password.'];
      hint.textContent = labels[score];
      const valid = value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
      pw.setCustomValidity(value && !valid ? 'Weak password' : '');
      confirmPw.setCustomValidity(confirmPw.value && confirmPw.value !== value ? 'Passwords do not match' : '');
    }
    pw.addEventListener('input', checkPasswords);
    confirmPw.addEventListener('input', checkPasswords);
    $('#acceptTerms').addEventListener('click', () => { $('#regTerms').checked = true; });

    regForm.addEventListener('submit', (e) => {
      e.preventDefault();
      checkPasswords();
      if (!confirmPw.value) confirmPw.setCustomValidity('Required');
      if (!LB.validate(regForm)) return;
      const data = LB.formData(regForm);
      const btn = $('#registerBtn');
      LB.btnLoading(btn, true, 'Creating your workspace…');
      setTimeout(() => {
        // Save basic profile information only — the password is never stored.
        const user = { businessName: data.businessName, ownerName: data.ownerName, email: data.email.toLowerCase(), phone: data.phone, businessType: data.businessType, createdAt: LB.date.today() };
        LB.auth.saveUser(user);
        LB.saveSettings({ businessName: user.businessName, ownerName: user.ownerName, email: user.email, phone: user.phone, businessType: user.businessType });
        enterWorkspace(user.email, true, `Welcome to LocalBiz OS, ${user.ownerName.split(' ')[0]}! Sample data has been added so you can explore.`);
      }, 700);
    });
  }
});
