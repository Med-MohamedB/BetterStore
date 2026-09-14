/**
 * i18n.js — translations + the I18n module that applies them.
 *
 * STATUS: this app is mid-translation. The engine below is complete and
 * production-ready (locale storage, RTL switching, fallback-to-English
 * for any key a language hasn't reached yet, dynamic + static-DOM
 * application). The TRANSLATIONS dictionary itself currently covers the
 * highest-traffic surfaces — navigation, common actions, the language
 * picker, and onboarding — with every other screen's strings still to
 * come, file by file. A missing key never breaks anything: t() falls
 * back to English silently, so partial coverage is always safe to ship.
 *
 * Usage:
 *   I18n.t('nav.dashboard')                    -> "Dashboard" / "لوحة التحكم" / "Tableau de bord"
 *   I18n.t('language.subtitle', { app: 'X' })  -> interpolates {{app}}
 *   I18n.locale                                 -> 'en' | 'ar' | 'fr'
 *   await I18n.setLocale('ar')                  -> persists, sets dir/lang, re-renders
 *   I18n.applyStaticDOM()                       -> fills every [data-i18n] element in the
 *                                                   current DOM (index.html's nav, etc.)
 */

const TRANSLATIONS = {
  en: {
    common: {
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add',
      done: 'Done', next: 'Next', back: 'Back', search: 'Search', loading: 'Loading…',
      confirm: 'Confirm', yes: 'Yes', no: 'No', ok: 'OK', retry: 'Retry', close: 'Close',
      getStarted: 'Get Started',
    },
    nav: {
      dashboard: 'Dashboard', products: 'Products', pos: 'POS', sales: 'Sales', more: 'More',
    },
    language: {
      title: 'Choose your language',
      subtitle: 'You can change this anytime in More.',
      continue: 'Continue',
      rowTitle: 'Language',
      rowSubtitle: 'English',
    },
    onboarding: {
      welcomeTitle: 'Run your store from your pocket',
      welcomeSub: 'Sell, track stock, and see what\u2019s selling \u2014 all in one place.',
      storeNameTitle: 'What\u2019s your store called?',
      storeNameSub: 'Shows on receipts and the dashboard \u2014 you can change it later in Settings.',
      storeNamePlaceholder: 'My Store',
      scanTitle: 'Scan instead of typing',
      scanSub: 'Point the camera at any barcode to add or sell an item in one tap.',
      restockTitle: 'Always know what\u2019s low',
      restockSub: 'Get a nudge before you run out of anything.',
    },
  },

  ar: {
    common: {
      save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل', add: 'إضافة',
      done: 'تم', next: 'التالي', back: 'رجوع', search: 'بحث', loading: '...جارٍ التحميل',
      confirm: 'تأكيد', yes: 'نعم', no: 'لا', ok: 'حسنًا', retry: 'إعادة المحاولة', close: 'إغلاق',
      getStarted: 'ابدأ الآن',
    },
    nav: {
      dashboard: 'الرئيسية', products: 'المنتجات', pos: 'البيع', sales: 'المبيعات', more: 'المزيد',
    },
    language: {
      title: 'اختر لغتك',
      subtitle: '.يمكنك تغيير هذا في أي وقت من قائمة المزيد',
      continue: 'متابعة',
      rowTitle: 'اللغة',
      rowSubtitle: 'العربية',
    },
    onboarding: {
      welcomeTitle: 'أدر متجرك من جيبك',
      welcomeSub: '.بيع، تتبّع المخزون، واعرف الأكثر مبيعًا \u2014 كل هذا في مكان واحد',
      storeNameTitle: '؟ما اسم متجرك',
      storeNameSub: '.يظهر على الفواتير ولوحة التحكم \u2014 يمكنك تغييره لاحقًا من الإعدادات',
      storeNamePlaceholder: 'متجري',
      scanTitle: 'امسح بدل الكتابة',
      scanSub: '.وجّه الكاميرا نحو أي باركود لإضافة أو بيع المنتج بلمسة واحدة',
      restockTitle: 'اعرف دائمًا ما قلّ من مخزونك',
      restockSub: '.نذكّرك قبل أن ينفد أي شيء',
    },
  },

  fr: {
    common: {
      save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier', add: 'Ajouter',
      done: 'Terminé', next: 'Suivant', back: 'Retour', search: 'Rechercher', loading: 'Chargement…',
      confirm: 'Confirmer', yes: 'Oui', no: 'Non', ok: 'OK', retry: 'Réessayer', close: 'Fermer',
      getStarted: 'Commencer',
    },
    nav: {
      dashboard: 'Accueil', products: 'Produits', pos: 'Caisse', sales: 'Ventes', more: 'Plus',
    },
    language: {
      title: 'Choisissez votre langue',
      subtitle: 'Vous pourrez la changer à tout moment dans Plus.',
      continue: 'Continuer',
      rowTitle: 'Langue',
      rowSubtitle: 'Français',
    },
    onboarding: {
      welcomeTitle: 'Gérez votre boutique depuis votre poche',
      welcomeSub: 'Vendez, suivez votre stock, et voyez ce qui se vend \u2014 tout en un seul endroit.',
      storeNameTitle: 'Quel est le nom de votre boutique\u00a0?',
      storeNameSub: 'Apparaît sur les reçus et le tableau de bord \u2014 modifiable plus tard dans les Paramètres.',
      storeNamePlaceholder: 'Ma Boutique',
      scanTitle: 'Scannez au lieu de taper',
      scanSub: 'Pointez la caméra vers un code-barres pour ajouter ou vendre un article en un geste.',
      restockTitle: 'Sachez toujours ce qui manque',
      restockSub: 'Une alerte avant que vous ne soyez à court de quoi que ce soit.',
    },
  },
};

const I18n = (() => {
  const LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '\ud83c\uddec\ud83c\udde7', dir: 'ltr' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '\ud83c\udde9\ud83c\uddff', dir: 'rtl' }, // Algeria flag, per request
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '\ud83c\uddeb\ud83c\uddf7', dir: 'ltr' },
  ];

  let current = 'en';

  function dirFor(code) {
    return (LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]).dir;
  }

  /** Dot-path lookup in the current locale, falling back to English (then
   *  the key itself) so a not-yet-translated string never renders blank
   *  or throws — this is what makes incremental, file-by-file
   *  translation safe to ship partially. `vars` does simple {{name}}
   *  interpolation. */
  function t(key, vars) {
    const lookup = (locale) => {
      const parts = key.split('.');
      let node = TRANSLATIONS[locale];
      for (const p of parts) { node = node && node[p]; }
      return typeof node === 'string' ? node : null;
    };
    let str = lookup(current) ?? lookup('en') ?? key;
    if (vars) for (const k in vars) str = str.replace(new RegExp(`{{${k}}}`, 'g'), vars[k]);
    return str;
  }

  /** Fills every element in the current DOM tagged data-i18n="some.key"
   *  (used for static markup that lives in index.html itself, like the
   *  bottom nav, which JS never re-renders). Safe to call anytime — e.g.
   *  once at boot and again after setLocale(). */
  function applyStaticDOM() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
  }

  /** Sets `document.documentElement`'s lang/dir attributes — dir drives
   *  the whole RTL layout switch via CSS ([dir="rtl"] selectors), so this
   *  is the one call that actually flips the app's reading direction. */
  function applyDirLang(code) {
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', dirFor(code));
  }

  async function setLocale(code) {
    if (!TRANSLATIONS[code]) return;
    current = code;
    applyDirLang(code);
    if (window.Settings) await Settings.set('appearance', { locale: code });
    applyStaticDOM();
    // Re-render whatever's currently on screen so it picks up the new
    // language immediately, same as a theme-pack switch does today. Only
    // when the router's actually running — during the first-launch gate
    // (before Router.init() has ever run, since Language sits ahead of
    // it in boot()) there's nothing on screen yet to re-render.
    if (window.Router && Router.current && Router.refresh) Router.refresh();
  }

  /** Called once at boot, before first render — reads the saved locale
   *  (or null on a fresh install) and applies dir/lang immediately so
   *  there's no flash of the wrong direction. Returns the resolved code. */
  async function init() {
    const appearance = window.Settings ? await Settings.get('appearance') : {};
    current = appearance.locale || 'en';
    applyDirLang(current);
    return current;
  }

  return {
    get locale() { return current; },
    LANGUAGES, t, setLocale, init, applyStaticDOM, applyDirLang,
  };
})();
window.I18n = I18n;
