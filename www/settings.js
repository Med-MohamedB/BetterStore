/**
 * settings.js — Settings.
 *
 * Every field auto-saves on change (no separate "Save" button — this is a
 * settings screen, not a form). Appearance changes apply live via
 * applyTheme(). PIN lock is enforced by Security.checkLock(), called once
 * at boot from app.js before the router renders anything.
 */

const ACCENT_SWATCHES = ['#AC5FDB', '#E3A2EE', '#8A7AE0', '#D9527A', '#7FC49A', '#4FA3F7'];

const SettingsScreen = (() => {
  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';

    const [store, appearance, pos, inventory, security] = await Promise.all([
      Settings.get('store'), Settings.get('appearance'), Settings.get('pos'),
      Settings.get('inventory'), Settings.get('security'),
    ]);

    container.innerHTML = `
      <div class="section-title">Store</div>
      <div class="image-picker tappable" id="logoPicker" style="height:100px;">
        ${store.logo ? `<img src="${store.logo}" alt="">` : `<span class="image-picker__icon">🏬</span><span>Store logo</span>`}
      </div>
      <input type="file" accept="image/*" id="logoInput" style="display:none">
      <div class="field mt-16"><label>Store name</label><input type="text" id="s_name" value="${escapeHTML(store.name)}"></div>
      <div class="field"><label>Phone</label><input type="tel" id="s_phone" value="${escapeHTML(store.phone)}"></div>
      <div class="field"><label>Address</label><input type="text" id="s_address" value="${escapeHTML(store.address)}"></div>
      <div class="field"><label>Currency</label><input type="text" id="s_currency" value="${escapeHTML(store.currency)}" placeholder="DZD" list="currencyList">
        <datalist id="currencyList"><option value="DZD"><option value="USD"><option value="EUR"><option value="MAD"><option value="TND"><option value="GBP"></datalist>
      </div>

      <div class="section-title">Appearance</div>
      <div class="chip-row" id="themeChips">
        ${[['light', '☀️ Light'], ['dark', '🌙 Dark'], ['system', '⚙️ System']].map(([k, label]) => `
          <button class="chip tappable${appearance.theme === k ? ' active' : ''}" data-theme-choice="${k}">${label}</button>
        `).join('')}
      </div>
      <div class="text-dim text-sm mt-8" style="margin-bottom:8px;">Accent color</div>
      <div class="flex gap-8" id="accentSwatches">
        ${ACCENT_SWATCHES.map((c) => `
          <button class="tappable" data-accent="${c}" style="width:34px; height:34px; border-radius:50%; background:${c}; border:2px solid ${c === appearance.accentColor ? 'var(--text)' : 'transparent'};"></button>
        `).join('')}
      </div>

      <div class="section-title">Point of Sale</div>
      <div class="field">
        <label>Default payment method</label>
        <select id="s_defaultPayment">
          ${['cash', 'card', 'bank transfer', 'other'].map((m) => `<option value="${m}" ${pos.defaultPaymentMethod === m ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="card flex-between">
        <span class="text-sm">Enable tax</span>
        <input type="checkbox" id="s_taxEnabled" ${pos.taxEnabled ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      <div class="field mt-8"><label>Tax percentage</label><input type="number" inputmode="decimal" id="s_taxPercent" value="${pos.taxPercent}" min="0" max="100"></div>
      <div class="card flex-between">
        <span class="text-sm">Confirm before completing sale</span>
        <input type="checkbox" id="s_confirmSale" ${pos.confirmBeforeSale ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      <div class="field mt-8"><label>Receipt footer</label><input type="text" id="s_receiptFooter" value="${escapeHTML(pos.receiptFooter)}"></div>

      <div class="section-title">Inventory</div>
      <div class="card flex-between">
        <span class="text-sm">Low-stock warnings</span>
        <input type="checkbox" id="s_lowStockWarn" ${inventory.lowStockWarnings ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      <div class="field mt-8"><label>Default minimum stock</label><input type="number" inputmode="numeric" id="s_defaultMinStock" value="${inventory.defaultMinStock}" min="0"></div>

      <div class="section-title">Security</div>
      <div class="card flex-between">
        <span class="text-sm">Enable PIN lock</span>
        <input type="checkbox" id="s_pinEnabled" ${security.pinEnabled ? 'checked' : ''} style="width:20px;height:20px;">
      </div>
      ${security.pinEnabled ? `<div class="text-dim text-sm mt-8">PIN is set. <button class="chip tappable" id="changePinBtn" style="margin-left:6px;">Change PIN</button></div>` : ''}
      <div class="card flex-between mt-8" id="bioRow" style="display:none;">
        <span class="text-sm">Unlock with Face/Fingerprint</span>
        <input type="checkbox" id="s_bioEnabled" ${security.biometricEnabled ? 'checked' : ''} style="width:20px;height:20px;">
      </div>

      <div class="section-title">Data</div>
      <a class="list-row tappable" href="#backup">
        <div class="list-row__icon">💾</div>
        <div class="list-row__body"><div class="list-row__title">Backup & Restore</div><div class="list-row__subtitle">Export, import, clear data</div></div>
        <div class="list-row__trailing text-faint">›</div>
      </a>

      <div class="section-title">About</div>
      <div class="list-row tappable" id="aboutAppRow">
        <div class="list-row__icon">ℹ️</div>
        <div class="list-row__body"><div class="list-row__title">About This App</div><div class="list-row__subtitle">Credits, contact & support</div></div>
        <div class="list-row__trailing text-faint">›</div>
      </div>
    `;

    wireStoreFields(container, store);
    wireAppearance(container, appearance);
    wirePOSFields(container, pos);
    wireInventoryFields(container, inventory);
    wireSecurity(container, security);
    container.querySelector('#aboutAppRow').addEventListener('click', openAboutSheet);
  }

  function copyRow(label, value) {
    return `
      <div class="list-row tappable" data-copy-value="${escapeHTML(value)}">
        <div class="list-row__body">
          <div class="list-row__title">${escapeHTML(label)}</div>
          <div class="list-row__subtitle num">${escapeHTML(value)}</div>
        </div>
        <div class="list-row__trailing text-faint">📋</div>
      </div>
    `;
  }

  function openAboutSheet() {
    const bodyHTML = `
      <div style="text-align:center;">
        <img src="assets/about-me.jpg" alt="" style="width:96px; height:96px; border-radius:50%; object-fit:cover; border:2px solid var(--border);">
        <div style="font-weight:700; font-size:17px; margin-top:10px;">Better Store</div>
        <div class="text-dim text-sm mt-8">Made by <a href="#" id="aboutOwnerLink" style="color:var(--accent);">@rwgmo</a> on Telegram</div>
      </div>

      <div class="card mt-16">
        <div class="text-sm">
          © All rights reserved. This app may not be resold or redistributed.
          Use is permitted only for parties explicitly approved by the owner.
        </div>
      </div>

      <div class="section-title">Contact & Shop</div>
      <a class="list-row tappable" id="aboutTelegramLink" href="#">
        <div class="list-row__icon">💬</div>
        <div class="list-row__body"><div class="list-row__title">Telegram</div><div class="list-row__subtitle">t.me/rwgmo</div></div>
        <div class="list-row__trailing text-faint">›</div>
      </a>
      <a class="list-row tappable" id="aboutShopLink" href="#">
        <div class="list-row__icon">🛍️</div>
        <div class="list-row__body"><div class="list-row__title">Telegram Shop</div><div class="list-row__subtitle">t.me/RwmShop</div></div>
        <div class="list-row__trailing text-faint">›</div>
      </a>

      <div class="card mt-16">
        <div class="text-sm">Open for app development and custom projects at affordable rates — reach out on Telegram.</div>
      </div>

      <div class="section-title">Support / Donate</div>
      <div class="list" id="aboutDonateList">
        ${copyRow('CCP Account', '007 99999 0042725714 28')}
        ${copyRow('Binance ID', '814491654')}
      </div>

      <div class="text-faint text-sm" style="text-align:center; margin-top:20px;" id="aboutVersionFooter">Better Store</div>
    `;

    const sheetEl = Sheet.open({ title: 'About This App', bodyHTML });
    getAppVersionLabel().then((label) => {
      const el = sheetEl.querySelector('#aboutVersionFooter');
      if (el) el.textContent = `Better Store · ${label}`;
    });

    const goTelegram = () => openExternal('https://t.me/rwgmo');
    sheetEl.querySelector('#aboutOwnerLink').addEventListener('click', (e) => { e.preventDefault(); goTelegram(); });
    sheetEl.querySelector('#aboutTelegramLink').addEventListener('click', (e) => { e.preventDefault(); goTelegram(); });
    sheetEl.querySelector('#aboutShopLink').addEventListener('click', (e) => { e.preventDefault(); openExternal('https://t.me/RwmShop'); });

    sheetEl.querySelectorAll('[data-copy-value]').forEach((row) => {
      row.addEventListener('click', async () => {
        const ok = await copyToClipboard(row.dataset.copyValue);
        Toast.show(ok ? 'Copied' : 'Couldn\u2019t copy \u2014 long-press to select manually');
      });
    });
  }

  function wireStoreFields(container, store) {
    const save = async (patch) => { await Settings.set('store', patch); await Fmt.init(); };
    container.querySelector('#s_name').addEventListener('change', (e) => save({ name: e.target.value.trim() }));
    container.querySelector('#s_phone').addEventListener('change', (e) => save({ phone: e.target.value.trim() }));
    container.querySelector('#s_address').addEventListener('change', (e) => save({ address: e.target.value.trim() }));
    container.querySelector('#s_currency').addEventListener('change', (e) => save({ currency: e.target.value.trim().toUpperCase() || 'DZD' }));

    const picker = container.querySelector('#logoPicker');
    const fileInput = container.querySelector('#logoInput');
    picker.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const dataUrl = await compressLogoToDataURL(file);
      picker.innerHTML = `<img src="${dataUrl}" alt="">`;
      await save({ logo: dataUrl });
      Toast.success('Logo updated');
    });
  }

  function compressLogoToDataURL(file, maxWidth = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function wireAppearance(container) {
    container.querySelectorAll('[data-theme-choice]').forEach((chip) => {
      chip.addEventListener('click', async () => {
        await Settings.set('appearance', { theme: chip.dataset.themeChoice });
        await applyTheme();
        container.querySelectorAll('[data-theme-choice]').forEach((c) => c.classList.toggle('active', c === chip));
        Toast.success('Theme updated');
      });
    });
    container.querySelectorAll('[data-accent]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const color = btn.dataset.accent;
        await Settings.set('appearance', { accentColor: color });
        await applyTheme();
        container.querySelectorAll('[data-accent]').forEach((b) => {
          b.style.border = `2px solid ${b.dataset.accent === color ? 'var(--text)' : 'transparent'}`;
        });
      });
    });
  }

  function wirePOSFields(container) {
    const save = (patch) => Settings.set('pos', patch);
    container.querySelector('#s_defaultPayment').addEventListener('change', (e) => save({ defaultPaymentMethod: e.target.value }));
    container.querySelector('#s_taxEnabled').addEventListener('change', (e) => save({ taxEnabled: e.target.checked }));
    container.querySelector('#s_taxPercent').addEventListener('change', (e) => save({ taxPercent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) }));
    container.querySelector('#s_confirmSale').addEventListener('change', (e) => save({ confirmBeforeSale: e.target.checked }));
    container.querySelector('#s_receiptFooter').addEventListener('change', (e) => save({ receiptFooter: e.target.value.trim() }));
  }

  function wireInventoryFields(container) {
    const save = (patch) => Settings.set('inventory', patch);
    container.querySelector('#s_lowStockWarn').addEventListener('change', (e) => save({ lowStockWarnings: e.target.checked }));
    container.querySelector('#s_defaultMinStock').addEventListener('change', (e) => save({ defaultMinStock: Math.max(0, parseInt(e.target.value, 10) || 0) }));
  }

  function wireSecurity(container, security) {
    const bioRow = container.querySelector('#bioRow');
    if (security.pinEnabled) {
      Security.isBiometricAvailable().then((available) => {
        if (available) bioRow.style.display = '';
      });
    }

    container.querySelector('#s_pinEnabled').addEventListener('change', async (e) => {
      if (e.target.checked) {
        Security.promptSetPin((pin) => {
          if (pin) { render(container); Toast.success('PIN lock enabled'); }
          else { e.target.checked = false; }
        });
      } else {
        await Settings.set('security', { pinEnabled: false, pin: null, biometricEnabled: false, biometricCredentialId: null });
        render(container);
        Toast.show('PIN lock disabled');
      }
    });
    const changeBtn = container.querySelector('#changePinBtn');
    if (changeBtn) changeBtn.addEventListener('click', () => {
      Security.promptSetPin((pin) => { if (pin) Toast.success('PIN updated'); });
    });

    const bioToggle = container.querySelector('#s_bioEnabled');
    if (bioToggle) {
      bioToggle.addEventListener('change', async (e) => {
        if (e.target.checked) {
          const ok = await Security.registerBiometric();
          if (ok) {
            Toast.success('Biometric unlock enabled');
          } else {
            e.target.checked = false;
            Toast.error('Couldn\u2019t set up biometric unlock');
          }
        } else {
          await Settings.set('security', { biometricEnabled: false, biometricCredentialId: null });
          Toast.show('Biometric unlock disabled');
        }
      });
    }
  }

  return { render };
})();

Router.register('settings', SettingsScreen.render);
window.SettingsScreen = SettingsScreen;

/* ---------------------------------------------------------------------- */
/* Security — PIN entry keypad + boot-time lock gate                       */
/* ---------------------------------------------------------------------- */

const Security = (() => {
  function keypadHTML(dotCount) {
    const dots = Array.from({ length: 6 }, (_, i) => `<span class="pin-dot${i < dotCount ? ' filled' : ''}"></span>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return `
      <div class="pin-dots">${dots}</div>
      <div class="pin-keypad">
        ${keys.map((k) => (k === '' ? '<div></div>' : `<button class="pin-key tappable" data-key="${k}">${k}</button>`)).join('')}
      </div>`;
  }

  /** Full-screen overlay to CHOOSE a new PIN (used from Settings). */
  function promptSetPin(onDone) {
    let entered = '';
    const overlay = document.createElement('div');
    overlay.className = 'pin-overlay open';
    overlay.innerHTML = `
      <div class="pin-title" id="pinTitle">Set a PIN</div>
      <div class="pin-sub">Choose a 4-6 digit PIN, then tap another key to confirm</div>
      ${keypadHTML(0)}
      <button class="btn btn-secondary mt-16 tappable" id="pinCancel" style="max-width:200px;">Cancel</button>
    `;
    document.body.appendChild(overlay);

    let stage = 'first';
    let firstPin = '';
    let debounce;

    function updateDots() {
      overlay.querySelectorAll('.pin-dot').forEach((d, i) => d.classList.toggle('filled', i < entered.length));
    }
    function reset(msg) {
      entered = '';
      updateDots();
      if (msg) overlay.querySelector('.pin-sub').textContent = msg;
    }

    async function finishEntry() {
      clearTimeout(debounce);
      if (entered.length < 4) return;
      if (stage === 'first') {
        firstPin = entered;
        stage = 'confirm';
        reset('Confirm your PIN');
        overlay.querySelector('#pinTitle').textContent = 'Confirm PIN';
      } else if (entered === firstPin) {
        await Settings.set('security', { pinEnabled: true, pin: firstPin });
        overlay.remove();
        onDone(firstPin);
      } else {
        reset('PINs didn\u2019t match \u2014 try again');
        stage = 'first';
        overlay.querySelector('#pinTitle').textContent = 'Set a PIN';
      }
    }

    overlay.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === '⌫') { entered = entered.slice(0, -1); updateDots(); return; }
        if (entered.length >= 6) return;
        entered += key;
        updateDots();
        clearTimeout(debounce);
        if (entered.length === 6) finishEntry();
        else if (entered.length >= 4) debounce = setTimeout(finishEntry, 600);
      });
    });

    overlay.querySelector('#pinCancel').addEventListener('click', () => {
      overlay.remove();
      onDone(null);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Biometric unlock (WebAuthn platform authenticator — Face ID / Touch  */
  /* ID / Android fingerprint). Registers a local credential and later    */
  /* re-verifies it; there's no server, so this gates access to THIS      */
  /* device's data rather than proving identity to a backend — that's     */
  /* the right model for a fully local/offline app.                      */
  /* ---------------------------------------------------------------- */

  function bufToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function base64ToBuf(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  }

  /* Running inside the wrapped Android app (Capacitor) rather than a
     regular browser tab? WebAuthn platform authenticators aren't
     available inside Capacitor's WebView, so biometric unlock there
     goes through a small native plugin (BiometricAuth) that calls
     Android's BiometricPrompt directly instead. */
  function isNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function nativeBiometric() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricAuth;
  }

  async function isBiometricAvailable() {
    if (isNativeApp()) {
      const plugin = nativeBiometric();
      if (!plugin) return false;
      try { return !!(await plugin.isAvailable()).available; }
      catch (e) { return false; }
    }
    if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch (e) { return false; }
  }

  async function registerBiometric() {
    if (isNativeApp()) {
      const plugin = nativeBiometric();
      if (!plugin) return false;
      try {
        const result = await plugin.verify({ reason: 'Confirm your fingerprint or face to enable biometric unlock' });
        if (!result || !result.verified) return false;
        // No WebAuthn credential exists on native — the OS-level
        // BiometricPrompt itself is the gate, so a fixed marker is
        // stored instead of a real credential id.
        await Settings.set('security', { biometricEnabled: true, biometricCredentialId: 'native' });
        return true;
      } catch (e) {
        console.warn('Native biometric registration failed or was cancelled:', e);
        return false;
      }
    }
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Better Store' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: 'store-owner',
            displayName: 'Store Owner',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
          attestation: 'none',
        },
      });
      if (!credential) return false;
      await Settings.set('security', { biometricEnabled: true, biometricCredentialId: bufToBase64(credential.rawId) });
      return true;
    } catch (e) {
      console.warn('Biometric registration failed or was cancelled:', e);
      return false;
    }
  }

  async function verifyBiometric(credentialId) {
    if (isNativeApp()) {
      const plugin = nativeBiometric();
      if (!plugin) return false;
      try {
        const result = await plugin.verify({ reason: 'Unlock Better Store' });
        return !!(result && result.verified);
      } catch (e) {
        console.warn('Native biometric verification failed or was cancelled:', e);
        return false;
      }
    }
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: base64ToBuf(credentialId), type: 'public-key' }],
          userVerification: 'required',
          timeout: 60000,
        },
      });
      return !!assertion;
    } catch (e) {
      console.warn('Biometric verification failed or was cancelled:', e);
      return false;
    }
  }

  /** Full-screen overlay to UNLOCK the app at boot. Resolves when unlocked. */
  function showLockScreen(security) {
    return new Promise((resolve) => {
      let entered = '';
      const canBiometric = security.biometricEnabled && security.biometricCredentialId;
      const overlay = document.createElement('div');
      overlay.className = 'pin-overlay open';
      overlay.innerHTML = `
        <div class="pin-title">🔒 Enter PIN</div>
        <div class="pin-sub" id="pinLockSub">Enter your PIN to unlock</div>
        ${keypadHTML(0)}
        ${canBiometric ? `<button class="btn btn-secondary mt-16 tappable" id="bioBtn" style="max-width:240px;">👆 Use Face/Fingerprint</button>` : ''}
      `;
      document.body.appendChild(overlay);

      function updateDots() {
        overlay.querySelectorAll('.pin-dot').forEach((d, i) => d.classList.toggle('filled', i < entered.length));
      }
      function unlock() {
        overlay.remove();
        resolve();
      }

      overlay.querySelectorAll('[data-key]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.key;
          if (key === '⌫') { entered = entered.slice(0, -1); updateDots(); return; }
          if (entered.length >= 6) return;
          entered += key;
          updateDots();
          if (entered.length === security.pin.length) {
            if (entered === security.pin) {
              unlock();
            } else {
              if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
              overlay.querySelector('#pinLockSub').textContent = 'Incorrect PIN \u2014 try again';
              overlay.querySelector('.pin-dots').classList.add('shake');
              setTimeout(() => {
                entered = '';
                updateDots();
                overlay.querySelector('.pin-dots').classList.remove('shake');
              }, 350);
            }
          }
        });
      });

      const bioBtn = overlay.querySelector('#bioBtn');
      async function tryBiometric() {
        if (!bioBtn) return;
        bioBtn.textContent = '👆 Checking\u2026';
        const ok = await verifyBiometric(security.biometricCredentialId);
        if (ok) { unlock(); return; }
        bioBtn.textContent = '👆 Use Face/Fingerprint';
      }
      if (bioBtn) {
        bioBtn.addEventListener('click', tryBiometric);
        // Offer biometric immediately on open so it's a one-tap unlock in
        // the common case, without blocking the PIN as a fallback.
        setTimeout(tryBiometric, 300);
      }
    });
  }

  /** Called once at boot — blocks until unlocked, if PIN lock is enabled. */
  async function checkLock() {
    const security = await Settings.get('security');
    if (security.pinEnabled && security.pin) {
      await showLockScreen(security);
    }
  }

  return { promptSetPin, checkLock, isBiometricAvailable, registerBiometric };
})();
window.Security = Security;
