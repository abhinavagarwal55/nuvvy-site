import type { Locale } from "./locales";

// Static UI chrome for the gardener surfaces. Flat dotted keys → per-locale
// strings. English is canonical; a missing hi/kn falls back to en (see t()).
//
// Scope: gardener-facing chrome only (login, Today, History, Service Execution,
// nav). Admin/horticulturist screens stay English (out of scope per PRD §1).
// Operational DB content (checklist labels, care actions, special tasks, notes)
// is NOT here — it comes from the DB via pickVariant / AI translation.

export type Phrase = Record<Locale, string>;

export const DICTIONARY: Record<string, Phrase> = {
  // ---- Common ----
  "common.loading": { en: "Loading…", hi: "लोड हो रहा है…", kn: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…" },
  "common.retry": { en: "Failed to load. Pull to refresh.", hi: "लोड नहीं हो सका। रीफ्रेश करने के लिए खींचें।", kn: "ಲೋಡ್ ಆಗಲಿಲ್ಲ. ರಿಫ್ರೆಶ್ ಮಾಡಲು ಎಳೆಯಿರಿ." },
  "common.cancel": { en: "Cancel", hi: "रद्द करें", kn: "ರದ್ದುಮಾಡಿ" },
  "common.save": { en: "Save", hi: "सहेजें", kn: "ಉಳಿಸಿ" },
  "common.done": { en: "Done", hi: "पूर्ण", kn: "ಮುಗಿದಿದೆ" },
  "common.back": { en: "Back", hi: "वापस", kn: "ಹಿಂದೆ" },
  "common.language": { en: "Language", hi: "भाषा", kn: "ಭಾಷೆ" },

  // ---- Nav ----
  "nav.today": { en: "Today", hi: "आज", kn: "ಇಂದು" },
  "nav.history": { en: "History", hi: "इतिहास", kn: "ಇತಿಹಾಸ" },
  "nav.profile": { en: "Profile", hi: "प्रोफ़ाइल", kn: "ಪ್ರೊಫೈಲ್" },
  "nav.logout": { en: "Logout", hi: "लॉग आउट", kn: "ಲಾಗ್ ಔಟ್" },

  // ---- Login ----
  "login.enterPin": { en: "Enter your PIN", hi: "अपना पिन दर्ज करें", kn: "ನಿಮ್ಮ ಪಿನ್ ನಮೂದಿಸಿ" },
  "login.signIn": { en: "Sign in", hi: "साइन इन करें", kn: "ಸೈನ್ ಇನ್" },
  "login.signingIn": { en: "Signing in…", hi: "साइन इन हो रहा है…", kn: "ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ…" },
  "login.error": { en: "Incorrect PIN. Please try again.", hi: "गलत पिन। कृपया पुनः प्रयास करें।", kn: "ತಪ್ಪಾದ ಪಿನ್. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ." },

  // ---- Today ----
  "today.thisWeek": { en: "This Week", hi: "इस सप्ताह", kn: "ಈ ವಾರ" },
  "today.visitsToday": { en: "{count} visits today", hi: "आज {count} विज़िट", kn: "ಇಂದು {count} ಭೇಟಿಗಳು" },
  "today.doneCount": { en: "{count} done", hi: "{count} पूर्ण", kn: "{count} ಮುಗಿದಿದೆ" },
  "today.noUpcoming": { en: "No upcoming visits", hi: "कोई आगामी विज़िट नहीं", kn: "ಮುಂಬರುವ ಭೇಟಿಗಳಿಲ್ಲ" },
  "today.nothingScheduled": { en: "Nothing scheduled for the next 7 days", hi: "अगले 7 दिनों के लिए कुछ भी निर्धारित नहीं", kn: "ಮುಂದಿನ 7 ದಿನಗಳಿಗೆ ಏನೂ ನಿಗದಿಯಾಗಿಲ್ಲ" },
  "today.dayToday": { en: "Today", hi: "आज", kn: "ಇಂದು" },
  "today.dayTomorrow": { en: "Tomorrow", hi: "कल", kn: "ನಾಳೆ" },

  // ---- Status badges ----
  "status.scheduled": { en: "Scheduled", hi: "निर्धारित", kn: "ನಿಗದಿಯಾಗಿದೆ" },
  "status.in_progress": { en: "In Progress", hi: "प्रगति में", kn: "ಪ್ರಗತಿಯಲ್ಲಿದೆ" },
  "status.completed": { en: "Completed", hi: "पूर्ण", kn: "ಪೂರ್ಣಗೊಂಡಿದೆ" },
  "status.not_completed": { en: "Not Completed", hi: "अपूर्ण", kn: "ಪೂರ್ಣಗೊಂಡಿಲ್ಲ" },
  "status.cancelled": { en: "Cancelled", hi: "रद्द", kn: "ರದ್ದಾಗಿದೆ" },

  // ---- Service execution ----
  "service.guidelines": { en: "Nuvvy Service Guidelines", hi: "नुव्वी सेवा दिशानिर्देश", kn: "ನುವ್ವಿ ಸೇವಾ ಮಾರ್ಗಸೂಚಿಗಳು" },
  "service.dos": { en: "Do's", hi: "करें", kn: "ಮಾಡಬೇಕಾದವು" },
  "service.donts": { en: "Don'ts", hi: "न करें", kn: "ಮಾಡಬಾರದವು" },
  "service.start": { en: "Start Service", hi: "सेवा शुरू करें", kn: "ಸೇವೆ ಪ್ರಾರಂಭಿಸಿ" },
  "service.notesFromHorti": { en: "Notes from Horticulturist", hi: "बागवानी विशेषज्ञ के नोट्स", kn: "ತೋಟಗಾರಿಕೆ ತಜ್ಞರ ಟಿಪ್ಪಣಿಗಳು" },
  "service.specialTasks": { en: "Special Tasks for Today", hi: "आज के विशेष कार्य", kn: "ಇಂದಿನ ವಿಶೇಷ ಕಾರ್ಯಗಳು" },
  "service.checklist": { en: "Service Checklist", hi: "सेवा चेकलिस्ट", kn: "ಸೇವಾ ಪರಿಶೀಲನಾ ಪಟ್ಟಿ" },
  "service.end": { en: "End Service", hi: "सेवा समाप्त करें", kn: "ಸೇವೆ ಮುಗಿಸಿ" },
  "service.markNotCompleted": { en: "Mark as Not Completed", hi: "अपूर्ण के रूप में चिह्नित करें", kn: "ಪೂರ್ಣಗೊಂಡಿಲ್ಲ ಎಂದು ಗುರುತಿಸಿ" },
  "service.completed": { en: "Service Completed", hi: "सेवा पूर्ण", kn: "ಸೇವೆ ಪೂರ್ಣಗೊಂಡಿದೆ" },
  "service.backToToday": { en: "Back to Today", hi: "आज पर वापस जाएँ", kn: "ಇಂದಿಗೆ ಹಿಂತಿರುಗಿ" },
  "service.due": { en: "Due {date}", hi: "देय {date}", kn: "ಗಡುವು {date}" },
  "service.autoTranslated": { en: "Auto-translated", hi: "स्वतः अनुवादित", kn: "ಸ್ವಯಂ ಅನುವಾದಿತ" },
  "service.originalEnglish": { en: "Original (English)", hi: "मूल (अंग्रेज़ी)", kn: "ಮೂಲ (ಇಂಗ್ಲಿಷ್)" },
};

export function lookup(key: string, locale: Locale): string | undefined {
  const phrase = DICTIONARY[key];
  if (!phrase) return undefined;
  const val = phrase[locale];
  if (val && val.trim() !== "") return val;
  return phrase.en; // fall back to English within a known key
}
