/**
 * scanner.js — Camera barcode scanner.
 *
 * Uses the native BarcodeDetector API when the browser supports it
 * (fast, no library). Falls back to the bundled ZXing UMD build
 * (vendor/zxing.min.js — shipped locally, no CDN, works fully offline)
 * on browsers that don't.
 *
 * Two modes:
 *   1. Continuous (Scanner.openContinuous) — the camera stays open across
 *      multiple scans, beeping and showing an in-camera result chip after
 *      each one, until the user explicitly taps the close button. Used by
 *      the "scanner" route and POS's Scan button, where scanning several
 *      items in a row is the whole point.
 *   2. One-shot (Scanner.scanOnce) — closes automatically after a single
 *      successful scan and resolves with the code. Used to fill a single
 *      form field (e.g. a product's barcode) without hand-typing it.
 */

const Scanner = (() => {
  const SUPPORTED_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code',
  ];

  // Remembers which physical camera actually has a working flash (or was
  // simply the one the person picked) so we default to it on every future
  // scan — phones with 2-4 rear cameras (main/ultra-wide/macro/depth) only
  // wire the flash to ONE of them, and there's no reliable way to detect
  // which one ahead of time, so the person's own choice is the source of
  // truth here.
  const CAMERA_PREF_KEY = 'sa_scanner_camera_id';

  let stream = null;
  let nativeDetector = null;
  let zxingReader = null;
  let rafId = null;
  let scanning = false;
  let lastResult = null;
  let lastResultAt = 0;
  let overlayEl = null;
  let audioCtx = null;
  let candidateCode = null;
  let candidateCount = 0;
  let availableCameras = [];   // [{deviceId, label}] rear-ish cameras found this session
  let currentCameraIndex = -1;
  let currentHintText = '';    // the "default" hint for the active session, so transient
                                // messages (switching camera, retrying…) can be reverted to it

  /* ---------------------------------------------------------------- */
  /* Beep — synthesized with the Web Audio API, no audio file needed   */
  /* (keeps the app fully offline with zero extra assets).             */
  /* ---------------------------------------------------------------- */

  function playBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1500;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) { /* Web Audio unsupported/blocked — silently skip the beep */ }
  }

  /* ---------------------------------------------------------------- */
  /* Route entry point (dashboard "Scan Product" quick action)          */
  /* ---------------------------------------------------------------- */

  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';
    container.innerHTML = '';
    openContinuous({
      title: 'Scan Product',
      onScan: (code) => lookupAndAddToCart(code),
      onClose: () => Router.goTo(window.POS && POS.hasItems && POS.hasItems() ? 'pos' : 'dashboard'),
    });
  }

  /** Shared "found → add to cart / not found → offer to create" logic,
   * returning a result descriptor the in-camera chip renders. */
  async function lookupAndAddToCart(code) {
    const product = await DB.getByIndex('products', 'barcode', code);
    if (product) {
      if (window.POS && typeof POS.addToCart === 'function') POS.addToCart(product);
      return { text: `✓ ${product.name}`, variant: 'success' };
    }
    return {
      text: `Not found: ${code} — tap to add product`,
      variant: 'warn',
      onTap: () => {
        closeFullscreen();
        setTimeout(() => {
          Products.openForm(null, {
            prefillBarcode: code,
            onSaved: (savedProduct) => {
              if (window.POS && typeof POS.addToCart === 'function') POS.addToCart(savedProduct);
            },
          });
        }, 260);
      },
    };
  }

  /* ---------------------------------------------------------------- */
  /* Continuous mode — stays open across multiple scans                 */
  /* ---------------------------------------------------------------- */

  /** onScan(code) => Promise<{text, variant, onTap?}> | {text, variant, onTap?} */
  function openContinuous({ onScan, onClose, title = 'Scan Barcode' }) {
    openFullscreen({
      title,
      continuous: true,
      onDetected: async (code) => {
        playBeep();
        if (navigator.vibrate) navigator.vibrate(60);
        const result = await onScan(code);
        showResultChip(result);
      },
      onClose: () => { if (onClose) onClose(); },
    });
  }

  /* ---------------------------------------------------------------- */
  /* One-shot mode — closes after the first successful scan             */
  /* ---------------------------------------------------------------- */

  /** Returns a Promise<string|null> — the scanned code, or null if the
   * user closed the scanner without scanning anything. */
  function scanOnce() {
    return new Promise((resolve) => {
      openFullscreen({
        title: 'Scan Barcode',
        continuous: false,
        onDetected: (code) => {
          playBeep();
          if (navigator.vibrate) navigator.vibrate(60);
          closeFullscreen();
          resolve(code);
        },
        onClose: () => resolve(null),
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Shared full-screen camera UI                                       */
  /* ---------------------------------------------------------------- */

  function openFullscreen({ onDetected, onClose, title, continuous }) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'scanner-overlay';
    currentHintText = continuous ? 'Scan as many items as you like, then tap ✕ when done' : 'Point the camera at a barcode';
    overlayEl.innerHTML = `
      <div class="scanner-topbar">
        <button class="icon-btn tappable" id="scanCancelBtn">✕</button>
        <div class="scanner-topbar__title">${title}</div>
        <div class="scanner-topbar__actions">
          <button class="icon-btn tappable" id="scanSwitchBtn" style="display:none;">🔄</button>
          <button class="icon-btn tappable" id="scanTorchBtn">🔦</button>
        </div>
      </div>
      <video id="scanVideo" playsinline muted autoplay></video>
      <div class="scanner-frame">
        <div class="scanner-frame__corner tl"></div>
        <div class="scanner-frame__corner tr"></div>
        <div class="scanner-frame__corner bl"></div>
        <div class="scanner-frame__corner br"></div>
        <div class="scanner-frame__laser"></div>
      </div>
      <div class="scanner-result-chip" id="scanResultChip"></div>
      <div class="scanner-hint" id="scanHint">${currentHintText}</div>
    `;
    document.body.appendChild(overlayEl);
    requestAnimationFrame(() => overlayEl.classList.add('open'));

    overlayEl.querySelector('#scanCancelBtn').addEventListener('click', () => {
      closeFullscreen();
      onClose();
    });

    let torchOn = false;
    const torchBtn = overlayEl.querySelector('#scanTorchBtn');
    torchBtn.addEventListener('click', async () => {
      const target = !torchOn;
      const ok = await toggleTorch(target);
      if (ok) {
        torchOn = target;
        torchBtn.classList.toggle('active', torchOn);
      }
    });

    const switchBtn = overlayEl.querySelector('#scanSwitchBtn');
    switchBtn.addEventListener('click', () => {
      // Flash always turns off across a camera swap (it's a different
      // physical device) — reset the button state up front so it can't
      // show "on" for a torch that's no longer actually lit.
      torchOn = false;
      torchBtn.classList.remove('active');
      openCameraPicker();
    });

    startCamera(overlayEl.querySelector('#scanVideo'), onDetected, continuous);
  }

  function showResultChip(result) {
    const chip = document.getElementById('scanResultChip');
    if (!chip || !result) return;
    chip.textContent = result.text;
    chip.className = `scanner-result-chip show scanner-result-chip--${result.variant || 'success'}`;
    chip.onclick = result.onTap || null;
    chip.style.cursor = result.onTap ? 'pointer' : 'default';
    // Retrigger the pop-in animation on every new result, including
    // repeats of the same variant.
    chip.classList.remove('pop');
    void chip.offsetWidth;
    chip.classList.add('pop');
  }

  function closeFullscreen() {
    stopCamera();
    if (overlayEl) {
      overlayEl.classList.remove('open');
      const el = overlayEl;
      overlayEl = null;
      setTimeout(() => el.remove(), 220);
    }
  }

  async function toggleTorch(on) {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;

    // 1. Standard route: MediaStreamTrack capabilities/constraints.
    // Capabilities can take a moment to populate on some Android Chrome
    // builds — retry a few times, not just once, before giving up.
    let capabilities = track.getCapabilities ? track.getCapabilities() : {};
    for (let i = 0; i < 4 && !capabilities.torch && track.getCapabilities; i++) {
      await new Promise((r) => setTimeout(r, 150));
      capabilities = track.getCapabilities();
    }

    if (capabilities.torch) {
      // Different Chromium/WebView builds accept different shapes of this
      // non-standard constraint — some only honor it wrapped in
      // `advanced`, others only as a top-level constraint. Try both
      // rather than assuming one is correct everywhere.
      const attempts = [
        () => track.applyConstraints({ advanced: [{ torch: on }] }),
        () => track.applyConstraints({ torch: on }),
      ];
      for (const attempt of attempts) {
        try {
          await attempt();
          return true;
        } catch (e) {
          console.warn('Torch constraint attempt failed:', e);
        }
      }
    }

    // 2. Fallback route: the ImageCapture API, which some Chrome/Android
    // WebView versions use for flash control instead of track constraints.
    if ('ImageCapture' in window) {
      try {
        const capture = new ImageCapture(track);
        const photoCaps = await capture.getPhotoCapabilities();
        if (photoCaps.fillLightMode && photoCaps.fillLightMode.includes('flash')) {
          await capture.setOptions({ fillLightMode: on ? 'flash' : 'off' });
          return true;
        }
      } catch (e) {
        console.warn('Torch via ImageCapture failed:', e);
      }
    }

    // 3. Last-resort fallback: some Android Chrome/WebView builds only
    // honor the torch constraint when it's part of the ORIGINAL
    // getUserMedia call, not applied to an already-running track. Turning
    // the torch on re-requests THIS SAME physical camera (by deviceId —
    // never facingMode here, which could silently swap to a *different*
    // camera than the one the person is currently using/switched to) with
    // torch included from the start, and swaps the live video feed to
    // that new stream if it reports torch support; the old stream is
    // stopped once the swap succeeds. Scanning continues uninterrupted
    // since the detector reads whatever the video element is showing.
    if (on) {
      try {
        const settings = track.getSettings ? track.getSettings() : {};
        const deviceId = settings.deviceId;
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, advanced: [{ torch: true }] }
            : { facingMode: 'environment', advanced: [{ torch: true }] },
          audio: false,
        });
        const newTrack = newStream.getVideoTracks()[0];
        const newCaps = newTrack.getCapabilities ? newTrack.getCapabilities() : {};
        if (newCaps.torch) {
          const videoEl = document.getElementById('scanVideo');
          const oldStream = stream;
          stream = newStream;
          if (videoEl) {
            videoEl.srcObject = newStream;
            videoEl.play().catch(() => {});
          }
          if (oldStream) oldStream.getTracks().forEach((t) => t.stop());
          return true;
        }
        newStream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        console.warn('Torch-at-getUserMedia fallback failed:', e);
      }
    }

    // Genuinely unsupported on THIS camera. On a phone with more than one
    // rear camera, that usually just means the flash is wired to a
    // different lens than the one currently active — point at the switch
    // button rather than declaring the whole device unsupported.
    console.warn('Torch unsupported: capabilities were', capabilities);
    if (availableCameras.length > 1) {
      Toast.error('This camera has no flash — try 🔄 to switch cameras');
    } else {
      Toast.error('Flashlight isn\u2019t supported on this browser/device');
    }
    return false;
  }

  // Error names getUserMedia can reject with when the camera is only
  // MOMENTARILY unavailable — most commonly because the previous scanner
  // session's camera hadn't finished being released by the OS yet (very
  // common on Android when the scanner is closed and reopened quickly).
  // These are worth a short retry; permission/config errors are not.
  const TRANSIENT_ERROR_NAMES = ['NotReadableError', 'TrackStartError', 'AbortError'];

  async function acquireStream(preferredDeviceId) {
    const attempts = [];
    if (preferredDeviceId) {
      attempts.push({ video: { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    }
    // Try to get a rear camera specifically (exact) next, falling back
    // progressively if the device can't satisfy that constraint.
    attempts.push(
      { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false },
    );
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async function startCamera(videoEl, onDetected, continuous) {
    // Guard against a leaked stream from any prior session leaving the
    // camera hardware held — starting fresh every time avoids the
    // occasional "camera already in use" failure this would otherwise
    // cause on the very next attempt.
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    const preferredDeviceId = localStorage.getItem(CAMERA_PREF_KEY) || null;
    let lastErr = null;
    for (let attempt = 0; attempt < 2 && !stream; attempt++) {
      try {
        stream = await acquireStream(preferredDeviceId);
      } catch (err) {
        lastErr = err;
        // Only worth a retry if the failure looks transient (camera
        // hardware still settling from a previous release) and we have
        // another attempt left.
        if (attempt === 0 && TRANSIENT_ERROR_NAMES.includes(err && err.name)) {
          await new Promise((r) => setTimeout(r, 450));
          continue;
        }
        break;
      }
    }

    if (!stream) {
      console.error('Camera error:', lastErr);
      showCameraError(lastErr, videoEl, onDetected, continuous);
      return;
    }

    videoEl.srcObject = stream;
    await playVideoWithRetry(videoEl);
    scanning = true;

    enumerateCameras();

    if ('BarcodeDetector' in window) {
      try {
        nativeDetector = new BarcodeDetector({ formats: SUPPORTED_FORMATS });
        scanLoopNative(videoEl, onDetected, continuous);
        return;
      } catch (e) {
        console.warn('Native BarcodeDetector init failed, falling back to ZXing:', e);
      }
    }
    scanLoopZXing(videoEl, onDetected, continuous);
  }

  /** video.play() occasionally rejects transiently (e.g. AbortError right
   * after srcObject is assigned) on some Android WebViews — silently
   * swallowing that, as before, could leave a valid stream attached but
   * never actually painting a frame, which just looks like a frozen black
   * screen. Retry once on 'loadedmetadata' before giving up. */
  function playVideoWithRetry(videoEl) {
    return new Promise((resolve) => {
      videoEl.play().then(resolve).catch(() => {
        const onMeta = () => {
          videoEl.removeEventListener('loadedmetadata', onMeta);
          videoEl.play().catch(() => {}).then(resolve);
        };
        videoEl.addEventListener('loadedmetadata', onMeta);
        // Safety net in case loadedmetadata already fired before we
        // attached the listener.
        setTimeout(() => { videoEl.play().catch(() => {}); resolve(); }, 400);
      });
    });
  }

  /** Shows a clear, actionable error state (with a retry button) instead
   * of leaving the person staring at a plain black screen — which is what
   * a getUserMedia failure otherwise looks like, since the overlay
   * background is solid black. */
  function showCameraError(err, videoEl, onDetected, continuous) {
    const name = err && err.name;
    let message = 'Couldn\u2019t start the camera. Tap to try again.';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      message = 'Camera permission is blocked. Enable it in your browser settings, then tap to try again.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      message = 'No usable camera was found. Tap to try again.';
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      message = 'The camera is busy (another app may be using it). Tap to try again.';
    }
    const hintEl = document.getElementById('scanHint');
    if (!hintEl) return;
    hintEl.innerHTML = `
      <div>${message}</div>
      <button class="btn btn-primary btn-sm mt-8 tappable" id="scanRetryBtn" type="button">Try Again</button>
    `;
    const retryBtn = hintEl.querySelector('#scanRetryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        hintEl.innerHTML = currentHintText;
        startCamera(videoEl, onDetected, continuous);
      });
    }
  }

  /** Populates availableCameras and reveals the switch-camera button once
   * more than one camera is actually present — labels are only readable
   * once permission has been granted, which is guaranteed by this point
   * since we just successfully opened a stream. */
  async function enumerateCameras() {
    if (!navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      availableCameras = devices.filter((d) => d.kind === 'videoinput');
      const track = stream && stream.getVideoTracks()[0];
      const currentId = track && track.getSettings ? track.getSettings().deviceId : null;
      currentCameraIndex = Math.max(0, availableCameras.findIndex((d) => d.deviceId === currentId));

      const switchBtn = document.getElementById('scanSwitchBtn');
      if (switchBtn) switchBtn.style.display = availableCameras.length > 1 ? '' : 'none';
    } catch (e) {
      console.warn('Camera enumeration failed:', e);
    }
  }

  /** Opens a picker sheet listing every camera on the device (labeled,
   * where the browser exposes labels), with the currently-active one
   * highlighted, so the person can go straight to a specific lens instead
   * of stepping through them one at a time. The choice is remembered, so
   * once the lens with the working flash is found, the app opens straight
   * to it from then on. */
  function openCameraPicker() {
    if (availableCameras.length < 2) return;
    const rowsHTML = availableCameras.map((device, i) => {
      const isCurrent = i === currentCameraIndex;
      const label = device.label || `Camera ${i + 1}`;
      return `
        <div class="list-row tappable" data-camera-index="${i}" style="${isCurrent ? 'background:var(--surface-2);' : ''}">
          <div class="list-row__icon">📷</div>
          <div class="list-row__body">
            <div class="list-row__title">${escapeHTML(label)}</div>
            ${isCurrent ? '<div class="list-row__subtitle">Currently in use</div>' : ''}
          </div>
          ${isCurrent ? '<div class="list-row__trailing text-faint">✓</div>' : ''}
        </div>`;
    }).join('');

    const sheetEl = Sheet.open({
      title: 'Choose Camera',
      bodyHTML: `<div class="list">${rowsHTML}</div>`,
    });
    sheetEl.querySelectorAll('[data-camera-index]').forEach((row) => {
      row.addEventListener('click', () => {
        const index = Number(row.dataset.cameraIndex);
        Sheet.close();
        if (index !== currentCameraIndex) selectCamera(index);
      });
    });
  }

  /** Switches the live stream to the given camera (by index into
   * availableCameras) and remembers it as the preferred camera. */
  async function selectCamera(index) {
    const device = availableCameras[index];
    const videoEl = document.getElementById('scanVideo');
    if (!device || !videoEl) return;

    showHint('Switching camera\u2026');

    // Remember enough about the outgoing camera to restore it if the new
    // one fails to open. Then release it BEFORE requesting the new one —
    // most phones only allow ONE physical camera to be held open at a
    // time system-wide, so asking for the new camera while the old one is
    // still active often fails outright (the browser reports it as if no
    // other camera exists at all) rather than actually switching lenses.
    const oldStream = stream;
    const oldTrack = oldStream && oldStream.getVideoTracks()[0];
    const oldDeviceId = oldTrack && oldTrack.getSettings ? oldTrack.getSettings().deviceId : null;
    if (oldStream) oldStream.getTracks().forEach((t) => t.stop());
    stream = null;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stream = newStream;
      currentCameraIndex = index;
      videoEl.srcObject = newStream;
      await playVideoWithRetry(videoEl);
      localStorage.setItem(CAMERA_PREF_KEY, device.deviceId);
      Toast.show(device.label ? `Camera: ${device.label}` : `Camera ${index + 1} of ${availableCameras.length}`);
    } catch (e) {
      console.warn('Switch camera failed:', e);
      Toast.error('Couldn\u2019t switch to that camera');
      // Try to restore whatever was working before, so the person isn't
      // left staring at a dead camera after a failed switch.
      try {
        const restored = await navigator.mediaDevices.getUserMedia({
          video: oldDeviceId ? { deviceId: { exact: oldDeviceId } } : { facingMode: 'environment' },
          audio: false,
        });
        stream = restored;
        videoEl.srcObject = restored;
        await playVideoWithRetry(videoEl);
      } catch (e2) {
        console.warn('Could not restore the previous camera either:', e2);
      }
    } finally {
      showHint(currentHintText, true);
    }
  }

  function scanLoopNative(videoEl, onDetected, continuous) {
    async function tick() {
      if (!scanning) return;
      try {
        const codes = await nativeDetector.detect(videoEl);
        if (codes.length) {
          handleDetection(codes[0].rawValue, onDetected, continuous);
        }
      } catch (e) { /* transient frame errors are normal, ignore */ }
      if (scanning) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function scanLoopZXing(videoEl, onDetected, continuous) {
    if (typeof ZXing === 'undefined') {
      showHint('Barcode scanning isn\u2019t supported in this browser.');
      return;
    }
    zxingReader = new ZXing.BrowserMultiFormatReader();
    zxingReader.decodeFromVideoElement(videoEl, (result, err) => {
      if (!scanning) return;
      if (result) {
        handleDetection(result.getText(), onDetected, continuous);
      }
    }).catch((e) => console.warn('ZXing decode loop ended:', e));
  }

  function handleDetection(code, onDetected, continuous) {
    // Require the SAME code on multiple consecutive frames before
    // accepting it. A single misread from motion blur, glare, or a
    // curved/wavy/damaged label rarely repeats identically twice in a
    // row, so this filters out most bad partial-reads at the cost of
    // only a couple of extra frames (~100ms) on a clean scan.
    const REQUIRED_MATCHES = 2;
    if (code === candidateCode) {
      candidateCount++;
    } else {
      candidateCode = code;
      candidateCount = 1;
    }
    if (candidateCount < REQUIRED_MATCHES) return;
    candidateCode = null;
    candidateCount = 0;

    const now = Date.now();
    // Debounce: ignore repeat detections of the same code within 1.5s so a
    // held-steady barcode doesn't fire the callback dozens of times.
    if (code === lastResult && now - lastResultAt < 1500) return;
    lastResult = code;
    lastResultAt = now;

    if (!continuous) scanning = false; // one-shot mode stops the loop entirely
    onDetected(code);
  }

  function showHint(text) {
    const hintEl = document.getElementById('scanHint');
    if (hintEl) hintEl.textContent = text;
  }

  function stopCamera() {
    scanning = false;
    candidateCode = null;
    candidateCount = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (zxingReader) {
      try { zxingReader.reset(); } catch (e) {}
      zxingReader = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    nativeDetector = null;
    availableCameras = [];
    currentCameraIndex = -1;
  }

  return { render, openContinuous, scanOnce, closeActive: closeFullscreen };
})();

// Safety net: if the route changes away from the scanner (or anywhere,
// while the inline scanner is open from POS) by ANY means — bottom-nav tap,
// swipe gesture, browser back — force the camera closed. The overlay is a
// fixed full-screen element appended outside the router's own view, so the
// router swapping content underneath it does NOT automatically stop the
// camera stream; without this, leaving the scanner screen any way other
// than tapping the close button would leave the camera running indefinitely.
window.addEventListener('hashchange', () => {
  if (document.querySelector('.scanner-overlay')) {
    Scanner.closeActive();
  }
});

Router.register('scanner', Scanner.render);
window.Scanner = Scanner;
