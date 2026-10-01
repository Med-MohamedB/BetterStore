/* ==========================================================================
   profile.js — Profile screen (route: 'profile').

   Signed out: shows the exact same sign-in hero as onboarding's last
   slide (Auth.heroHTML), since this IS the other place that same design
   needs to live. Signed in: account info, connected-services status
   (Drive backup — infrastructure only until Feature 6 ships), and the
   privacy controls (opt out, delete account, Privacy Policy, Terms).
   ========================================================================== */

const Profile = (() => {
  async function render(container) {
    document.getElementById('topbarActions').innerHTML = '';
    const profile = await Auth.currentProfile();

    if (!Auth.isSignedIn(profile)) {
      container.innerHTML = Auth.heroHTML('profile');
      Auth.wireHero(container, () => render(container));
      return;
    }

    const privacy = await Settings.get('privacy');

    container.innerHTML = `
      <div style="text-align:center; padding-top:8px;">
        <div class="profile-avatar">
          ${profile.photoUrl ? `<img src="${profile.photoUrl}" alt="">` : Icon('user', { size: 32 })}
        </div>
        <div style="font-weight:800; font-size:19px; margin-top:12px;">${escapeHTML(profile.name || '')}</div>
        ${profile.email ? `<div class="text-dim text-sm">${escapeHTML(profile.email)}</div>` : ''}
      </div>

      <div class="section-title">${I18n.t('profile.connectedTitle')}</div>
      <div class="list">
        <div class="list-row">
          <div class="list-row__icon">${Icon('upload')}</div>
          <div class="list-row__body">
            <div class="list-row__title">${I18n.t('profile.driveBackupTitle')}</div>
            <div class="list-row__subtitle">${I18n.t('profile.driveBackupComingSoon')}</div>
          </div>
        </div>
      </div>

      <div class="section-title">${I18n.t('profile.privacyTitle')}</div>
      <div class="list">
        <div class="list-row" id="optOutRow">
          <div class="list-row__icon">${Icon('eye-off')}</div>
          <div class="list-row__body">
            <div class="list-row__title">${I18n.t('profile.optOutTitle')}</div>
            <div class="list-row__subtitle">${I18n.t('profile.optOutSub')}</div>
          </div>
          <div class="list-row__trailing">
            <input type="checkbox" id="optOutToggle" ${privacy.analyticsOptOut ? 'checked' : ''} style="width:20px;height:20px;">
          </div>
        </div>
        <div class="list-row tappable" id="deleteAccountRow">
          <div class="list-row__icon warn">${Icon('trash')}</div>
          <div class="list-row__body"><div class="list-row__title" style="color:var(--coral);">${I18n.t('profile.deleteAccountTitle')}</div></div>
        </div>
      </div>

      <div class="list mt-16">
        <div class="list-row tappable" id="privacyPolicyRow">
          <div class="list-row__icon">${Icon('scroll')}</div>
          <div class="list-row__body"><div class="list-row__title">${I18n.t('privacy.title')}</div></div>
          <div class="list-row__trailing">${Icon('chevron-right', { size: 16 })}</div>
        </div>
        <div class="list-row tappable" id="termsRow">
          <div class="list-row__icon">${Icon('scroll')}</div>
          <div class="list-row__body"><div class="list-row__title">${I18n.t('terms.title')}</div></div>
          <div class="list-row__trailing">${Icon('chevron-right', { size: 16 })}</div>
        </div>
      </div>

      <button class="btn btn-secondary mt-16 tappable" id="profileSignOutBtn">${I18n.t('settings.signOut')}</button>
    `;

    container.querySelector('#privacyPolicyRow').addEventListener('click', () => Privacy.show());
    container.querySelector('#termsRow').addEventListener('click', () => Terms.show());

    container.querySelector('#optOutToggle').addEventListener('change', async (e) => {
      await Settings.set('privacy', { analyticsOptOut: e.target.checked });
      Toast.success(e.target.checked ? I18n.t('profile.optedOutToast') : I18n.t('profile.optedInToast'));
    });

    container.querySelector('#profileSignOutBtn').addEventListener('click', async () => {
      if (!(await Confirm.show(I18n.t('settings.signOutConfirm'), { danger: true }))) return;
      await Auth.signOut();
      Toast.success(I18n.t('settings.signedOutToast'));
      Auth.refreshTopbarIndicator();
      render(container);
    });

    container.querySelector('#deleteAccountRow').addEventListener('click', async () => {
      const step1 = await Confirm.show(I18n.t('profile.deleteWarning1'), { danger: true, confirmText: I18n.t('profile.deleteContinue') });
      if (!step1) return;
      const step2 = await Confirm.show(I18n.t('profile.deleteWarning2'), { danger: true, confirmText: I18n.t('profile.deleteContinue') });
      if (!step2) return;
      const step3 = await Confirm.show(I18n.t('profile.deleteWarning3', { name: profile.name || '' }), { danger: true, confirmText: I18n.t('profile.deleteFinal') });
      if (!step3) return;

      try {
        await Auth.deleteAccount();
        Toast.success(I18n.t('profile.deletedToast'));
        Auth.refreshTopbarIndicator();
        render(container);
      } catch (err) {
        console.error('Account deletion failed:', err);
        Toast.error(I18n.t('profile.deleteFailedToast'));
      }
    });
  }

  return { render };
})();

Router.register('profile', Profile.render);
window.Profile = Profile;
