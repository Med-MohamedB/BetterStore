/* ==========================================================================
   What's New — a changelog card shown once per version bump, to existing
   users only (fresh installs get the interactive onboarding instead — see
   app.js boot() for how the two are kept mutually exclusive). Purely a
   localStorage flag; never reads or touches IndexedDB data.
   ========================================================================== */

const WhatsNew = (() => {
  const KEY = 'sa_last_seen_version';

  // Add new entries at the top of the most recent group each release (or
  // start a new group when this release's purpose is genuinely different
  // from the one above it — see the version-numbering rule this file
  // follows below). Newest group first; within a group, newest entry
  // first.
  //
  // Each group is either:
  //   { version: '1.2.3', items: [...] }                     — one release
  //   { versionRange: ['1.2.3', '1.2.6'], items: [...] }      — several
  //     consecutive releases that all served the same overall purpose
  //     (e.g. a multi-patch translation sweep), collapsed under one header
  //   { label: 'Earlier — ...', items: [...] }                — for older
  //     history where the exact original version number per entry isn't
  //     reliably known (this codebase has no version-tagged commit
  //     history to recover it from) — grouped by theme instead of by a
  //     fabricated version number.
  // Add new entries at the top of the most recent group each release (or
  // start a new group when this release's purpose is genuinely different
  // from the one above it — see the version-numbering rule this file
  // follows below). Newest group first; within a group, newest entry
  // first. Each entry's `text` is `{ en, ar, fr }` — translated directly
  // here rather than through i18n.js, since changelog copy is written
  // once per release and colocating it with the entry keeps a release's
  // three languages easy to review and edit together (see show() below
  // for how the current locale is picked at render time).
  //
  // Each group is either:
  //   { version: '1.2.3', items: [...] }                     — one release
  //   { versionRange: ['1.2.3', '1.2.6'], items: [...] }      — several
  //     consecutive releases that all served the same overall purpose
  //     (e.g. a multi-patch translation sweep), collapsed under one header
  //   { label: 'Earlier — ...', items: [...] }                — for older
  //     history where the exact original version number per entry isn't
  //     reliably known (this codebase has no version-tagged commit
  //     history to recover it from) — grouped by theme instead of by a
  //     fabricated version number.
  const CHANGELOG = [
    {
      version: '1.9.10.0',
      items: [
        {
          icon: Icon('printer'),
          text: {
            en: 'Added support for Bluetooth thermal receipt printers \\u2014 connect one from Settings > Point of Sale > Receipt Printer, and sale/refund receipts print straight to it instead of opening the system print dialog. Prints as crisp native text when the receipt is plain text, and automatically switches to a pixel-perfect image (matching the on-screen preview exactly) for Arabic or accented text, with a manual \\u201cAlways as image\\u201d option and a printer test page.',
            ar: 'أضفنا دعمًا لطابعات الإيصالات الحرارية عبر البلوتوث \\u2014 وصّل واحدة من الإعدادات > نقطة البيع > طابعة الإيصالات، وستُطبع إيصالات البيع والاسترجاع مباشرة عليها بدلاً من فتح نافذة طباعة النظام. تُطبع كنص أصلي واضح عندما يكون الإيصال نصًا عاديًا، وتنتقل تلقائيًا إلى صورة دقيقة (تطابق المعاينة على الشاشة تمامًا) مع النص العربي أو المُشكَّل، مع خيار يدوي \\u201cدائمًا كصورة\\u201d وصفحة اختبار للطابعة.',
            fr: 'Ajout de la prise en charge des imprimantes thermiques de reçus Bluetooth \\u2014 connectez-en une depuis Paramètres > Point de Vente > Imprimante de reçus, et les reçus de vente/remboursement s\\u2019impriment directement dessus au lieu d\\u2019ouvrir la boîte de dialogue d\\u2019impression du système. Imprime en texte natif net lorsque le reçu est du texte brut, et bascule automatiquement vers une image au pixel près (correspondant exactement à l\\u2019aperçu à l\\u2019écran) pour l\\u2019arabe ou le texte accentué, avec une option manuelle \\u00ab\\u00a0Toujours en image\\u00a0\\u00bb et une page de test d\\u2019imprimante.',
          },
        },
      ],
    },
    {
      version: '1.9.9.32',
      items: [
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Actually fixed Arabic text in printed/shared receipt PDFs this time \u2014 the previous fix (embedding a font and hand-rolling text shaping/reordering for jsPDF) looked right in testing but came out visibly broken in real printing. Rebuilt it from scratch: Arabic receipts now render onto a canvas using the phone\u2019s own text engine (the same one that\u2019s always correctly handled the on-screen preview and text-share) and get embedded as an image, instead of jsPDF trying to draw Arabic as text itself.',
            ar: 'أصلحنا فعليًا مشكلة النص العربي في ملفات PDF للإيصالات المطبوعة/المشتركة هذه المرة \u2014 الإصلاح السابق (تضمين خط وتطبيق تشكيل/إعادة ترتيب النص يدويًا لـ jsPDF) بدا صحيحًا أثناء الاختبار لكنه ظهر معطوبًا بوضوح عند الطباعة الفعلية. أعدنا بناءه من الصفر: الإيصالات العربية تُرسم الآن على قماش رسم (canvas) باستخدام محرك النص الخاص بالهاتف نفسه (نفس المحرك الذي كان يعرض دائمًا المعاينة على الشاشة والمشاركة كنص بشكل صحيح) وتُضمَّن كصورة، بدلاً من محاولة jsPDF رسم العربية كنص بنفسه.',
            fr: 'Cette fois, le texte arabe dans les PDF de reçus imprimés/partagés est réellement corrigé \u2014 la correction précédente (intégrer une police et faire à la main la mise en forme/le réordonnancement du texte pour jsPDF) semblait correcte en test mais s\u2019est révélée visiblement cassée à l\u2019impression réelle. Reconstruite de zéro : les reçus en arabe sont désormais dessinés sur un canvas en utilisant le propre moteur de texte du téléphone (le même qui a toujours correctement géré l\u2019aperçu à l\u2019écran et le partage en texte) puis intégrés comme une image, au lieu que jsPDF essaie de dessiner l\u2019arabe comme du texte lui-même.',
          },
        },
        {
          icon: Icon('receipt'),
          text: {
            en: 'Refunds now show up on the original sale\u2019s own receipt, not just as a badge \u2014 each refunded item gets a line showing how much of it was refunded, plus a Total Refunded / Net Total breakdown, in the on-screen preview, the printed PDF, and the text-share version.',
            ar: 'الاسترجاعات تظهر الآن في إيصال عملية البيع الأصلية نفسها، وليس فقط كشارة \u2014 كل صنف تم استرجاعه يحصل على سطر يوضح الكمية المسترجعة منه، بالإضافة إلى تفصيل إجمالي المسترجع/صافي الإجمالي، في المعاينة على الشاشة وملف PDF المطبوع ونسخة المشاركة كنص.',
            fr: 'Les remboursements apparaissent désormais sur le reçu de la vente d\u2019origine elle-même, pas seulement sous forme de badge \u2014 chaque article remboursé reçoit une ligne indiquant la quantité remboursée, ainsi qu\u2019une ventilation Total remboursé / Total net, dans l\u2019aperçu à l\u2019écran, le PDF imprimé et la version partagée en texte.',
          },
        },
      ],
    },
    {
      version: '1.9.9.31',
      items: [
        {
          icon: Icon('scan'),
          text: {
            en: 'Added support for physical (USB/Bluetooth) barcode scanners, not just the camera \u2014 scan an item\u2019s barcode from any screen and it\u2019s added straight to the cart (jumping to POS if you\u2019re not already there), or scan a receipt\u2019s barcode and it opens that sale directly. Inside POS\u2019s own product search, scanning an exact barcode match now adds it immediately instead of making you tap the result.',
            ar: 'أضفنا دعمًا لماسحات الباركود الفعلية (USB/بلوتوث)، وليس الكاميرا فقط \u2014 امسح باركود صنف من أي شاشة ليُضاف مباشرة إلى السلة (مع الانتقال إلى نقطة البيع إن لم تكن فيها بالفعل)، أو امسح باركود إيصال ليفتح تلك العملية مباشرة. وداخل بحث المنتجات في نقطة البيع نفسها، مسح تطابق دقيق للباركود يضيفه الآن فورًا بدلاً من مطالبتك بالنقر على النتيجة.',
            fr: 'Ajout de la prise en charge des scanners de codes-barres physiques (USB/Bluetooth), pas seulement de la caméra \u2014 scannez le code-barres d\u2019un article depuis n\u2019importe quel écran et il est ajouté directement au panier (en basculant vers la Caisse si vous n\u2019y êtes pas déjà), ou scannez le code-barres d\u2019un reçu pour ouvrir directement cette vente. Dans la recherche de produits de la Caisse elle-même, scanner une correspondance exacte de code-barres l\u2019ajoute désormais immédiatement au lieu de vous demander de taper sur le résultat.',
          },
        },
      ],
    },
    {
      version: '1.9.9.30',
      items: [
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Fixed Arabic text not rendering in printed/shared receipt PDFs \u2014 jsPDF had no Arabic font, letter-shaping, or right-to-left support built in, so Arabic words on a receipt PDF would come out blank or as disconnected, wrong-order characters. Now embeds a real Arabic font and does proper letter-joining and right-to-left ordering, while keeping things like phone numbers, dates, and totals safely pinned in their normal left-to-right order.',
            ar: 'أصلحنا عدم ظهور النص العربي في ملفات PDF للإيصالات المطبوعة/المشتركة \u2014 لم تكن مكتبة jsPDF تحتوي على خط عربي أو تشكيل حروف أو دعم للكتابة من اليمين لليسار، لذا كانت الكلمات العربية في إيصال PDF تظهر فارغة أو كأحرف منفصلة وبترتيب خاطئ. الآن يتم تضمين خط عربي حقيقي مع ربط صحيح للحروف وترتيب صحيح من اليمين لليسار، مع إبقاء أشياء مثل أرقام الهواتف والتواريخ والإجماليات مثبّتة بأمان بترتيبها المعتاد من اليسار لليمين.',
            fr: 'Correction du texte arabe qui ne s\u2019affichait pas dans les PDF de reçus imprimés/partagés \u2014 jsPDF n\u2019intégrait ni police arabe, ni liaison des lettres, ni prise en charge de l\u2019écriture de droite à gauche, donc les mots arabes sur un reçu PDF ressortaient vides ou en caractères déconnectés et dans le mauvais ordre. Une vraie police arabe est désormais intégrée, avec une liaison correcte des lettres et un ordre de droite à gauche correct, tout en gardant des éléments comme les numéros de téléphone, les dates et les totaux fermement fixés dans leur ordre normal de gauche à droite.',
          },
        },
        {
          icon: Icon('receipt'),
          text: {
            en: 'Refunding a sale now generates its own refund receipt right afterward \u2014 shows what was originally bought alongside exactly what was just refunded, with its own barcode, and can be printed or shared just like a regular receipt.',
            ar: 'استرجاع عملية بيع يولّد الآن إيصال استرجاع خاصًا به مباشرة بعد ذلك \u2014 يعرض ما تم شراؤه في الأصل جنبًا إلى جنب مع ما تم استرجاعه للتو بالضبط، مع باركود خاص به، ويمكن طباعته أو مشاركته تمامًا مثل الإيصال العادي.',
            fr: 'Rembourser une vente génère désormais son propre reçu de remboursement juste après \u2014 il affiche ce qui a été acheté à l\u2019origine aux côtés de ce qui vient d\u2019être remboursé exactement, avec son propre code-barres, et peut être imprimé ou partagé tout comme un reçu classique.',
          },
        },
      ],
    },
    {
      version: '1.9.9.29',
      items: [
        {
          icon: Icon('globe'),
          text: {
            en: 'The language picker now pre-highlights whichever of the 3 languages matches your phone\u2019s own system language (you can still tap a different one \u2014 this is just a smart default, never automatic). That same detection also decides which language the app briefly starts in before the picker finishes loading, instead of always defaulting to English.',
            ar: 'منتقي اللغة الآن يبرز تلقائيًا أيًا من اللغات الثلاث تطابق لغة نظام هاتفك (يمكنك دائمًا النقر على لغة أخرى \u2014 هذا مجرد اقتراح ذكي، وليس تلقائيًا أبدًا). نفس هذا الاكتشاف يحدد أيضًا اللغة التي يبدأ بها التطبيق لوهلة قبل ظهور شاشة الاختيار، بدلاً من الاعتماد دائمًا على الإنجليزية.',
            fr: 'Le sélecteur de langue met désormais en avant celle des 3 langues qui correspond à la langue du système de votre téléphone (vous pouvez toujours en choisir une autre \u2014 ce n\u2019est qu\u2019une suggestion intelligente, jamais automatique). Cette même détection décide aussi dans quelle langue l\u2019application démarre brièvement avant que l\u2019écran de choix ne s\u2019affiche, au lieu de toujours revenir à l\u2019anglais par défaut.',
          },
        },
        {
          icon: Icon('palette'),
          text: {
            en: 'Redesigned the update screen and this changelog to actually match the rest of the app: no more emoji anywhere in either one (real icons throughout, including two new ones \u2014 for translation/language and theme/design entries), the update screen\u2019s icon now genuinely animates through checking \u2192 downloading \u2192 ready instead of sitting static, and this list is now grouped by version instead of one long undifferentiated scroll.',
            ar: 'أعدنا تصميم شاشة التحديث وسجل التغييرات هذا ليتطابقا فعليًا مع بقية التطبيق: لا مزيد من الرموز التعبيرية في أي منهما (أيقونات حقيقية في كل مكان، بما في ذلك أيقونتان جديدتان \u2014 للترجمة/اللغة ولإدخالات السمة/التصميم)، وأيقونة شاشة التحديث الآن تتحرك فعليًا عبر مراحل الفحص \u2190 التنزيل \u2190 جاهز بدلاً من البقاء ثابتة، وهذه القائمة الآن مجمّعة حسب الإصدار بدلاً من تمرير طويل واحد غير مصنّف.',
            fr: 'L\u2019écran de mise à jour et ce journal des nouveautés ont été redessinés pour correspondre réellement au reste de l\u2019application : plus aucun emoji dans l\u2019un ou l\u2019autre (de vraies icônes partout, dont deux nouvelles \u2014 pour les entrées de traduction/langue et de thème/design), l\u2019icône de l\u2019écran de mise à jour s\u2019anime désormais réellement à travers vérification \u2192 téléchargement \u2192 prêt au lieu de rester statique, et cette liste est maintenant regroupée par version plutôt qu\u2019un long défilement indifférencié.',
          },
        },
      ],
    },
    {
      versionRange: ['1.9.9.26', '1.9.9.28'],
      items: [
        {
          icon: Icon('check-circle'),
          text: {
            en: 'A full RTL audit pass for Arabic: the "add your first item" hint on Products/Customers/Suppliers no longer lands off-screen, swipe-to-reveal (Edit/Delete on a row) now opens from the correct side and those buttons are translated (they weren\u2019t before, in any language), and Cancel/Delete on every confirmation popup are translated too (also weren\u2019t before). Prices, dates and receipt numbers are now guaranteed to show as 0-9 digits regardless of phone language \u2014 previously an Arabic phone could silently switch them to Eastern Arabic-Indic numerals. Barcodes, SKUs and receipt numbers are now protected from getting visually reordered next to Arabic text. Also translated four screens that were missed entirely: the More menu, the Terms of Use screen\u2019s buttons and labels (the legal text itself stays English \u2014 that\u2019s deliberate), the Donate prompt, and this What\u2019s New popup.',
            ar: 'مراجعة شاملة لتوافق التطبيق مع الكتابة من اليمين لليسار في العربية: تلميح \u201cأضف أول عنصر\u201d في المنتجات/العملاء/الموردين لم يعد يظهر خارج الشاشة، وميزة السحب لإظهار (تعديل/حذف على صف) تفتح الآن من الجهة الصحيحة وهذان الزرّان أصبحا مترجمَين (لم يكونا كذلك من قبل، في أي لغة)، كما أن \u201cإلغاء\u201d/\u201cحذف\u201d في كل نافذة تأكيد أصبحا مترجمَين أيضًا (لم يكونا كذلك من قبل). الأسعار والتواريخ وأرقام الإيصالات أصبحت الآن مضمونة الظهور بالأرقام 0-9 بغض النظر عن لغة الهاتف \u2014 سابقًا كان بإمكان هاتف بلغة عربية أن يبدّلها بصمت إلى الأرقام الهندية الشرقية. الباركودات ورموز المنتجات (SKU) وأرقام الإيصالات محمية الآن من إعادة الترتيب البصري بجانب النص العربي. كما تمت ترجمة أربع شاشات كانت مفقودة تمامًا: قائمة \u201cالمزيد\u201d، وأزرار وتسميات شاشة شروط الاستخدام (النص القانوني نفسه يبقى بالإنجليزية \u2014 وهذا مقصود)، ونافذة التبرع، ونافذة \u201cما الجديد\u201d هذه.',
            fr: 'Un audit RTL complet pour l\u2019arabe : l\u2019indice \u00ab ajoutez votre premier élément \u00bb sur Produits/Clients/Fournisseurs ne sort plus de l\u2019écran, le glissement pour révéler (Modifier/Supprimer sur une ligne) s\u2019ouvre désormais du bon côté et ces boutons sont traduits (ce n\u2019était le cas dans aucune langue avant), et Annuler/Supprimer sur chaque popup de confirmation sont également traduits (ce n\u2019était pas le cas non plus). Les prix, dates et numéros de reçu s\u2019affichent désormais garantis en chiffres 0-9 quelle que soit la langue du téléphone \u2014 auparavant, un téléphone en arabe pouvait silencieusement les basculer en chiffres indo-arabes orientaux. Les codes-barres, références produit (SKU) et numéros de reçu sont désormais protégés d\u2019un réordonnancement visuel à côté d\u2019un texte arabe. Quatre écrans entièrement oubliés ont aussi été traduits : le menu Plus, les boutons et libellés de l\u2019écran des Conditions d\u2019utilisation (le texte juridique lui-même reste en anglais \u2014 c\u2019est volontaire), l\u2019invite de don, et cette fenêtre Nouveautés.',
          },
        },
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Fixed onboarding breaking in Arabic \u2014 the swipe track\u2019s position math didn\u2019t account for RTL flex layout, which could show a blank slide or a stuck/inverted swipe. Also finished translating the About This App sheet (Contact & Shop, Support/Donate, Troubleshooting) \u2014 that was the one screen still missed by the translation sweep.',
            ar: 'أصلحنا عطلاً في التعريف بالتطبيق عند استخدام العربية \u2014 حسابات موضع شريط التمرير لم تكن تراعي تخطيط RTL، مما قد يُظهر شريحة فارغة أو سحبًا عالقًا/معكوسًا. كما أكملنا ترجمة نافذة \u201cحول هذا التطبيق\u201d (التواصل والمتجر، الدعم/التبرع، استكشاف الأخطاء) \u2014 كانت هذه الشاشة الوحيدة التي فاتتها حملة الترجمة.',
            fr: 'Correction d\u2019un bug qui cassait la découverte de l\u2019application en arabe \u2014 le calcul de position du défilement ne tenait pas compte de la mise en page RTL, ce qui pouvait afficher une diapositive vide ou un glissement bloqué/inversé. La fenêtre \u00ab À propos de l\u2019application \u00bb (Contact et boutique, Support/Don, Dépannage) a aussi été entièrement traduite \u2014 c\u2019était le seul écran encore oublié par la campagne de traduction.',
          },
        },
        {
          icon: Icon('refresh'),
          text: {
            en: 'Arabic layout got a real RTL pass: swiping between tabs now advances in the correct direction for Arabic (swipe right to go forward, matching how Android itself handles RTL paging), the little \u203a arrows that show a row opens something now flip to point the right way, the undo icon on refunded sales mirrors too, and a few corner elements (the onboarding skip button, the add-record + button) now relocate to the correct corner in Arabic instead of staying pinned to English\u2019s side.',
            ar: 'حصلت الواجهة العربية على مراجعة حقيقية لتخطيط RTL: التمرير بين علامات التبويب يتقدم الآن في الاتجاه الصحيح للعربية (اسحب لليمين للانتقال للأمام، مطابقًا لطريقة تعامل أندرويد نفسه مع التصفح من اليمين لليسار)، والأسهم الصغيرة \u203a التي تدل على أن الصف يفتح شيئًا تنقلب الآن لتشير للاتجاه الصحيح، وأيقونة التراجع في المبيعات المسترجعة تنعكس أيضًا، وبعض العناصر الزاوية (زر تخطي التعريف بالتطبيق، وزر + لإضافة سجل) تنتقل الآن إلى الزاوية الصحيحة في العربية بدلاً من البقاء ثابتة على جهة الإنجليزية.',
            fr: 'La mise en page arabe a reçu un vrai passage RTL : le glissement entre les onglets avance désormais dans le bon sens en arabe (glisser vers la droite pour avancer, comme Android lui-même gère la pagination RTL), les petites flèches \u203a indiquant qu\u2019une ligne ouvre quelque chose s\u2019inversent maintenant pour pointer dans le bon sens, l\u2019icône d\u2019annulation sur les ventes remboursées se retourne aussi, et quelques éléments d\u2019angle (le bouton pour passer la découverte de l\u2019application, le bouton + d\u2019ajout) se replacent désormais dans le bon coin en arabe au lieu de rester fixés du côté de l\u2019anglais.',
          },
        },
      ],
    },
    {
      version: '1.9.9.25',
      items: [
        {
          icon: Icon('receipt'),
          text: {
            en: 'You can now set a Receipt Language independent of the app\u2019s own language (Settings \u2192 Point of Sale), and every receipt preview has a language switcher right there so you can flip it and see the change before you print or share. Heads up: printed PDFs on-device can\u2019t render Arabic script yet (a font limitation, not new to this release) \u2014 the on-screen preview and the text-share option both show Arabic correctly in the meantime.',
            ar: 'يمكنك الآن ضبط لغة الإيصال بشكل مستقل عن لغة التطبيق نفسها (الإعدادات \u2190 نقطة البيع)، وكل معاينة لإيصال تحتوي على مبدّل لغة مباشرة هناك حتى تتمكن من تبديلها ورؤية التغيير قبل الطباعة أو المشاركة. ملاحظة: ملفات PDF المطبوعة على الجهاز لا يمكنها بعد عرض الخط العربي (قيد يتعلق بالخط، وليس جديدًا في هذا الإصدار) \u2014 المعاينة على الشاشة وخيار المشاركة كنص كلاهما يعرضان العربية بشكل صحيح في هذه الأثناء.',
            fr: 'Vous pouvez désormais définir une langue de reçu indépendante de la langue de l\u2019application elle-même (Paramètres \u2192 Point de vente), et chaque aperçu de reçu dispose d\u2019un sélecteur de langue juste là pour basculer et voir le changement avant d\u2019imprimer ou de partager. À noter : les PDF imprimés sur l\u2019appareil ne peuvent pas encore afficher l\u2019écriture arabe (une limitation de police, pas nouvelle dans cette version) \u2014 l\u2019aperçu à l\u2019écran et l\u2019option de partage en texte affichent tous deux l\u2019arabe correctement en attendant.',
          },
        },
      ],
    },
    {
      versionRange: ['1.9.9.14', '1.9.9.24'],
      items: [
        {
          icon: Icon('bar-chart'),
          text: {
            en: 'Inventory is now fully translated \u2014 stock-status filters, the low/out-of-stock badges, and the full adjustment history log, in all 3 languages. That\u2019s every main screen done: Products, POS, Sales, Settings, Customers, Suppliers, Backup, Dashboard, Scanner, Reports, and Inventory. Left on the list: the receipt print/share text, a legal-text pass on Terms, and an RTL layout audit (including flipping the swipe direction for Arabic).',
            ar: 'المخزون أصبح الآن مترجمًا بالكامل \u2014 مرشّحات حالة المخزون، وشارات \u201cمنخفض/نفد من المخزون\u201d، وسجل التعديلات الكامل، في اللغات الثلاث. بهذا تكون كل الشاشات الرئيسية قد اكتملت: المنتجات، نقطة البيع، المبيعات، الإعدادات، العملاء، الموردون، النسخ الاحتياطي، الرئيسية، الماسح، التقارير، والمخزون. المتبقي في القائمة: نص طباعة/مشاركة الإيصال، ومراجعة النص القانوني في شروط الاستخدام، ومراجعة تخطيط RTL (بما في ذلك عكس اتجاه السحب للعربية).',
            fr: 'L\u2019Inventaire est désormais entièrement traduit \u2014 les filtres de statut de stock, les badges stock faible/épuisé, et l\u2019historique complet des ajustements, dans les 3 langues. C\u2019est donc chaque écran principal qui est fait : Produits, Caisse, Ventes, Paramètres, Clients, Fournisseurs, Sauvegarde, Accueil, Scanner, Rapports, et Inventaire. Reste sur la liste : le texte d\u2019impression/partage du reçu, une relecture du texte juridique des Conditions, et un audit de mise en page RTL (y compris inverser le sens du glissement pour l\u2019arabe).',
          },
        },
        {
          icon: Icon('trending-up'),
          text: {
            en: 'Reports is now fully translated \u2014 the date-range chips, stat cards, best sellers, category and payment breakdowns, and the cost summary, in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, Backup, Dashboard, Scanner, and Reports all done \u2014 Inventory is next, then a few smaller cleanup passes.',
            ar: 'التقارير أصبحت الآن مترجمة بالكامل \u2014 رقاقات النطاق الزمني، بطاقات الإحصاءات، الأكثر مبيعًا، تفصيل الفئات وطرق الدفع، وملخص التكلفة، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات والعملاء والموردون والنسخ الاحتياطي والرئيسية والماسح والتقارير قد اكتملت جميعًا \u2014 المخزون هو التالي، ثم بضع مراجعات تنظيف أصغر.',
            fr: 'Les Rapports sont désormais entièrement traduits \u2014 les puces de plage de dates, les cartes de statistiques, les meilleures ventes, la ventilation par catégorie et par mode de paiement, et le résumé des coûts, dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes, Paramètres, Clients, Fournisseurs, Sauvegarde, Accueil, Scanner et Rapports qui sont tous faits \u2014 l\u2019Inventaire est le prochain, puis quelques petites passes de nettoyage.',
          },
        },
        {
          icon: Icon('camera'),
          text: {
            en: 'The barcode Scanner is now fully translated \u2014 hints, camera picker, torch and error messages, all in 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, Backup, Dashboard, and Scanner all done \u2014 Reports and Inventory are next.',
            ar: 'ماسح الباركود أصبح الآن مترجمًا بالكامل \u2014 التلميحات، منتقي الكاميرا، رسائل الفلاش والأخطاء، كلها في 3 لغات. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات والعملاء والموردون والنسخ الاحتياطي والرئيسية والماسح قد اكتملت جميعًا \u2014 التقارير والمخزون هما التاليان.',
            fr: 'Le Scanner de codes-barres est désormais entièrement traduit \u2014 les indices, le sélecteur de caméra, les messages de torche et d\u2019erreur, le tout dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes, Paramètres, Clients, Fournisseurs, Sauvegarde, Accueil et Scanner qui sont tous faits \u2014 Rapports et Inventaire sont les prochains.',
          },
        },
        {
          icon: Icon('home'),
          text: {
            en: 'The Dashboard is now fully translated \u2014 the greeting, revenue card, quick stats, low-stock alerts, quick actions, and recent sales list, plus every screen\u2019s topbar title, in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, Backup, and Dashboard all done \u2014 Scanner, Reports, and Inventory are next.',
            ar: 'الشاشة الرئيسية أصبحت الآن مترجمة بالكامل \u2014 التحية، بطاقة الإيرادات، الإحصاءات السريعة، تنبيهات انخفاض المخزون، الإجراءات السريعة، وقائمة المبيعات الأخيرة، بالإضافة إلى عنوان الشريط العلوي لكل شاشة، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات والعملاء والموردون والنسخ الاحتياطي والرئيسية قد اكتملت جميعًا \u2014 الماسح والتقارير والمخزون هي التالية.',
            fr: 'Le Tableau de bord est désormais entièrement traduit \u2014 le message d\u2019accueil, la carte de revenus, les statistiques rapides, les alertes de stock faible, les actions rapides, et la liste des ventes récentes, ainsi que le titre de la barre supérieure de chaque écran, dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes, Paramètres, Clients, Fournisseurs, Sauvegarde et Tableau de bord qui sont tous faits \u2014 Scanner, Rapports et Inventaire sont les prochains.',
          },
        },
        {
          icon: Icon('database'),
          text: {
            en: 'Backup & Restore is now fully translated \u2014 the data summary, export/import, CSV export, and the danger-zone data-clearing flow, in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, Suppliers, and Backup all done \u2014 Scanner, Reports, and Inventory are next.',
            ar: 'النسخ الاحتياطي والاستعادة أصبحا الآن مترجمَين بالكامل \u2014 ملخص البيانات، التصدير/الاستيراد، تصدير CSV، ومسار منطقة الخطر لمسح البيانات، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات والعملاء والموردون والنسخ الاحتياطي قد اكتملت جميعًا \u2014 الماسح والتقارير والمخزون هي التالية.',
            fr: 'Sauvegarde et Restauration sont désormais entièrement traduites \u2014 le résumé des données, l\u2019export/import, l\u2019export CSV, et le parcours de la zone dangereuse pour effacer les données, dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes, Paramètres, Clients, Fournisseurs et Sauvegarde qui sont tous faits \u2014 Scanner, Rapports et Inventaire sont les prochains.',
          },
        },
        {
          icon: Icon('truck'),
          text: {
            en: 'Suppliers is now fully translated \u2014 the list, add/edit form, and supplier details (including linked products), in all 3 languages. That\u2019s Products, POS, Sales, Settings, Customers, and Suppliers all done \u2014 Backup, Scanner, Reports, and Inventory are next.',
            ar: 'الموردون أصبحوا الآن مترجمين بالكامل \u2014 القائمة، نموذج الإضافة/التعديل، وتفاصيل المورد (بما في ذلك المنتجات المرتبطة)، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات والعملاء والموردون قد اكتملوا جميعًا \u2014 النسخ الاحتياطي والماسح والتقارير والمخزون هي التالية.',
            fr: 'Fournisseurs est désormais entièrement traduit \u2014 la liste, le formulaire d\u2019ajout/modification, et les détails du fournisseur (y compris les produits liés), dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes, Paramètres, Clients et Fournisseurs qui sont tous faits \u2014 Sauvegarde, Scanner, Rapports et Inventaire sont les prochains.',
          },
        },
        {
          icon: Icon('users'),
          text: {
            en: 'Customers is now fully translated \u2014 the list, add/edit form, customer details, and the POS customer picker, in all 3 languages. That\u2019s Products, POS, Sales, Settings, and Customers all done \u2014 Suppliers, Inventory, Reports, and Backup are next.',
            ar: 'العملاء أصبحوا الآن مترجمين بالكامل \u2014 القائمة، نموذج الإضافة/التعديل، تفاصيل العميل، ومنتقي العميل في نقطة البيع، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات والعملاء قد اكتملوا جميعًا \u2014 الموردون والمخزون والتقارير والنسخ الاحتياطي هي التالية.',
            fr: 'Clients est désormais entièrement traduit \u2014 la liste, le formulaire d\u2019ajout/modification, les détails client, et le sélecteur de client dans la Caisse, dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes, Paramètres et Clients qui sont tous faits \u2014 Fournisseurs, Inventaire, Rapports et Sauvegarde sont les prochains.',
          },
        },
        {
          icon: Icon('settings'),
          text: {
            en: 'Settings is now fully translated \u2014 store info, appearance, Point of Sale, inventory, and the PIN/biometric lock screens, in all 3 languages. That\u2019s Products, POS, Sales, and Settings all done \u2014 Customers, Suppliers, Inventory, Reports, and Backup are next.',
            ar: 'الإعدادات أصبحت الآن مترجمة بالكامل \u2014 معلومات المتجر، المظهر، نقطة البيع، المخزون، وشاشات قفل الرمز السري/البصمة، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات والإعدادات قد اكتملت جميعًا \u2014 العملاء والموردون والمخزون والتقارير والنسخ الاحتياطي هي التالية.',
            fr: 'Les Paramètres sont désormais entièrement traduits \u2014 les infos boutique, l\u2019apparence, le Point de vente, l\u2019inventaire, et les écrans de verrouillage par code/biométrie, dans les 3 langues. C\u2019est donc Produits, Caisse, Ventes et Paramètres qui sont tous faits \u2014 Clients, Fournisseurs, Inventaire, Rapports et Sauvegarde sont les prochains.',
          },
        },
        {
          icon: Icon('cart'),
          text: {
            en: 'POS and Sales are now fully translated too \u2014 cart, checkout, payment, receipts, refunds, and the receipt scanner, in all 3 languages. That\u2019s Products, POS, and Sales all done \u2014 Customers, Suppliers, Inventory, Reports, Settings, and Backup are next.',
            ar: 'نقطة البيع والمبيعات أصبحتا الآن مترجمتين بالكامل أيضًا \u2014 السلة، الدفع، طرق الدفع، الإيصالات، الاسترجاعات، وماسح الإيصالات، في اللغات الثلاث. بهذا تكون المنتجات ونقطة البيع والمبيعات قد اكتملت جميعًا \u2014 العملاء والموردون والمخزون والتقارير والإعدادات والنسخ الاحتياطي هي التالية.',
            fr: 'La Caisse et les Ventes sont désormais elles aussi entièrement traduites \u2014 le panier, le paiement, les modes de règlement, les reçus, les remboursements, et le scanner de reçus, dans les 3 langues. C\u2019est donc Produits, Caisse et Ventes qui sont tous faits \u2014 Clients, Fournisseurs, Inventaire, Rapports, Paramètres et Sauvegarde sont les prochains.',
          },
        },
        {
          icon: Icon('package'),
          text: {
            en: 'Products is now fully translated \u2014 every label, button, form field, and message across adding/editing products, categories, barcodes, and stock adjustments, in all 3 languages.',
            ar: 'المنتجات أصبحت الآن مترجمة بالكامل \u2014 كل تسمية وزر وحقل نموذج ورسالة عبر إضافة/تعديل المنتجات، الفئات، الباركودات، وتعديلات المخزون، في اللغات الثلاث.',
            fr: 'Produits est désormais entièrement traduit \u2014 chaque libellé, bouton, champ de formulaire et message à travers l\u2019ajout/la modification de produits, les catégories, les codes-barres, et les ajustements de stock, dans les 3 langues.',
          },
        },
        {
          icon: Icon('globe'),
          text: {
            en: 'Started adding multiple languages \u2014 English, Arabic (with the Algerian flag), and French. New language picker is the very first screen on a fresh install, and reachable anytime from More \u2192 Language. Navigation, onboarding, and common buttons are translated so far; more screens are being translated in the next few updates.',
            ar: 'بدأنا بإضافة لغات متعددة \u2014 الإنجليزية، العربية (بعلم الجزائر)، والفرنسية. منتقي اللغة الجديد هو أول شاشة تمامًا عند التثبيت الجديد، ويمكن الوصول إليه في أي وقت من \u201cالمزيد\u201d \u2190 \u201cاللغة\u201d. التنقل والتعريف بالتطبيق والأزرار الشائعة مترجمة حتى الآن؛ سيتم ترجمة المزيد من الشاشات في التحديثات القليلة القادمة.',
            fr: 'Nous avons commencé à ajouter plusieurs langues \u2014 l\u2019anglais, l\u2019arabe (avec le drapeau algérien), et le français. Le nouveau sélecteur de langue est le tout premier écran lors d\u2019une installation neuve, et reste accessible à tout moment depuis Plus \u2192 Langue. La navigation, la découverte de l\u2019application et les boutons courants sont traduits pour l\u2019instant ; d\u2019autres écrans seront traduits dans les prochaines mises à jour.',
          },
        },
      ],
    },
    {
      label: 'Earlier \u2014 receipts, confirmations & UI polish',
      items: [
        {
          icon: Icon('scan'),
          text: {
            en: 'Every receipt now has a real, scannable barcode (both on-screen and in the printed PDF), and Sales has a new scan icon in the top bar \u2014 scan any past receipt\u2019s barcode to jump straight to that sale, no searching needed.',
            ar: 'كل إيصال أصبح الآن يحتوي على باركود حقيقي قابل للمسح (على الشاشة وفي ملف PDF المطبوع)، وأصبح لدى شاشة المبيعات أيقونة مسح جديدة في الشريط العلوي \u2014 امسح باركود أي إيصال سابق للانتقال مباشرة إلى تلك العملية، دون الحاجة للبحث.',
            fr: 'Chaque reçu dispose désormais d\u2019un vrai code-barres scannable (à l\u2019écran et dans le PDF imprimé), et Ventes a une nouvelle icône de scan dans la barre supérieure \u2014 scannez le code-barres de n\u2019importe quel reçu passé pour accéder directement à cette vente, sans avoir à chercher.',
          },
        },
        {
          icon: Icon('receipt'),
          text: {
            en: 'Redesigned the receipt layout to match a classic itemized paper receipt \u2014 Qty/Item/Price columns, item discounts shown as their own line, an items-sold count, and a proper footer with the receipt number, date, and time.',
            ar: 'أعدنا تصميم تخطيط الإيصال ليطابق إيصالًا ورقيًا كلاسيكيًا مفصّلاً \u2014 أعمدة الكمية/الصنف/السعر، خصومات الأصناف تظهر كسطر خاص بها، عدّاد للأصناف المباعة، وتذييل مناسب يحتوي على رقم الإيصال والتاريخ والوقت.',
            fr: 'La mise en page du reçu a été repensée pour ressembler à un reçu papier classique détaillé \u2014 des colonnes Qté/Article/Prix, les remises par article affichées sur leur propre ligne, un compteur d\u2019articles vendus, et un pied de page correct avec le numéro de reçu, la date et l\u2019heure.',
          },
        },
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Flipped the direction of the empty-state hint arrow \u2014 let me know if it should go back or point somewhere else entirely.',
            ar: 'عكسنا اتجاه سهم التلميح في الحالة الفارغة \u2014 أخبرني إن كان يجب إعادته أو توجيهه إلى مكان مختلف تمامًا.',
            fr: 'Inversion du sens de la flèche d\u2019indice de l\u2019état vide \u2014 dites-moi si elle doit revenir en arrière ou pointer ailleurs.',
          },
        },
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Fixed the "add your first..." hint arrow overlapping the empty-state text when the promo banner is showing (it pushes everything down, which the hint wasn\u2019t accounting for) \u2014 it now checks for that and keeps clear.',
            ar: 'أصلحنا تداخل سهم تلميح \u201cأضف أول...\u201d مع نص الحالة الفارغة عند ظهور بانر العرض الترويجي (فهو يدفع كل شيء للأسفل، وهو ما لم يكن التلميح يأخذه بعين الاعتبار) \u2014 أصبح الآن يتحقق من ذلك ويبقى بعيدًا.',
            fr: 'Correction du chevauchement de la flèche d\u2019indice \u00ab ajoutez votre premier\u2026 \u00bb avec le texte de l\u2019état vide lorsque la bannière promotionnelle s\u2019affiche (elle repousse tout vers le bas, ce que l\u2019indice ne prenait pas en compte) \u2014 il vérifie désormais cela et reste dégagé.',
          },
        },
        {
          icon: Icon('shield'),
          text: {
            en: 'Every "delete this?" / "clear everything?" / "refund?" confirmation across the app now uses a real themed dialog instead of the browser\u2019s plain native popup \u2014 covers Products, Categories, Customers, Suppliers, Sales refunds, POS cart/checkout, and backup restore/wipe.',
            ar: 'كل تأكيد من نوع \u201cحذف هذا؟\u201d / \u201cمسح كل شيء؟\u201d / \u201cاسترجاع؟\u201d في التطبيق يستخدم الآن نافذة حوار حقيقية بتصميم التطبيق بدلاً من النافذة المنبثقة الأصلية البسيطة للمتصفح \u2014 يشمل ذلك المنتجات والفئات والعملاء والموردين واسترجاعات المبيعات وسلة/دفع نقطة البيع ومسح/استعادة النسخ الاحتياطي.',
            fr: 'Chaque confirmation \u00ab supprimer ceci ? \u00bb / \u00ab tout effacer ? \u00bb / \u00ab rembourser ? \u00bb dans l\u2019application utilise désormais une vraie boîte de dialogue au design de l\u2019application au lieu de la simple popup native du navigateur \u2014 couvre Produits, Catégories, Clients, Fournisseurs, remboursements de Ventes, panier/paiement de la Caisse, et restauration/effacement de sauvegarde.',
          },
        },
        {
          icon: Icon('edit'),
          text: {
            en: 'The empty-state hint arrows now use a real handwriting font instead of a generic system fallback \u2014 should look meaningfully more like an actual note, not just slanted text.',
            ar: 'أسهم التلميح في الحالة الفارغة تستخدم الآن خط يد حقيقي بدلاً من خط النظام الاحتياطي العام \u2014 يجب أن تبدو الآن أقرب بشكل ملحوظ لملاحظة حقيقية، وليس مجرد نص مائل.',
            fr: 'Les flèches d\u2019indice de l\u2019état vide utilisent désormais une vraie police manuscrite au lieu d\u2019une police système générique de secours \u2014 elles devraient ressembler bien davantage à une vraie note manuscrite, pas juste à du texte incliné.',
          },
        },
        {
          icon: Icon('gift'),
          text: {
            en: 'Removed the "Don\u2019t ask again" option from the donate prompt.',
            ar: 'أزلنا خيار \u201cلا تسأل مرة أخرى\u201d من نافذة التبرع.',
            fr: 'Suppression de l\u2019option \u00ab Ne plus demander \u00bb de l\u2019invite de don.',
          },
        },
        {
          icon: Icon('gift'),
          text: {
            en: 'Added a "Preview Popups" spot in More \u2192 About This App \u2192 Troubleshooting \u2014 lets you see the What\u2019s New card and the donate prompt on demand (the donate one only shows up naturally very rarely: 15+ sales, random chance, weeks apart).',
            ar: 'أضفنا خيار \u201cمعاينة النوافذ المنبثقة\u201d في المزيد \u2190 حول هذا التطبيق \u2190 استكشاف الأخطاء \u2014 يتيح لك رؤية بطاقة \u201cما الجديد\u201d ونافذة التبرع عند الطلب (نافذة التبرع تظهر طبيعيًا نادرًا جدًا: بعد 15+ عملية بيع، وبشكل عشوائي، وبفارق أسابيع).',
            fr: 'Ajout d\u2019un emplacement \u00ab Aperçu des popups \u00bb dans Plus \u2192 À propos de l\u2019application \u2192 Dépannage \u2014 permet de voir la carte Nouveautés et l\u2019invite de don à la demande (celle du don n\u2019apparaît naturellement que très rarement : 15+ ventes, au hasard, à plusieurs semaines d\u2019intervalle).',
          },
        },
        {
          icon: Icon('palette'),
          text: {
            en: 'Found the real source of the leftover green: several UI elements \u2014 the revenue trend badge, the promo banner\u2019s glowing border, success badges/toasts, and even the update-download progress bar \u2014 were quietly using a hardcoded green regardless of your theme pack instead of actually following it. All switched to follow the active pack now.',
            ar: 'اكتشفنا المصدر الحقيقي للون الأخضر المتبقي: عدة عناصر في الواجهة \u2014 شارة اتجاه الإيرادات، الحدود المتوهجة لبانر العرض الترويجي، شارات/تنبيهات النجاح، وحتى شريط تقدم تنزيل التحديث \u2014 كانت تستخدم بصمت لونًا أخضر ثابتًا بغض النظر عن حزمة السمة لديك بدلاً من اتباعها فعليًا. كل هذه العناصر تتبع الآن الحزمة النشطة.',
            fr: 'Nous avons trouvé la vraie source du vert résiduel : plusieurs éléments de l\u2019interface \u2014 le badge de tendance des revenus, la bordure lumineuse de la bannière promotionnelle, les badges/toasts de succès, et même la barre de progression du téléchargement de mise à jour \u2014 utilisaient discrètement un vert codé en dur quel que soit votre pack de thème au lieu de le suivre réellement. Tous suivent désormais le pack actif.',
          },
        },
        {
          icon: Icon('zap'),
          text: {
            en: 'Faster launches, especially on older phones \u2014 scripts now load in parallel instead of one at a time, and the barcode scanner / PDF export libraries (744KB combined) only load when you actually use those features instead of on every single launch.',
            ar: 'إطلاق أسرع للتطبيق، خصوصًا على الهواتف الأقدم \u2014 السكربتات تُحمَّل الآن بالتوازي بدلاً من واحدًا تلو الآخر، ومكتبات ماسح الباركود وتصدير PDF (744 كيلوبايت مجتمعة) تُحمَّل فقط عند استخدامك الفعلي لتلك الميزات بدلاً من كل مرة تفتح فيها التطبيق.',
            fr: 'Démarrages plus rapides, surtout sur les téléphones plus anciens \u2014 les scripts se chargent désormais en parallèle au lieu d\u2019un par un, et les bibliothèques du scanner de codes-barres / export PDF (744 Ko au total) ne se chargent que lorsque vous utilisez réellement ces fonctions, au lieu de chaque lancement.',
          },
        },
        {
          icon: Icon('palette'),
          text: {
            en: 'Fixed a few stray lime-green highlights that were slipping through the theme recolor on every illustration, and made the notification icon neutral so it stops clashing with non-green theme packs.',
            ar: 'أصلحنا بعض ظلال اللون الأخضر الفاتح الشاردة التي كانت تفلت من إعادة تلوين السمة في كل رسم توضيحي، وجعلنا أيقونة الإشعار محايدة اللون حتى لا تتعارض مع حزم السمات غير الخضراء.',
            fr: 'Correction de quelques surlignages vert citron résiduels qui échappaient à la recoloration du thème sur chaque illustration, et l\u2019icône de notification est désormais neutre pour ne plus jurer avec les packs de thème non verts.',
          },
        },
        {
          icon: Icon('palette'),
          text: {
            en: 'Theme packs now actually recolor every illustration \u2014 empty states AND onboarding \u2014 including the pale background/shadow tints that were still stubbornly green before.',
            ar: 'حزم السمات تعيد الآن تلوين كل رسم توضيحي فعليًا \u2014 الحالات الفارغة والتعريف بالتطبيق على حد سواء \u2014 بما في ذلك ظلال الخلفية والظل الباهتة التي كانت لا تزال خضراء بعناد من قبل.',
            fr: 'Les packs de thème recolorent désormais réellement chaque illustration \u2014 états vides ET découverte de l\u2019application \u2014 y compris les teintes pâles de fond/ombre qui restaient obstinément vertes auparavant.',
          },
        },
        {
          icon: Icon('zap'),
          text: {
            en: 'Tab swiping feels a lot more direct now \u2014 including on Products/Sales/Inventory, where it used to get eaten by the list rows\u2019 own swipe-to-delete.',
            ar: 'التمرير بين علامات التبويب أصبح يبدو أكثر مباشرة بكثير الآن \u2014 بما في ذلك في المنتجات/المبيعات/المخزون، حيث كان يُلتهم سابقًا بواسطة ميزة السحب للحذف الخاصة بصفوف القائمة.',
            fr: 'Le glissement entre les onglets est désormais bien plus direct \u2014 y compris sur Produits/Ventes/Inventaire, où il se faisait auparavant absorber par le glissement pour supprimer propre aux lignes de liste.',
          },
        },
        {
          icon: Icon('image'),
          text: {
            en: 'Sales now has its own empty-state illustration, matching Products/Customers/Suppliers/POS.',
            ar: 'أصبح لدى المبيعات الآن رسمها التوضيحي الخاص بالحالة الفارغة، مطابقًا للمنتجات/العملاء/الموردين/نقطة البيع.',
            fr: 'Ventes dispose désormais de sa propre illustration d\u2019état vide, à l\u2019image de Produits/Clients/Fournisseurs/Caisse.',
          },
        },
        {
          icon: Icon('palette'),
          text: {
            en: 'New app icon and logo \u2014 home-screen icon, notifications, and the splash screen all updated.',
            ar: 'أيقونة وشعار جديدان للتطبيق \u2014 تم تحديث أيقونة الشاشة الرئيسية والإشعارات وشاشة البدء بالكامل.',
            fr: 'Nouvelle icône et nouveau logo pour l\u2019application \u2014 l\u2019icône de l\u2019écran d\u2019accueil, les notifications et l\u2019écran de démarrage ont tous été mis à jour.',
          },
        },
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Fixed the \u201cadd your first...\u201d hint arrow sticking around after switching tabs, and not coming back after you delete everything again.',
            ar: 'أصلحنا بقاء سهم تلميح \u201cأضف أول...\u201d ظاهرًا بعد تبديل علامات التبويب، وعدم عودته بعد حذف كل شيء مجددًا.',
            fr: 'Correction de la flèche d\u2019indice \u00ab ajoutez votre premier\u2026 \u00bb qui restait affichée après un changement d\u2019onglet, et qui ne revenait pas après avoir de nouveau tout supprimé.',
          },
        },
        {
          icon: Icon('star'),
          text: {
            en: 'Smoothed out a stray outline that was showing up on some buttons, most noticeably onboarding and the + buttons.',
            ar: 'أزلنا حدًا خارجيًا شاردًا كان يظهر على بعض الأزرار، وأكثرها وضوحًا أزرار التعريف بالتطبيق وأزرار +.',
            fr: 'Lissage d\u2019un contour résiduel qui apparaissait sur certains boutons, le plus visible étant ceux de la découverte de l\u2019application et les boutons +.',
          },
        },
        {
          icon: Icon('check-circle'),
          text: {
            en: 'Fixed this What\u2019s New card (and the donate prompt) appearing pinned to the top of the screen instead of centered.',
            ar: 'أصلحنا ظهور بطاقة \u201cما الجديد\u201d هذه (ونافذة التبرع) مثبتة أعلى الشاشة بدلاً من توسيطها.',
            fr: 'Correction de cette carte Nouveautés (et de l\u2019invite de don) qui apparaissait épinglée en haut de l\u2019écran au lieu d\u2019être centrée.',
          },
        },
        {
          icon: Icon('refresh'),
          text: {
            en: 'Sales box is back on the Dashboard, alongside the new revenue hero card.',
            ar: 'عادت بطاقة المبيعات إلى الشاشة الرئيسية، جنبًا إلى جنب مع بطاقة الإيرادات الرئيسية الجديدة.',
            fr: 'La carte des ventes est de retour sur le Tableau de bord, aux côtés de la nouvelle grande carte de revenus.',
          },
        },
      ],
    },
    {
      label: 'Earlier \u2014 live offers, notifications & the update system',
      items: [
        {
          icon: Icon('upload'),
          text: {
            en: 'Forced update system \u2014 the admin can now push a required update that the app can download and install without leaving the app.',
            ar: 'نظام تحديث إلزامي \u2014 يمكن للمسؤول الآن دفع تحديث إلزامي يستطيع التطبيق تنزيله وتثبيته دون مغادرة التطبيق.',
            fr: 'Système de mise à jour forcée \u2014 l\u2019administrateur peut désormais pousser une mise à jour obligatoire que l\u2019application peut télécharger et installer sans quitter l\u2019application.',
          },
        },
        {
          icon: Icon('bar-chart'),
          text: {
            en: 'Anonymous, aggregate-only usage counters (sales made, products/customers/suppliers entered) now report to the developer \u2014 see the updated Terms of Use for exactly what\u2019s included.',
            ar: 'عدّادات استخدام مجهولة الهوية وإجمالية فقط (المبيعات المنجزة، المنتجات/العملاء/الموردون المُدخَلون) تُرسَل الآن إلى المطوّر \u2014 راجع شروط الاستخدام المحدثة لمعرفة ما يشمله ذلك بالضبط.',
            fr: 'Des compteurs d\u2019usage anonymes et purement agrégés (ventes réalisées, produits/clients/fournisseurs saisis) sont désormais transmis au développeur \u2014 consultez les Conditions d\u2019utilisation mises à jour pour savoir exactement ce qui est inclus.',
          },
        },
        {
          icon: Icon('shield'),
          text: {
            en: 'Terms of Use clarified: the App is offered globally, not tied to any single country.',
            ar: 'توضيح في شروط الاستخدام: التطبيق مُقدَّم عالميًا، وغير مرتبط بأي دولة واحدة.',
            fr: 'Clarification des Conditions d\u2019utilisation : l\u2019application est proposée mondialement, sans être liée à un seul pays.',
          },
        },
        {
          icon: Icon('stethoscope'),
          text: {
            en: 'AdMob status is now visible in More \u2192 About This App \u2192 Run Diagnostics \u2014 no computer needed to see what\u2019s happening with ads.',
            ar: 'حالة AdMob أصبحت الآن مرئية في المزيد \u2190 حول هذا التطبيق \u2190 تشغيل التشخيص \u2014 لا حاجة لجهاز كمبيوتر لمعرفة ما يحدث مع الإعلانات.',
            fr: 'L\u2019état d\u2019AdMob est désormais visible dans Plus \u2192 À propos de l\u2019application \u2192 Lancer le diagnostic \u2014 plus besoin d\u2019ordinateur pour voir ce qui se passe avec les publicités.',
          },
        },
        {
          icon: Icon('lock'),
          text: {
            en: 'Fixed a missing consent step that was silently blocking every AdMob ad request.',
            ar: 'أصلحنا خطوة موافقة مفقودة كانت تحجب بصمت كل طلب إعلان من AdMob.',
            fr: 'Correction d\u2019une étape de consentement manquante qui bloquait silencieusement chaque requête publicitaire AdMob.',
          },
        },
        {
          icon: Icon('settings'),
          text: {
            en: 'Control panel rebuilt \u2014 tabs, auto-loads what\u2019s currently live, a connection test button, and a raw JSON preview.',
            ar: 'أعدنا بناء لوحة التحكم \u2014 تبويبات، تحميل تلقائي لما هو مفعّل حاليًا، زر اختبار الاتصال، ومعاينة JSON الخام.',
            fr: 'Le panneau de contrôle a été reconstruit \u2014 des onglets, un chargement automatique de ce qui est actuellement en ligne, un bouton de test de connexion, et un aperçu JSON brut.',
          },
        },
        {
          icon: Icon('bell'),
          text: {
            en: 'New "Ad Source" control in the panel \u2014 run your own ad, real AdMob ads, or alternate between both, from one switch.',
            ar: 'عنصر تحكم جديد \u201cمصدر الإعلان\u201d في اللوحة \u2014 شغّل إعلانك الخاص، أو إعلانات AdMob الحقيقية، أو ناوب بينهما، من مفتاح واحد.',
            fr: 'Nouveau contrôle \u00ab Source de la publicité \u00bb dans le panneau \u2014 diffusez votre propre publicité, de vraies publicités AdMob, ou alternez entre les deux, depuis un seul interrupteur.',
          },
        },
        {
          icon: Icon('zap'),
          text: {
            en: 'Fixed a race condition where the push notification could arrive before the app was actually able to see the new ad it was announcing.',
            ar: 'أصلحنا حالة تسابق كان يمكن فيها أن يصل إشعار الدفع قبل أن يتمكن التطبيق فعليًا من رؤية الإعلان الجديد الذي يعلن عنه.',
            fr: 'Correction d\u2019une situation de compétition où la notification push pouvait arriver avant que l\u2019application ne puisse réellement voir la nouvelle publicité qu\u2019elle annonçait.',
          },
        },
        {
          icon: Icon('refresh'),
          text: {
            en: 'Opening the app (including from a new-offer notification) now always shows the latest ad right away, instead of a stale cached one.',
            ar: 'فتح التطبيق (بما في ذلك من إشعار عرض جديد) يعرض الآن دائمًا أحدث إعلان فورًا، بدلاً من إعلان قديم مخزّن مؤقتًا.',
            fr: 'Ouvrir l\u2019application (y compris depuis une notification de nouvelle offre) affiche désormais toujours la dernière publicité immédiatement, au lieu d\u2019une ancienne version en cache.',
          },
        },
        {
          icon: Icon('zap'),
          text: {
            en: 'New offers now push to your phone the instant they\u2019re published \u2014 even if the app is closed.',
            ar: 'العروض الجديدة تُرسَل الآن إلى هاتفك فور نشرها \u2014 حتى لو كان التطبيق مغلقًا.',
            fr: 'Les nouvelles offres sont désormais poussées vers votre téléphone dès leur publication \u2014 même si l\u2019application est fermée.',
          },
        },
        {
          icon: Icon('bell'),
          text: {
            en: 'The app now asks for notification permission up front, so new-offer alerts are ready to go from the start.',
            ar: 'التطبيق يطلب الآن إذن الإشعارات من البداية، حتى تكون تنبيهات العروض الجديدة جاهزة منذ الانطلاق.',
            fr: 'L\u2019application demande désormais la permission de notification dès le départ, pour que les alertes de nouvelles offres soient prêtes dès le début.',
          },
        },
        {
          icon: Icon('image'),
          text: {
            en: 'Offer notifications always show your app logo, and now pop up properly instead of landing silently.',
            ar: 'إشعارات العروض تعرض دائمًا شعار تطبيقك، وتظهر الآن بشكل صحيح بدلاً من الوصول بصمت.',
            fr: 'Les notifications d\u2019offres affichent toujours le logo de votre application, et s\u2019affichent désormais correctement au lieu d\u2019arriver silencieusement.',
          },
        },
        {
          icon: Icon('star'),
          text: {
            en: 'Custom image banners now get the same glowing themed border and light sweep as other offer cards.',
            ar: 'بانرات الصور المخصصة تحصل الآن على نفس الحدود المتوهجة بتصميم السمة وتأثير مرور الضوء مثل بطاقات العروض الأخرى.',
            fr: 'Les bannières image personnalisées bénéficient désormais de la même bordure lumineuse thématique et du même effet de balayage lumineux que les autres cartes d\u2019offres.',
          },
        },
        {
          icon: Icon('settings'),
          text: {
            en: 'Fixed a bug where updates could silently fail to apply until app data was cleared.',
            ar: 'أصلحنا خللاً كان يمكن أن يتسبب في فشل تطبيق التحديثات بصمت إلى أن يتم مسح بيانات التطبيق.',
            fr: 'Correction d\u2019un bug où les mises à jour pouvaient silencieusement échouer à s\u2019appliquer tant que les données de l\u2019application n\u2019étaient pas effacées.',
          },
        },
      ],
    },
    {
      label: 'Earliest releases',
      items: [
        {
          icon: Icon('tag'),
          text: {
            en: 'New Standard theme \u2014 clean black/white/grey with formal line icons instead of emoji.',
            ar: 'سمة \u201cقياسية\u201d جديدة \u2014 أسود/أبيض/رمادي أنيق مع أيقونات خطية رسمية بدلاً من الرموز التعبيرية.',
            fr: 'Nouveau thème Standard \u2014 un noir/blanc/gris épuré avec des icônes filaires formelles au lieu d\u2019emoji.',
          },
        },
        {
          icon: Icon('undo'),
          text: {
            en: 'Partial refunds \u2014 pick exactly which items, and how many, to return.',
            ar: 'استرجاعات جزئية \u2014 اختر بالضبط أي الأصناف، وكم منها، تريد إرجاعه.',
            fr: 'Remboursements partiels \u2014 choisissez exactement quels articles, et en quelle quantité, retourner.',
          },
        },
        {
          icon: Icon('scroll'),
          text: {
            en: 'Added Terms of Use \u2014 readable any time from More.',
            ar: 'أضفنا شروط الاستخدام \u2014 يمكن قراءتها في أي وقت من \u201cالمزيد\u201d.',
            fr: 'Ajout des Conditions d\u2019utilisation \u2014 consultables à tout moment depuis Plus.',
          },
        },
        {
          icon: Icon('star'),
          text: {
            en: 'A friendlier first-run tour and noticeably smoother motion everywhere.',
            ar: 'جولة أول استخدام أكثر ودّية وحركة أكثر سلاسة بشكل ملحوظ في كل مكان.',
            fr: 'Une visite de première utilisation plus conviviale et des animations sensiblement plus fluides partout.',
          },
        },
      ],
    },
  ];

  function markSeen() {
    localStorage.setItem(KEY, CURRENT_VERSION);
  }

  /** Returns true if it actually showed something, so callers (boot())
   *  can avoid also popping the donation prompt in the same session. */
  function maybeShow() {
    const last = localStorage.getItem(KEY);
    if (last === CURRENT_VERSION) return false;
    show();
    return true;
  }

  function groupHeaderLabel(group) {
    if (group.label) return group.label;
    if (group.versionRange) return `v${group.versionRange[0]} \u2013 v${group.versionRange[1]}`;
    return `v${group.version}`;
  }

  function show() {
    const overlay = document.createElement('div');
    overlay.className = 'onboard-overlay';
    overlay.style.pointerEvents = 'auto'; // a real modal, not a spotlight-through overlay
    document.body.appendChild(overlay);
    Fx.animate(overlay, { opacity: [0, 1] }, { duration: 0.2 });

    const card = document.createElement('div');
    card.className = 'onboard-finale whatsnew-card';
    card.innerHTML = `
      <div class="onboard-finale__icon">\u2728</div>
      <div class="onboard-finale__title">${I18n.t('whatsnew.title')}</div>
      <div class="onboard-finale__sub" style="margin-bottom:14px;">v${CURRENT_VERSION}</div>
      <div class="whatsnew-list stagger">
        ${CHANGELOG.map((group) => `
          <div>
            <div class="whatsnew-group__header">
              <span class="whatsnew-group__version">${escapeHTML(groupHeaderLabel(group))}</span>
              <span class="whatsnew-group__rule"></span>
            </div>
            <div class="whatsnew-group__rows">
              ${group.items.map((it) => `
                <div class="whatsnew-row">
                  <span class="whatsnew-row__icon">${it.icon}</span>
                  <span class="whatsnew-row__text">${escapeHTML(it.text[I18n.locale] || it.text.en)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="onboard-start-btn tappable" id="whatsNewDoneBtn" style="margin-top:18px;">${I18n.t('whatsnew.doneBtn')}</button>
    `;
    overlay.appendChild(card);
    Fx.animate(card, { opacity: [0, 1], scale: [0.85, 1], y: [16, 0] }, { type: 'spring', stiffness: 400, damping: 15 });

    card.querySelector('#whatsNewDoneBtn').addEventListener('click', () => {
      markSeen();
      Fx.animate(overlay, { opacity: [1, 0] }, { duration: 0.2 }).finished.then(() => overlay.remove());
    });
  }

  return { maybeShow, markSeen, show };
})();
window.WhatsNew = WhatsNew;
