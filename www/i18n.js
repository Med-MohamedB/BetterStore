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
      getStarted: 'Get Started', all: 'All',
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
    products: {
      searchPlaceholder: 'Search name, barcode, SKU...',
      manageCategories: 'Manage categories',
      manageCategoriesTitle: 'Manage Categories',
      sort: 'Sort',
      addProduct: 'Add product',
      newCategoryLabel: 'New category',
      categoryPlaceholder: 'e.g. Beverages',
      deleteCategory: 'Delete Category',
      deleteCategoryConfirm: 'Delete category "{{cat}}"? {{count}} product{{plural}} will move to Uncategorized \u2014 none will be deleted.',
      categoryDeletedToast: '"{{cat}}" deleted \u2014 products moved to Uncategorized',
      uncategorized: 'Uncategorized',
      noProductsMatch: 'No products match',
      noProductsYet: 'No products yet',
      tapToAddFirst: 'Tap the button below to add your first product.',
      tryDifferentSearch: 'Try a different search or category.',
      addFirstProductHint: 'Add your first product',
      noSku: 'No SKU',
      sortedBy: 'Sorted by {{label}}',
      outOfStock: 'Out of stock',
      lowStock: 'Low \u00b7 {{qty}}',
      inStock: '{{qty}} in stock',
      enterCategoryName: 'Enter a category name',
      categoryWillAppear: '"{{name}}" will appear once a product uses it \u2014 try adding it from a product\u2019s Category field',
      noCategoriesYet: 'No categories yet',
      categoriesHint: 'Categories appear here once a product uses one.',
      existingCategories: 'Existing Categories',
      rename: 'Rename',
      renamePromptTitle: 'Rename category "{{old}}" to:',
      renamedToast: 'Renamed to "{{name}}" ({{count}} product{{plural}})',
      sortName: 'Name (A\u2013Z)',
      sortStock: 'Stock (low first)',
      sortPrice: 'Price (low first)',
      form: {
        addTitle: 'Add Product',
        addPhoto: 'Add photo',
        generate: 'Generate',
        editTitle: 'Edit Product',
        saveChanges: 'Save Changes',
        nameLabel: 'Product name *',
        namePlaceholder: 'e.g. Coca Cola 1L',
        barcodeLabel: 'Barcode',
        barcodePlaceholder: 'Scan or type',
        scanBarcode: 'Scan barcode',
        skuLabel: 'SKU',
        categoryLabel: 'Category',
        categoryPlaceholder: 'e.g. Drinks',
        purchasePriceLabel: 'Purchase price',
        sellingPriceLabel: 'Selling price *',
        discountPriceLabel: 'Discount price',
        unitLabel: 'Unit',
        unitPlaceholder: 'pcs, kg, bottle...',
        stockLabel: 'Quantity in stock',
        minStockLabel: 'Minimum stock level',
        supplierLabel: 'Supplier',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'Optional notes about this product',
        optional: 'Optional',
        nameRequired: 'Product name is required',
        priceRequired: 'Selling price is required',
        pricesNegative: 'Prices can\u2019t be negative',
        discountNegative: 'Discount price can\u2019t be negative',
        stockNegative: 'Stock quantities can\u2019t be negative',
        updated: 'Product updated',
        added: 'Product added',
        barcodeUsed: 'Barcode already used by "{{name}}"',
        deleteConfirm: 'Delete "{{name}}"? This cannot be undone.',
        barcodeScanned: 'Barcode scanned',
      },
      noBarcodeToShow: 'This product has no barcode or SKU to display',
      sharingNotSupported: 'Sharing isn\u2019t supported on this browser',
      barcodeSheetTitle: 'Barcode',
      code39Unsupported: 'This code uses characters Code 39 can\u2019t encode as bars \u2014 shown as text only below.',
      print: 'Print',
      share: 'Share',
      detail: {
        title: 'Product Details',
        noChange: 'No change',
        manualAdjustment: 'Manual adjustment',
        duplicated: 'Product duplicated',
        stockUpdated: 'Stock updated to {{qty}}',
        deleted: '{{name}} deleted',
        inStock: 'In Stock',
        profitPerUnit: 'Profit / unit',
        adjustStock: 'Adjust Stock',
        details: 'Details',
        barcode: 'Barcode',
        purchasePrice: 'Purchase price',
        discountPrice: 'Discount price',
        minStock: 'Minimum stock',
        supplier: 'Supplier',
        duplicate: 'Duplicate',
        copySuffix: ' (Copy)',
      },
    },
  },

  ar: {
    common: {
      save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل', add: 'إضافة',
      done: 'تم', next: 'التالي', back: 'رجوع', search: 'بحث', loading: '...جارٍ التحميل',
      confirm: 'تأكيد', yes: 'نعم', no: 'لا', ok: 'حسنًا', retry: 'إعادة المحاولة', close: 'إغلاق',
      getStarted: 'ابدأ الآن', all: 'الكل',
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
    products: {
      searchPlaceholder: '...البحث بالاسم أو الباركود أو SKU',
      manageCategories: 'إدارة الفئات',
      manageCategoriesTitle: 'إدارة الفئات',
      sort: 'ترتيب',
      addProduct: 'إضافة منتج',
      newCategoryLabel: 'فئة جديدة',
      categoryPlaceholder: 'مثال: مشروبات',
      deleteCategory: 'حذف الفئة',
      deleteCategoryConfirm: '؟"{{cat}}" حذف الفئة سيتم نقل {{count}} منتج إلى "غير مصنف" \u2014 لن يُحذف أي منتج',
      categoryDeletedToast: 'تم حذف "{{cat}}" \u2014 نُقلت المنتجات إلى غير مصنف',
      uncategorized: 'غير مصنف',
      noProductsMatch: 'لا توجد منتجات مطابقة',
      noProductsYet: 'لا توجد منتجات بعد',
      tapToAddFirst: '.اضغط على الزر أدناه لإضافة أول منتج',
      tryDifferentSearch: '.جرّب بحثًا أو فئة مختلفة',
      addFirstProductHint: 'أضف أول منتج',
      noSku: 'بدون SKU',
      sortedBy: 'مرتب حسب {{label}}',
      outOfStock: 'نفد المخزون',
      lowStock: '{{qty}} · منخفض',
      inStock: 'متوفر {{qty}}',
      enterCategoryName: 'أدخل اسم الفئة',
      categoryWillAppear: 'ستظهر "{{name}}" بمجرد أن يستخدمها منتج \u2014 جرّب إضافتها من حقل الفئة في أحد المنتجات',
      noCategoriesYet: 'لا توجد فئات بعد',
      categoriesHint: '.تظهر الفئات هنا بمجرد أن يستخدمها منتج',
      existingCategories: 'الفئات الموجودة',
      rename: 'إعادة تسمية',
      renamePromptTitle: ':إلى "{{old}}" إعادة تسمية الفئة',
      renamedToast: '({{count}} منتج) "{{name}}" تمت إعادة التسمية إلى',
      sortName: '(أ-ي) الاسم',
      sortStock: '(الأقل أولاً) المخزون',
      sortPrice: '(الأقل أولاً) السعر',
      form: {
        addTitle: 'إضافة منتج',
        addPhoto: 'إضافة صورة',
        generate: 'توليد',
        editTitle: 'تعديل المنتج',
        saveChanges: 'حفظ التغييرات',
        nameLabel: '* اسم المنتج',
        namePlaceholder: 'مثال: كوكا كولا 1 لتر',
        barcodeLabel: 'الباركود',
        barcodePlaceholder: 'امسح أو اكتب',
        scanBarcode: 'مسح الباركود',
        skuLabel: 'SKU',
        categoryLabel: 'الفئة',
        categoryPlaceholder: 'مثال: مشروبات',
        purchasePriceLabel: 'سعر الشراء',
        sellingPriceLabel: '* سعر البيع',
        discountPriceLabel: 'سعر بعد التخفيض',
        unitLabel: 'الوحدة',
        unitPlaceholder: '...قطعة، كغ، قارورة',
        stockLabel: 'الكمية في المخزون',
        minStockLabel: 'الحد الأدنى للمخزون',
        supplierLabel: 'المورّد',
        descriptionLabel: 'الوصف',
        descriptionPlaceholder: 'ملاحظات اختيارية حول هذا المنتج',
        optional: 'اختياري',
        nameRequired: 'اسم المنتج مطلوب',
        priceRequired: 'سعر البيع مطلوب',
        pricesNegative: 'لا يمكن أن تكون الأسعار سالبة',
        discountNegative: 'لا يمكن أن يكون سعر التخفيض سالبًا',
        stockNegative: 'لا يمكن أن تكون كمية المخزون سالبة',
        updated: 'تم تحديث المنتج',
        added: 'تمت إضافة المنتج',
        barcodeUsed: '"{{name}}" هذا الباركود مستخدم من طرف',
        deleteConfirm: '؟لا يمكن التراجع عن هذا \u2014 "{{name}}" حذف',
        barcodeScanned: 'تم مسح الباركود',
      },
      noBarcodeToShow: 'لا يحتوي هذا المنتج على باركود أو SKU لعرضه',
      sharingNotSupported: 'المشاركة غير مدعومة في هذا المتصفح',
      barcodeSheetTitle: 'الباركود',
      code39Unsupported: '.يحتوي هذا الرمز على أحرف لا يمكن لـ Code 39 ترميزها كخطوط \u2014 يُعرض كنص فقط أدناه',
      print: 'طباعة',
      share: 'مشاركة',
      detail: {
        title: 'تفاصيل المنتج',
        noChange: 'بدون تغيير',
        manualAdjustment: 'تعديل يدوي',
        duplicated: 'تم نسخ المنتج',
        stockUpdated: '{{qty}} تم تحديث المخزون إلى',
        deleted: 'تم حذف {{name}}',
        inStock: 'المخزون الحالي',
        profitPerUnit: 'الربح / الوحدة',
        adjustStock: 'تعديل المخزون',
        details: 'التفاصيل',
        barcode: 'الباركود',
        purchasePrice: 'سعر الشراء',
        discountPrice: 'سعر التخفيض',
        minStock: 'الحد الأدنى للمخزون',
        supplier: 'المورّد',
        duplicate: 'نسخ',
        copySuffix: ' (نسخة)',
      },
    },
  },

  fr: {
    common: {
      save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier', add: 'Ajouter',
      done: 'Terminé', next: 'Suivant', back: 'Retour', search: 'Rechercher', loading: 'Chargement…',
      confirm: 'Confirmer', yes: 'Oui', no: 'Non', ok: 'OK', retry: 'Réessayer', close: 'Fermer',
      getStarted: 'Commencer', all: 'Tout',
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
    products: {
      searchPlaceholder: 'Rechercher nom, code-barres, SKU...',
      manageCategories: 'Gérer les catégories',
      manageCategoriesTitle: 'Gérer les Catégories',
      sort: 'Trier',
      addProduct: 'Ajouter un produit',
      newCategoryLabel: 'Nouvelle catégorie',
      categoryPlaceholder: 'ex. Boissons',
      deleteCategory: 'Supprimer la Catégorie',
      deleteCategoryConfirm: 'Supprimer la catégorie « {{cat}} »\u00a0? {{count}} produit{{plural}} seront déplacés vers Non classé \u2014 aucun ne sera supprimé.',
      categoryDeletedToast: '« {{cat}} » supprimée \u2014 produits déplacés vers Non classé',
      uncategorized: 'Non classé',
      noProductsMatch: 'Aucun produit ne correspond',
      noProductsYet: 'Aucun produit pour l\u2019instant',
      tapToAddFirst: 'Appuyez sur le bouton ci-dessous pour ajouter votre premier produit.',
      tryDifferentSearch: 'Essayez une autre recherche ou catégorie.',
      addFirstProductHint: 'Ajoutez votre premier produit',
      noSku: 'Aucun SKU',
      sortedBy: 'Trié par {{label}}',
      outOfStock: 'Rupture de stock',
      lowStock: 'Faible \u00b7 {{qty}}',
      inStock: '{{qty}} en stock',
      enterCategoryName: 'Saisissez un nom de catégorie',
      categoryWillAppear: '« {{name}} » apparaîtra dès qu\u2019un produit l\u2019utilisera \u2014 essayez de l\u2019ajouter depuis le champ Catégorie d\u2019un produit',
      noCategoriesYet: 'Aucune catégorie pour l\u2019instant',
      categoriesHint: 'Les catégories apparaissent ici dès qu\u2019un produit en utilise une.',
      existingCategories: 'Catégories Existantes',
      rename: 'Renommer',
      renamePromptTitle: 'Renommer la catégorie « {{old}} » en\u00a0:',
      renamedToast: 'Renommée en « {{name}} » ({{count}} produit{{plural}})',
      sortName: 'Nom (A\u2013Z)',
      sortStock: 'Stock (croissant)',
      sortPrice: 'Prix (croissant)',
      form: {
        addTitle: 'Ajouter un Produit',
        addPhoto: 'Ajouter une photo',
        generate: 'Générer',
        editTitle: 'Modifier le Produit',
        saveChanges: 'Enregistrer',
        nameLabel: 'Nom du produit *',
        namePlaceholder: 'ex. Coca Cola 1L',
        barcodeLabel: 'Code-barres',
        barcodePlaceholder: 'Scanner ou taper',
        scanBarcode: 'Scanner le code-barres',
        skuLabel: 'SKU',
        categoryLabel: 'Catégorie',
        categoryPlaceholder: 'ex. Boissons',
        purchasePriceLabel: 'Prix d\u2019achat',
        sellingPriceLabel: 'Prix de vente *',
        discountPriceLabel: 'Prix réduit',
        unitLabel: 'Unité',
        unitPlaceholder: 'pièce, kg, bouteille...',
        stockLabel: 'Quantité en stock',
        minStockLabel: 'Stock minimum',
        supplierLabel: 'Fournisseur',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'Notes facultatives sur ce produit',
        optional: 'Facultatif',
        nameRequired: 'Le nom du produit est requis',
        priceRequired: 'Le prix de vente est requis',
        pricesNegative: 'Les prix ne peuvent pas être négatifs',
        discountNegative: 'Le prix réduit ne peut pas être négatif',
        stockNegative: 'Les quantités en stock ne peuvent pas être négatives',
        updated: 'Produit mis à jour',
        added: 'Produit ajouté',
        barcodeUsed: 'Code-barres déjà utilisé par « {{name}} »',
        deleteConfirm: 'Supprimer « {{name}} »\u00a0? Action irréversible.',
        barcodeScanned: 'Code-barres scanné',
      },
      noBarcodeToShow: 'Ce produit n\u2019a pas de code-barres ou de SKU à afficher',
      sharingNotSupported: 'Le partage n\u2019est pas pris en charge sur ce navigateur',
      barcodeSheetTitle: 'Code-barres',
      code39Unsupported: 'Ce code contient des caractères que le Code 39 ne peut pas encoder en barres \u2014 affiché en texte seulement ci-dessous.',
      print: 'Imprimer',
      share: 'Partager',
      detail: {
        title: 'Détails du Produit',
        noChange: 'Aucun changement',
        manualAdjustment: 'Ajustement manuel',
        duplicated: 'Produit dupliqué',
        stockUpdated: 'Stock mis à jour à {{qty}}',
        deleted: '{{name}} supprimé',
        inStock: 'En Stock',
        profitPerUnit: 'Profit / unité',
        adjustStock: 'Ajuster le Stock',
        details: 'Détails',
        barcode: 'Code-barres',
        purchasePrice: 'Prix d\u2019achat',
        discountPrice: 'Prix réduit',
        minStock: 'Stock minimum',
        supplier: 'Fournisseur',
        duplicate: 'Dupliquer',
        copySuffix: ' (Copie)',
      },
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
