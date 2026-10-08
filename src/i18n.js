/* Tiny i18n layer (Amharic / English) with no extra dependency.
 * - The tenant's choice is remembered in localStorage.
 * - Default language is Amharic.
 * - Use inside a component:  const { t, lang } = useI18n();  t("key") or t("key", { n: 3 })
 */
import { useSyncExternalStore } from "react";

const KEY = "bereka-lang";
let lang = "am";
try {
  const saved = localStorage.getItem(KEY);
  if (saved === "en" || saved === "am") lang = saved;
} catch { /* storage unavailable: keep default */ }
if (typeof document !== "undefined") document.documentElement.lang = lang;

const listeners = new Set();
export const getLang = () => lang;

export function setLang(next) {
  if (next !== "am" && next !== "en") return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const DICT = {
  am: {
    app: "በረካ ህንፃ",
    logout: "ውጣ",
    changePw: "🔑 ቃል ቀይር",
    loading: "በመጫን ላይ...",
    noTenantData: "ከመለያዎ ጋር የተገናኘ የተከራይ መረጃ አልተገኘም። እባክዎ አስተዳዳሪውን ያነጋግሩ።",
    myInfo: "በረካ ህንፃ — የእኔ መረጃ",
    today: "ዛሬ",
    era: "ዓ.ም",
    errGeneric: "ስህተት ተፈጥሯል፤ እንደገና ሞክር።",
    contractStart: "ውል የጀመረበት",
    contractEnd: "ውል የሚያበቃበት",
    payEnd: "ክፍያ የሚያበቃበት",
    amt3: "የ3 ወር ክፍያ",
    amt6: "የ6 ወር ክፍያ",
    incTitle: "አዲስ ኪራይ ጭማሪ",
    incPrev3: "ቀድሞ የነበረ የ3 ወር ክፍያ",
    incInc: "ጭማሪ",
    incTotal3: "አዲስ ጠቅላላ የ3 ወር ክፍያ",
    history: "የክፍያ ታሪክ",
    noPay: "እስካሁን የተመዘገበ ክፍያ የለም።",
    cycle: "{n} ወር",
    loginSub: "ለመቀጠል መግቢያ ስምዎን እና የይለፍ ቃል ያስገቡ",
    userLabel: "ኢሜይል ወይም ስልክ ቁጥር (Email / Phone)",
    passLabel: "የይለፍ ቃል (Password)",
    loginBtn: "ግባ (Login)",
    forgot: "የይለፍ ቃል ረስተዋል? (Forgot Password?)",
    badLogin: "የተሳሳተ መግቢያ ስም ወይም የይለፍ ቃል አሉ።",
    needEmail: "እባክዎ በመጀመሪያ ኢሜይልዎን ያስገቡ።",
    phoneReset: "በስልክ ቁጥር ለሚገቡ ተከራዮች የይለፍ ቃል የሚቀየረው በአስተዳዳሪው በኩል ነው። እባክዎ አስተዳዳሪውን ያነጋግሩ።",
    resetSent: "የይለፍ ቃል መቀየሪያ ሊንክ ወደ ኢሜይልዎ ተልኳል። ኢሜይልዎን ይመልከቱ (Spam ጭምር)።",
    showPw: "የይለፍ ቃል አሳይ",
    hidePw: "የይለፍ ቃል ደብቅ",
    newPwTitle: "አዲስ የይለፍ ቃል",
    newPwSub: "አዲስ የይለፍ ቃልዎን ያስገቡ",
    newPw: "አዲስ የይለፍ ቃል",
    repeatPw: "የይለፍ ቃል ድገም",
    saveBtn: "አስቀምጥ (Save)",
    pwShort: "የይለፍ ቃል ቢያንስ 6 ፊደል/ቁጥር መሆን አለበት።",
    pwMismatch: "ሁለቱ የይለፍ ቃሎች አይመሳሰሉም።",
    chTitle: "የይለፍ ቃል ቀይር",
    chSub: "መጀመሪያ አሁን ያለዎትን የይለፍ ቃል ያስገቡ",
    curPw: "አሁን ያለው የይለፍ ቃል",
    newPw6: "አዲስ የይለፍ ቃል (ቢያንስ 6 ፊደል/ቁጥር)",
    repeatNew: "አዲሱን የይለፍ ቃል ድገም",
    newPwShort: "አዲሱ የይለፍ ቃል ቢያንስ 6 ፊደል/ቁጥር መሆን አለበት።",
    samePw: "አዲሱ የይለፍ ቃል ከአሁኑ የተለየ መሆን አለበት።",
    curWrong: "አሁን ያለው የይለፍ ቃል ትክክል አይደለም።",
    pwChanged: "የይለፍ ቃልዎ ተቀይሯል።",
    cancel: "ተመለስ (Cancel)",
    backToPage: "ወደ ገጹ ተመለስ",
    noAccess: "መለያዎ ገና ሚና አልተሰጠውም። እባክዎ አስተዳዳሪውን ያነጋግሩ።",
    payEyebrow: "በባንክ ማስተላለፍ ክፍያ · PAYMENT BY BANK TRANSFER",
    payTitle: "ክፍያ እና ጥያቄ",
    payIntro: "የኪራይ ክፍያዎን ከታች ከተዘረዘሩት ሂሳቦች በአንዱ ይላኩ።",
    bank: "ባንክ",
    accountN: "ሂሳብ {n}",
    holder: "የሂሳቡ ባለቤት",
    accNumber: "የሂሳብ ቁጥር",
    copy: "ቅዳ",
    copied: "ተቀድቷል",
    copyHint: "ቁጥሩን ለመቅዳት ይጫኑ",
    okBold: "ክፍያውን ከላኩ በኋላ",
    okRest: " የደረሰኙን ወይም የ SMS ማረጋገጫውን በ Telegram ያሳዩን።",
    step1: "ክፍያውን በባንክ ይላኩ።",
    step2: "የደረሰኙን ወይም የ SMS ማረጋገጫውን ፎቶ (screenshot) ያንሱ።",
    step3: "በ Telegram ከስምዎና ከክፍል ቁጥርዎ ጋር ይላኩልን።",
    tgBtn: "የክፍያ ደረሰኝ ይላኩ ወይም ጥያቄ ካለዎት ይጠይቁ",
    tgOfficial: "ትክክለኛው የ Telegram አድራሻ፦",
    tgNotOpen: "አልተከፈተም?",
    tgWeb: "በድር ላይ በ Telegram ይክፈቱ",
    thanks: "እናመሰግናለን!",
    tgMsg: "ሰላም፣\nስሜ፦ {name}\nየክፍል ቁጥር፦ {rooms}\nየክፍያ ደረሰኝ ልኬያለሁ።",
    statusUnknown: "ቀን አልተነበበም",
    statusLate: "ያልተከፈለ · {n} ቀን አለፈ",
    statusSoon: "በ{n} ቀን ያልቃል",
    statusPaid: "የተከፈለ · {n} ቀን ቀሪ",
    currency: "ብር",
  },
  en: {
    app: "Bereka Building",
    logout: "Log out",
    changePw: "🔑 Change password",
    loading: "Loading...",
    noTenantData: "No tenant information is linked to your account. Please contact the administrator.",
    myInfo: "Bereka Building — My information",
    today: "Today",
    era: "E.C.",
    errGeneric: "Something went wrong. Please try again.",
    contractStart: "Contract start",
    contractEnd: "Contract end",
    payEnd: "Next payment due",
    amt3: "3-month payment",
    amt6: "6-month payment",
    incTitle: "New rent increase",
    incPrev3: "Previous 3-month payment",
    incInc: "Increase",
    incTotal3: "New total 3-month payment",
    history: "Payment history",
    noPay: "No payment has been recorded yet.",
    cycle: "{n} months",
    loginSub: "Enter your username and password to continue",
    userLabel: "Email or phone number",
    passLabel: "Password",
    loginBtn: "Log in",
    forgot: "Forgot your password?",
    badLogin: "Incorrect username or password.",
    needEmail: "Please enter your email first.",
    phoneReset: "If you log in with a phone number, your password can only be reset by the administrator. Please contact the administrator.",
    resetSent: "A password reset link has been sent to your email. Check your inbox (and your Spam folder).",
    showPw: "Show password",
    hidePw: "Hide password",
    newPwTitle: "New password",
    newPwSub: "Enter your new password",
    newPw: "New password",
    repeatPw: "Repeat password",
    saveBtn: "Save",
    pwShort: "The password must be at least 6 characters.",
    pwMismatch: "The two passwords do not match.",
    chTitle: "Change password",
    chSub: "First enter your current password",
    curPw: "Current password",
    newPw6: "New password (at least 6 characters)",
    repeatNew: "Repeat the new password",
    newPwShort: "The new password must be at least 6 characters.",
    samePw: "The new password must be different from the current one.",
    curWrong: "The current password is incorrect.",
    pwChanged: "Your password has been changed.",
    cancel: "Cancel",
    backToPage: "Back to the page",
    noAccess: "Your account has not been given a role yet. Please contact the administrator.",
    payEyebrow: "PAYMENT BY BANK TRANSFER",
    payTitle: "Payment and questions",
    payIntro: "Send your rent payment to one of the accounts below.",
    bank: "Bank",
    accountN: "Account {n}",
    holder: "Account holder",
    accNumber: "Account number",
    copy: "Copy",
    copied: "Copied",
    copyHint: "Tap to copy the number",
    okBold: "After sending the payment,",
    okRest: " show us your receipt or SMS confirmation on Telegram.",
    step1: "Send the payment by bank transfer.",
    step2: "Take a screenshot of your receipt or SMS confirmation.",
    step3: "Send it to us on Telegram with your name and room number.",
    tgBtn: "Send your payment receipt or ask a question",
    tgOfficial: "Official Telegram username:",
    tgNotOpen: "Not opening?",
    tgWeb: "Open Telegram on the web",
    thanks: "Thank you!",
    tgMsg: "Hello,\nName: {name}\nRoom number: {rooms}\nI have sent my payment receipt.",
    statusUnknown: "Date not read",
    statusLate: "Unpaid · {n} days overdue",
    statusSoon: "Ends in {n} days",
    statusPaid: "Paid · {n} days left",
    currency: "ETB",
  },
};

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : s);

export function translate(l, key, vars) {
  return fill(DICT[l]?.[key] ?? DICT.am[key] ?? key, vars);
}

export function useI18n() {
  const l = useSyncExternalStore(subscribe, getLang, getLang);
  return { lang: l, t: (key, vars) => translate(l, key, vars) };
}

export const _DICT_FOR_TESTS = DICT;