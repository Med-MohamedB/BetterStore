/* ==========================================================================
   SelfUpdate — checks update-config.json (same publish pattern as
   ad-config.json) and, if this device is below the required version,
   shows a full-screen BLOCKING screen that cannot be dismissed until the
   person updates. Runs on cold boot and every time the app comes back to
   the foreground (same reasoning as the ad-freshness fix: someone could
   have the app open in the background when a forced update goes out).

   If the device is offline / the check fails for any reason, this does
   nothing at all — the app behaves completely normally. We only ever
   block usage when we've positively confirmed an update is required,
   never as a side effect of a network hiccup.

   The one thing that is NOT automatable, by Android design, not by any
   choice made here: installing the downloaded APK always needs one real
   tap on Android's own system confirmation dialog. See installApk() in
   SelfUpdatePlugin.kt for the full explanation.
   ========================================================================== */

const SelfUpdate = (() => {
  const UPDATE_CONFIG_API_URL = 'https://api.github.com/repos/med-mohamedb/BetterStore/contents/update-config.json?ref=main';
  const UPDATE_CONFIG_RAW_URL = 'https://raw.githubusercontent.com/med-mohamedb/BetterStore/main/update-config.json';
  const DEFAULT_CHANGELOG_URL = 'https://t.me/BetterStoreApp';
  const PENDING_VERSION_KEY = 'sa_pending_update_version';
  const PENDING_PATH_KEY = 'sa_pending_update_path';

  let overlayEl = null;
  let checking = false;

  function isNative() {
    const cap = window.Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  }
  function plugin(name) {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins[name];
  }

  /** "1.9.6" < "1.9.6.2" < "1.9.7" < "1.10.0" — compares left to right,
   *  treating a missing segment as 0, so different segment counts (three
   *  vs four numbers) still compare correctly. */
  function isOlderThan(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x < y) return true;
      if (x > y) return false;
    }
    return false;
  }

  async function fetchUpdateConfig() {
    try {
      const res = await fetch(`${UPDATE_CONFIG_API_URL}&_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github.raw+json' },
      });
      if (res.ok) return await res.json();
    } catch (e) { /* fall through to CDN mirror */ }
    try {
      const res = await fetch(`${UPDATE_CONFIG_RAW_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) return null; // no update ever published — fine
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null; // offline or GitHub unreachable — app just works normally
    }
  }

  /** Cleans up a downloaded APK left over from a PREVIOUS update, once
   *  we've confirmed (by virtue of CURRENT_VERSION now matching or
   *  exceeding what we expected) that it was actually installed
   *  successfully. This has to happen on a later launch — Android kills
   *  the app during its own install step, so there's no "installation
   *  finished" moment inside a still-running session to hook into. */
  async function cleanupIfUpdateSucceeded() {
    const pendingVersion = localStorage.getItem(PENDING_VERSION_KEY);
    if (!pendingVersion) return;
    const current = window.CURRENT_VERSION || '0';
    if (isOlderThan(current, pendingVersion)) return; // still on the old version — leave the file in place
    const path = localStorage.getItem(PENDING_PATH_KEY);
    try {
      const fs = plugin('Filesystem');
      if (fs && path) await fs.deleteFile({ path, directory: 'CACHE' });
    } catch (e) { /* already gone — fine */ }
    localStorage.removeItem(PENDING_VERSION_KEY);
    localStorage.removeItem(PENDING_PATH_KEY);
  }

  async function checkForUpdate() {
    if (checking || !isNative()) return;
    checking = true;
    try {
      await cleanupIfUpdateSucceeded();
      const cfg = await fetchUpdateConfig();
      if (!cfg || !cfg.minVersion || !cfg.downloadUrl) return;
      const current = window.CURRENT_VERSION || '0';
      if (!isOlderThan(current, cfg.minVersion)) {
        removeOverlay();
        return;
      }
      showBlockingScreen(cfg);
    } finally {
      checking = false;
    }
  }

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  }

  function showBlockingScreen(cfg) {
    if (overlayEl) return; // already showing
    const changelogUrl = cfg.changelogUrl || DEFAULT_CHANGELOG_URL;

    overlayEl = document.createElement('div');
    overlayEl.className = 'update-block';
    overlayEl.innerHTML = `
      <div class="update-block__card">
        <div class="update-block__icon">⬆️</div>
        <div class="update-block__title">Better Store Update</div>
        <div class="update-block__version">Version ${escapeHTML(cfg.versionLabel || cfg.minVersion)}</div>
        <div class="update-block__sub">
          v${escapeHTML(cfg.versionLabel || cfg.minVersion)} changelog —
          <a href="#" class="update-block__link">click here</a>
        </div>
        <div class="update-block__progress-wrap" hidden>
          <div class="update-block__progress-track"><div class="update-block__progress-fill"></div></div>
          <div class="update-block__progress-pct">0%</div>
        </div>
        <button class="update-block__btn">Update</button>
        <div class="update-block__note"></div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    overlayEl.querySelector('.update-block__link').addEventListener('click', (e) => {
      e.preventDefault();
      openExternal(changelogUrl);
    });

    const btn = overlayEl.querySelector('.update-block__btn');
    btn.addEventListener('click', () => handleUpdateClick(cfg, overlayEl));
  }

  async function handleUpdateClick(cfg, root) {
    const btn = root.querySelector('.update-block__btn');
    const note = root.querySelector('.update-block__note');
    const progressWrap = root.querySelector('.update-block__progress-wrap');
    const fill = root.querySelector('.update-block__progress-fill');
    const pctEl = root.querySelector('.update-block__progress-pct');

    // Already downloaded from an earlier attempt this session — skip
    // straight to install.
    const pendingVersion = localStorage.getItem(PENDING_VERSION_KEY);
    const pendingPath = localStorage.getItem(PENDING_PATH_KEY);
    if (pendingVersion === (cfg.versionLabel || cfg.minVersion) && pendingPath) {
      return attemptInstall(pendingPath, note, btn);
    }

    const ft = plugin('FileTransfer');
    const fs = plugin('Filesystem');
    if (!ft || !fs) {
      note.textContent = 'Update download isn\u2019t available on this build — please reinstall the app from an official source.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Downloading…';
    progressWrap.hidden = false;
    note.textContent = '';

    try {
      const fileName = 'update.apk';
      const uriResult = await fs.getUri({ directory: 'CACHE', path: fileName });
      const destPath = uriResult.uri;

      const progressHandle = await ft.addListener('progress', (status) => {
        if (!status.lengthComputable) return;
        const pct = Math.min(100, Math.round((status.bytes / status.contentLength) * 100));
        fill.style.width = `${pct}%`;
        pctEl.textContent = `${pct}%`;
      });

      await ft.downloadFile({ url: cfg.downloadUrl, path: destPath, progress: true });
      progressHandle.remove();

      localStorage.setItem(PENDING_VERSION_KEY, cfg.versionLabel || cfg.minVersion);
      localStorage.setItem(PENDING_PATH_KEY, fileName);

      fill.style.width = '100%';
      fill.classList.add('done');
      pctEl.textContent = '100%';
      btn.disabled = false;
      btn.textContent = 'Install Update';
      btn.onclick = () => attemptInstall(fileName, note, btn);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Update';
      note.textContent = 'Download failed — check your connection and try again.';
      console.warn('Update download failed:', e);
    }
  }

  async function attemptInstall(fileNameOrPath, note, btn) {
    const selfUpdate = plugin('SelfUpdate');
    const fs = plugin('Filesystem');
    if (!selfUpdate || !fs) return;

    try {
      const { uri } = await fs.getUri({ directory: 'CACHE', path: fileNameOrPath.includes('/') ? fileNameOrPath.split('/').pop() : fileNameOrPath });
      const { allowed } = await selfUpdate.canInstallPackages();
      if (!allowed) {
        note.textContent = 'Allow installs from this app on the next screen, then come back and tap Install again.';
        await selfUpdate.requestInstallPermission();
        return;
      }
      note.textContent = '';
      await selfUpdate.installApk({ path: uri.replace('file://', '') });
    } catch (e) {
      note.textContent = 'Couldn\u2019t start the install — try again.';
      console.warn('Install failed:', e);
    }
  }

  return { checkForUpdate };
})();
window.SelfUpdate = SelfUpdate;
