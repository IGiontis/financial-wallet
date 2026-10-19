// ─── Terms of use and privacy policy ─────────────────────────────────────────
//
// Written from what the app actually does — checked against the code when
// written (12 Oct 2026): Firebase Authentication (email and password, or
// Google) and Cloud Firestore for the data, Netlify for the site, the
// exchange-rate API asked for currencies only, Google Analytics only after a
// yes on the cookie notice (13 Oct 2026, `lib/analytics`), Firebase App Check with
// reCAPTCHA Enterprise once a site key is set (19 Oct 2026, `firebase/config`), no advertising, a
// copy kept on the device for speed, and deleting the
// account from Settings removing everything. Change the code in any of those
// respects and this text has to change with it.
//
// A plain-language draft, not legal advice: worth a lawyer's read before the
// app is offered to people beyond the owner and friends.

export type LegalDoc = "terms" | "privacy";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalText {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** When the texts last changed — shown on both pages. */
export const LEGAL_UPDATED = new Date(2026, 9, 19);

/** Where to get in touch. A public page, already linked from the footer. */
export const LEGAL_CONTACT_URL = "https://igiontisportfolio.netlify.app/#home";

const el: Record<LegalDoc, LegalText> = {
  privacy: {
    title: "Πολιτική Απορρήτου",
    intro:
      "Το MyFiWallet είναι μια εφαρμογή για να κρατάς τα οικονομικά σου. Τα δεδομένα που γράφεις είναι δικά σου: χρησιμοποιούνται μόνο για να σου δείχνει η εφαρμογή τα δικά σου νούμερα, δεν πουλιούνται και δεν χρησιμοποιούνται για διαφήμιση.",
    sections: [
      {
        heading: "Ποιος είναι υπεύθυνος",
        paragraphs: ["Υπεύθυνος για την επεξεργασία των δεδομένων είναι ο δημιουργός της εφαρμογής, Ilias Giontis. Τρόπος επικοινωνίας υπάρχει στο τέλος αυτής της σελίδας."],
      },
      {
        heading: "Ποια δεδομένα κρατάμε",
        items: [
          "Τα στοιχεία του λογαριασμού σου: το email σου και, αν συνδεθείς με Google, το όνομα και τη φωτογραφία του λογαριασμού σου Google.",
          "Ό,τι γράφεις στην εφαρμογή: συναλλαγές, κατηγορίες, πάγια, έσοδα, στόχους, επενδύσεις, δάνεια (μαζί με τα ονόματα των προσώπων που γράφεις εσύ), τα υπόλοιπα τραπεζών και μετρητών που καταχωρείς και τις ρυθμίσεις σου.",
        ],
        paragraphs: ["Η εφαρμογή δεν συνδέεται με τράπεζες και δεν ζητά ποτέ αριθμούς καρτών, IBAN ή κωδικούς e-banking. Τα υπόλοιπα που βλέπεις είναι αυτά που γράφεις εσύ."],
      },
      {
        heading: "Γιατί τα χρησιμοποιούμε",
        paragraphs: [
          "Μόνο για να λειτουργεί η εφαρμογή για σένα: να αποθηκεύει ό,τι γράφεις, να υπολογίζει σύνολα, προβλέψεις και στατιστικά, και να συγχρονίζει τις συσκευές σου. Νομική βάση είναι η παροχή της υπηρεσίας που ζητάς (άρθρο 6 παρ. 1 στοιχ. β΄ του Γενικού Κανονισμού για την Προστασία Δεδομένων).",
        ],
      },
      {
        heading: "Πού αποθηκεύονται",
        paragraphs: [
          "Ο λογαριασμός και τα δεδομένα σου αποθηκεύονται στις υπηρεσίες Firebase της Google (Authentication και Cloud Firestore). Η ιστοσελίδα φιλοξενείται στη Netlify. Οι πάροχοι αυτοί επεξεργάζονται τα δεδομένα μόνο για λογαριασμό της εφαρμογής. Μπορεί να αποθηκεύονται και εκτός Ευρωπαϊκής Ένωσης, με τις εγγυήσεις που προβλέπουν οι ίδιοι οι πάροχοι (όπως οι Τυποποιημένες Συμβατικές Ρήτρες της ΕΕ).",
          "Για τις ισοτιμίες νομισμάτων η εφαρμογή ρωτά την υπηρεσία exchangerate-api.com. Της στέλνει μόνο ποιο νόμισμα σε ενδιαφέρει, κανένα δικό σου στοιχείο.",
        ],
      },
      {
        heading: "Στη συσκευή σου",
        paragraphs: [
          "Η εφαρμογή κρατά στον browser σου τις προτιμήσεις σου (θέμα, γλώσσα, στυλ μενού) και ένα αντίγραφο των δεδομένων σου, ώστε να ανοίγει γρήγορα και να δουλεύει χωρίς σύνδεση. Το αντίγραφο αυτό σβήνει όταν αποσυνδέεσαι. Μπορείς επίσης να το σβήσεις οποιαδήποτε στιγμή από τις ρυθμίσεις του browser σου (δεδομένα ιστότοπου).",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Ό,τι αποθηκεύεται στον browser για να μένεις συνδεδεμένος και για να λειτουργεί η εφαρμογή είναι απαραίτητο και δεν χρειάζεται τη συναίνεσή σου.",
          "Μόνο αν πατήσεις «Αποδοχή» στο σχετικό μήνυμα, χρησιμοποιούμε το Google Analytics for Firebase για να μετράμε πόσοι χρησιμοποιούν την εφαρμογή, από ποια χώρα και από ποια συσκευή, και ποιες σελίδες ανοίγουν. Αυτό βάζει cookies στατιστικών της Google. Δεν του στέλνουμε το email σου, τον λογαριασμό σου ούτε κανένα οικονομικό σου στοιχείο. Αν πατήσεις «Όχι, ευχαριστώ», δεν φορτώνεται καθόλου. Μπορείς να αλλάξεις γνώμη οποιαδήποτε στιγμή από το «Cookies» στο κάτω μέρος της σελίδας.",
          "Το reCAPTCHA που προστατεύει την εφαρμογή από κατάχρηση (δες την αντίστοιχη ενότητα) μπορεί να βάλει cookie ασφαλείας, απαραίτητο για τη λειτουργία αυτής της προστασίας.",
          "Δεν χρησιμοποιούμε cookies διαφήμισης.",
        ],
      },
      {
        heading: "Προστασία από κατάχρηση (reCAPTCHA)",
        paragraphs: [
          "Για να μην μπορούν αυτοματοποιημένα προγράμματα να φορτώνουν την εφαρμογή με αιτήματα, χρησιμοποιούμε το Firebase App Check με το reCAPTCHA της Google (Google Cloud Fraud Defense). Δεν σου ζητά να λύσεις τίποτα: ελέγχει στο παρασκήνιο αν η επίσκεψη προέρχεται από άνθρωπο, και για αυτό η Google λαμβάνει στοιχεία της συσκευής και της επίσκεψής σου (όπως διεύθυνση IP και δεδομένα του προγράμματος περιήγησης) και μπορεί να βάζει cookie ασφαλείας. Τα στοιχεία αυτά δεν περιέχουν τίποτα από όσα γράφεις στην εφαρμογή. Η χρήση τους διέπεται από την Πολιτική Απορρήτου και τους Όρους Παροχής Υπηρεσιών της Google. Νομική βάση είναι το έννομο συμφέρον μας να προστατεύουμε την υπηρεσία από κατάχρηση (άρθρο 6 παρ. 1 στοιχ. στ΄ του ΓΚΠΔ), και γι' αυτό δεν ζητά τη συναίνεσή σου.",
        ],
      },
      {
        heading: "Με ποιον τα μοιραζόμαστε",
        paragraphs: ["Με κανέναν, πέρα από τους παρόχους που αναφέρονται παραπάνω, και μόνο όσο χρειάζεται για να λειτουργεί η εφαρμογή. Τα δεδομένα σου δεν πωλούνται και δεν δίνονται σε διαφημιστές."],
      },
      {
        heading: "Πόσο καιρό τα κρατάμε",
        paragraphs: [
          "Όσο έχεις λογαριασμό. Από τις Ρυθμίσεις μπορείς να διαγράψεις τον λογαριασμό σου, και μαζί του σβήνουν όλα τα δεδομένα σου. Αντίγραφα ασφαλείας των παρόχων μπορεί να τα κρατούν για περιορισμένο διάστημα μετά, όπως ορίζουν οι δικοί τους όροι.",
        ],
      },
      {
        heading: "Τα δικαιώματά σου",
        items: [
          "Να δεις τα δεδομένα σου και να τα διορθώσεις — τα περισσότερα απευθείας μέσα από την εφαρμογή.",
          "Να ζητήσεις να διαγραφούν — ή να τα διαγράψεις μόνος σου από τις Ρυθμίσεις.",
          "Να ζητήσεις αντίγραφό τους σε μορφή που διαβάζεται από υπολογιστή.",
          "Να αντιταχθείς ή να ζητήσεις περιορισμό της επεξεργασίας.",
          "Να υποβάλεις καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (www.dpa.gr).",
        ],
      },
      {
        heading: "Ασφάλεια",
        paragraphs: ["Η επικοινωνία με την εφαρμογή γίνεται κρυπτογραφημένα (HTTPS) και τα δεδομένα κάθε χρήστη είναι προσβάσιμα μόνο από τον δικό του λογαριασμό. Κανένα σύστημα δεν είναι απόλυτα ασφαλές· κράτα τον κωδικό σου μυστικό."],
      },
      {
        heading: "Ανήλικοι",
        paragraphs: ["Η εφαρμογή απευθύνεται σε ενήλικες, 18 ετών και άνω. Δεν συλλέγουμε εν γνώσει μας δεδομένα ανηλίκων· αν πιστεύεις ότι ανήλικος έχει δημιουργήσει λογαριασμό, επικοινώνησε μαζί μας για να διαγραφεί."],
      },
      {
        heading: "Αλλαγές και επικοινωνία",
        paragraphs: ["Αν αλλάξει κάτι σε αυτή την πολιτική, θα αλλάξει και η ημερομηνία στην κορυφή της σελίδας. Για ερωτήσεις ή για να ασκήσεις κάποιο από τα δικαιώματά σου, επικοινώνησε μέσω της σελίδας του δημιουργού."],
      },
    ],
  },
  terms: {
    title: "Όροι Χρήσης",
    intro: "Χρησιμοποιώντας το MyFiWallet συμφωνείς με τους παρακάτω όρους. Είναι λίγοι και γραμμένοι απλά.",
    sections: [
      {
        heading: "Η υπηρεσία",
        paragraphs: ["Το MyFiWallet σε βοηθά να καταγράφεις έσοδα, έξοδα, πάγια, στόχους και δάνεια, και να βλέπεις σύνολα, προβλέψεις και στατιστικά από όσα γράφεις. Δεν συνδέεται με τράπεζες και δεν κινεί χρήματα."],
      },
      {
        heading: "Ο λογαριασμός σου",
        items: [
          "Πρέπει να είσαι τουλάχιστον 18 ετών για να δημιουργήσεις λογαριασμό και να χρησιμοποιήσεις την εφαρμογή.",
          "Είσαι υπεύθυνος για ό,τι γίνεται με τον λογαριασμό σου και για το να κρατάς τον κωδικό σου μυστικό.",
          "Τα στοιχεία που δίνεις πρέπει να είναι αληθινά, και ο λογαριασμός είναι για προσωπική χρήση.",
          "Μπορείς να τον διαγράψεις όποτε θέλεις από τις Ρυθμίσεις.",
        ],
      },
      {
        heading: "Όχι οικονομική συμβουλή",
        paragraphs: [
          "Οι υπολογισμοί, οι προβλέψεις και οι εκτιμήσεις της εφαρμογής βγαίνουν από όσα γράφεις και είναι ενδεικτικοί. Δεν αποτελούν οικονομική, φορολογική ή επενδυτική συμβουλή. Για σημαντικές αποφάσεις συμβουλέψου επαγγελματία και έλεγχε τα επίσημα στοιχεία της τράπεζάς σου.",
        ],
      },
      {
        heading: "Σωστή χρήση",
        items: ["Μην προσπαθήσεις να αποκτήσεις πρόσβαση σε δεδομένα άλλων χρηστών ή στα συστήματα της εφαρμογής.", "Μη χρησιμοποιείς την εφαρμογή για παράνομους σκοπούς ή με τρόπο που την επιβαρύνει υπερβολικά."],
      },
      {
        heading: "Διαθεσιμότητα",
        paragraphs: [
          "Η εφαρμογή παρέχεται «ως έχει». Προσπαθούμε να λειτουργεί σωστά και χωρίς διακοπές, αλλά δεν μπορούμε να το εγγυηθούμε, και λειτουργίες μπορεί να αλλάξουν ή να καταργηθούν. Κράτα αντίγραφο ό,τι είναι σημαντικό για σένα.",
        ],
      },
      {
        heading: "Ευθύνη",
        paragraphs: ["Στο μέτρο που επιτρέπει ο νόμος, ο δημιουργός δεν ευθύνεται για ζημίες από τη χρήση της εφαρμογής ή από αποφάσεις που βασίστηκαν σε αυτήν, ούτε για απώλεια δεδομένων από αιτίες εκτός του ελέγχου του."],
      },
      {
        heading: "Πνευματική ιδιοκτησία",
        paragraphs: ["Η εφαρμογή, ο κώδικας και ο σχεδιασμός της ανήκουν στον δημιουργό της. Τα δεδομένα που γράφεις παραμένουν δικά σου."],
      },
      {
        heading: "Αλλαγές στους όρους",
        paragraphs: ["Οι όροι μπορεί να αλλάξουν· η ημερομηνία στην κορυφή δείχνει την τελευταία αλλαγή. Αν συνεχίσεις να χρησιμοποιείς την εφαρμογή μετά από αλλαγή, σημαίνει ότι τη δέχεσαι."],
      },
      {
        heading: "Εφαρμοστέο δίκαιο",
        paragraphs: ["Οι όροι διέπονται από το ελληνικό δίκαιο. Αυτό δεν σου αφαιρεί δικαιώματα που σου δίνει ο νόμος ως καταναλωτή."],
      },
      {
        heading: "Επικοινωνία",
        paragraphs: ["Για ερωτήσεις σχετικά με τους όρους, επικοινώνησε μέσω της σελίδας του δημιουργού."],
      },
    ],
  },
};

const en: Record<LegalDoc, LegalText> = {
  privacy: {
    title: "Privacy Policy",
    intro:
      "MyFiWallet is an app for keeping track of your money. What you enter is yours: it is used only to show you your own figures, it is not sold, and it is not used for advertising.",
    sections: [
      {
        heading: "Who is responsible",
        paragraphs: ["The controller of your data is the app's creator, Ilias Giontis. How to get in touch is at the end of this page."],
      },
      {
        heading: "What we keep",
        items: [
          "Your account details: your email and, if you sign in with Google, your Google account's name and photo.",
          "What you enter in the app: transactions, categories, bills, incomes, goals, investments, debts (including the names of people you type in), the bank and cash balances you record, and your settings.",
        ],
        paragraphs: ["The app does not connect to banks and never asks for card numbers, IBANs or online-banking passwords. The balances you see are the ones you enter."],
      },
      {
        heading: "Why we use it",
        paragraphs: [
          "Only to make the app work for you: to store what you enter, to work out totals, forecasts and statistics, and to keep your devices in sync. The legal basis is providing the service you ask for (Article 6(1)(b) of the General Data Protection Regulation).",
        ],
      },
      {
        heading: "Where it is stored",
        paragraphs: [
          "Your account and data are stored in Google's Firebase services (Authentication and Cloud Firestore). The site is hosted by Netlify. These providers process data only on the app's behalf. Data may be stored outside the European Union, under the safeguards the providers themselves offer (such as the EU Standard Contractual Clauses).",
          "For exchange rates the app asks exchangerate-api.com, sending only which currency it needs — nothing about you.",
        ],
      },
      {
        heading: "On your device",
        paragraphs: [
          "The app keeps your preferences (theme, language, menu style) and a copy of your data in your browser, so it opens quickly and works offline. That copy is removed when you sign out, and you can clear it at any time from your browser's settings (site data).",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "What is stored in your browser to keep you signed in and for the app to work is strictly necessary and needs no consent.",
          "Only if you press «Accept» on the cookie notice, we use Google Analytics for Firebase to count how many people use the app, from which country and on which device, and which pages they open. This sets Google analytics cookies. We do not send it your e-mail, your account or any of your financial data. If you press «No thanks», it is not loaded at all. You can change your mind at any time from «Cookies» at the foot of the page.",
          "The reCAPTCHA that protects the app from abuse (see its own section) may set a security cookie, which that protection needs in order to work.",
          "We use no advertising cookies.",
        ],
      },
      {
        heading: "Protection against abuse (reCAPTCHA)",
        paragraphs: [
          "To stop automated programs from flooding the app with requests, we use Firebase App Check with Google's reCAPTCHA (Google Cloud Fraud Defense). It asks nothing of you: it checks in the background whether a visit comes from a person, and for that Google receives information about your device and visit (such as your IP address and browser data) and may set a security cookie. None of what you write in the app is in it. Its use is governed by Google's Privacy Policy and Terms of Service. The legal basis is our legitimate interest in protecting the service from abuse (Article 6(1)(f) of the GDPR), which is why it does not ask for your consent.",
        ],
      },
      {
        heading: "Who we share it with",
        paragraphs: ["No one beyond the providers named above, and only as far as the app needs them. Your data is not sold or given to advertisers."],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "For as long as you have an account. You can delete your account from Settings, and all your data goes with it. Providers' backups may keep it for a limited time afterwards, as their own terms set out.",
        ],
      },
      {
        heading: "Your rights",
        items: [
          "To see your data and correct it — most of it directly in the app.",
          "To ask for it to be deleted — or delete it yourself from Settings.",
          "To ask for a copy in a machine-readable form.",
          "To object to, or ask to restrict, its processing.",
          "To complain to your data protection authority (in Greece, www.dpa.gr).",
        ],
      },
      {
        heading: "Security",
        paragraphs: ["The app talks to its servers over an encrypted connection (HTTPS), and each user's data can be reached only from their own account. No system is perfectly secure; keep your password to yourself."],
      },
      {
        heading: "Children",
        paragraphs: ["The app is for adults, 18 and over. We do not knowingly collect data from minors; if you believe a minor has created an account, get in touch and it will be deleted."],
      },
      {
        heading: "Changes and contact",
        paragraphs: ["If this policy changes, so will the date at the top of the page. For questions, or to use any of your rights, get in touch through the creator's page."],
      },
    ],
  },
  terms: {
    title: "Terms of Use",
    intro: "By using MyFiWallet you agree to the terms below. There are few of them, written plainly.",
    sections: [
      {
        heading: "The service",
        paragraphs: ["MyFiWallet helps you record income, spending, bills, goals and debts, and shows totals, forecasts and statistics from what you enter. It does not connect to banks and does not move money."],
      },
      {
        heading: "Your account",
        items: ["You must be at least 18 to create an account and use the app.", "You are responsible for what happens under your account and for keeping your password secret.", "The details you give should be true, and the account is for personal use.", "You can delete it whenever you like from Settings."],
      },
      {
        heading: "Not financial advice",
        paragraphs: [
          "The app's calculations, forecasts and estimates come from what you enter and are indicative. They are not financial, tax or investment advice. For important decisions, consult a professional and check your bank's official records.",
        ],
      },
      {
        heading: "Fair use",
        items: ["Do not try to reach other users' data or the app's systems.", "Do not use the app for unlawful purposes or in a way that overloads it."],
      },
      {
        heading: "Availability",
        paragraphs: ["The app is provided \"as is\". We try to keep it working correctly and without interruption, but cannot guarantee it, and features may change or be removed. Keep a copy of anything important to you."],
      },
      {
        heading: "Liability",
        paragraphs: ["As far as the law allows, the creator is not liable for losses arising from using the app or from decisions based on it, or for loss of data from causes outside their control."],
      },
      {
        heading: "Intellectual property",
        paragraphs: ["The app, its code and its design belong to its creator. The data you enter remains yours."],
      },
      {
        heading: "Changes to these terms",
        paragraphs: ["These terms may change; the date at the top shows the last change. Continuing to use the app after a change means you accept it."],
      },
      {
        heading: "Governing law",
        paragraphs: ["These terms are governed by Greek law. This does not take away any rights the law gives you as a consumer."],
      },
      {
        heading: "Contact",
        paragraphs: ["For questions about these terms, get in touch through the creator's page."],
      },
    ],
  },
};

export function legalText(doc: LegalDoc, lang: string | undefined): LegalText {
  return (lang?.startsWith("el") ? el : en)[doc];
}
