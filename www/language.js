/* ==========================================================================
   Language — the language-selection screen. Two entry points:
     - maybeGate(): runs once at boot, BEFORE Terms/Onboarding, only when
       no language has been chosen yet (a fresh install). This is what
       makes it "the first onboarding screen."
     - openFromMenu(): reopens the exact same screen on demand — wired to
       the "Language" row in More.
   Both resolve once a language is actually picked; maybeGate() resolves
   immediately (without showing anything) if one's already set.
   ========================================================================== */

const Language = (() => {
  /** Renders the picker as a full-screen overlay and resolves the Promise
   *  once a language is chosen. The heading is shown in all three
   *  languages at once — deliberately NOT run through I18n.t(), since the
   *  entire point of this screen is that we don't know the user's
   *  language yet. */
  function render() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'onboard-overlay language-screen';
      overlay.style.opacity = '0';
      document.body.appendChild(overlay);
      Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.25 });

      const detected = I18n.detectDeviceLangCode();
      const artSrc = window.themedIllustration ? themedIllustration('onboard-language', 'onboarding') : 'img/onboarding/onboard-language.webp';
      overlay.innerHTML = `
        <div class="language-screen__inner">
          <div class="language-screen__art"><img src="${artSrc}" alt="" class="onboard-slide__img"></div>
          <div class="language-screen__heading">
            <div>Choose your language</div>
            <div dir="rtl">اختر لغتك</div>
            <div>Choisissez votre langue</div>
          </div>
          <div class="language-screen__list">
            ${I18n.LANGUAGES.map((l) => `
              <button class="language-option tappable${l.code === detected ? ' language-option--detected' : ''}" data-lang="${l.code}">
                <span class="language-option__flag">${l.flag}</span>
                <span class="language-option__name">${l.nativeName}</span>
                ${l.code === detected ? '<span class="language-option__detected-dot"></span>' : ''}
                <span class="language-option__chevron">${Icon('chevron-right', { size: 18 })}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;

      overlay.querySelectorAll('.language-option').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (overlay.dataset.picking) return; // guard against a double-tap firing this twice
          overlay.dataset.picking = '1';
          btn.classList.add('language-option--picked');
          await I18n.setLocale(btn.dataset.lang);
          await Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.2 }).finished;
          overlay.remove();
          resolve();
        });
      });
    });
  }

  /** Called once at boot, before Terms/Onboarding. No-ops instantly if a
   *  language was already chosen (returning users, or anyone who's been
   *  through this once) — this is what makes it safe to call on every
   *  launch rather than needing its own separate "have we shown this"
   *  flag. */
  async function maybeGate() {
    const appearance = await Settings.get('appearance');
    if (appearance.locale) return;
    await render();
  }

  /** Reopens the exact same screen on demand — the "Language" row in
   *  More. Always shows, regardless of whether one's already set. */
  async function openFromMenu() {
    await render();
  }

  return { maybeGate, openFromMenu };
})();
window.Language = Language;
