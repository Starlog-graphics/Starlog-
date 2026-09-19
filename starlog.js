/* ==========================================================================
   Starlog — shared browser JavaScript
   Handles: config, storage, header/footer/nav, community, WhatsApp button,
   design catalogue, toasts, reveal animations, referral + task state.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Config — edit these values only
   -------------------------------------------------------------------------- */
const STARLOG_CONFIG = {
  // TODO: put your WhatsApp number here in international format, no "+" or spaces.
  // Example: "2348012345678". Leave blank and the button will say it's coming soon.
  whatsappNumber: "2348028843808",
  // Set this to your deployed FastAPI Render URL. Local development uses localhost.
  apiBaseUrl: window.STARLOG_API_BASE || "https://starlog-backend.onrender.com",

  /* Three-level pricing. The database is the authority — these values only
     mirror it so the pages can render prices without a round trip. */
  levels: [
    { key: "SIMPLE", label: "Simple", price: 5000 },
    { key: "CLASSIC", label: "Classic", price: 6300 },
    { key: "PREMIUM", label: "Premium", price: 8000 },
    { key: "SUPA", label: "Supa", price: 10000 },
  ],
  currency: "NGN",
  designPrice: 5000, // lowest level — used for "from ₦" copy
  rewardAmount: 1000,


  logoMark: "starlog-mark.png",
  social: {
    facebook: "",
    instagram: "https://instagram.com/starloggraphics",
    x: "https://x.com/@starloggraphics",
    tiktok: "https://tiktok.com/@starlog74",
    youtube: "https://youtube.com/@Starloggraphics",
    telegram: "https://t.me/starloggraphic",
    whatsapp: "https://whatsapp.com/channel/0029VbDg37rADTONzuHhsk1T",
  },
  business: {
    name: "Starlog",
    tagline: "...bringing dreams to light.",
    email: "starloggraphics@yahoo.com",
    phone: "+234 802 884 3808",
    hours: "Mon – Fri · 08:00 – 18:00",
  },
};

/* --- pricing levels -------------------------------------------------------- */
const LEVELS = STARLOG_CONFIG.levels;
const LEVEL_KEYS = LEVELS.map(function (l) { return l.key; });
function levelInfo(key) {
  const k = String(key || "CLASSIC").toUpperCase();
  return LEVELS.find(function (l) { return l.key === k; }) || LEVELS[1];
}
function levelLabel(key) {
  return levelInfo(key).label;
}
function levelPrice(key) {
  return levelInfo(key).price;
}
function levelBadgeHtml(key) {
  const l = levelInfo(key);
  return '<span class="level level-' + l.key.toLowerCase() + '">' + l.label + "</span>";
}


/* --------------------------------------------------------------------------
   3. Storage helpers (browser persistence)
   -------------------------------------------------------------------------- */
const Store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem("starlog:" + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem("starlog:" + key, JSON.stringify(value));
    } catch (_) {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem("starlog:" + key);
    } catch (_) {
      /* ignore */
    }
  },
};

/* --------------------------------------------------------------------------
   2. Catalogue
   -------------------------------------------------------------------------- */
/**
 * Default taxonomy: 16 categories, each with its own subcategories.
 * Admins can manage categories and subcategories from the administration area —
 * the edited copy is persisted and used everywhere on the site automatically.
 */
const DEFAULT_TAXONOMY = [
  { name: "Logos", subs: ["Business Logos", "Brand Logos", "Gaming Logos", "Sports Logos", "Church Logos", "School Logos", "Mascot Logos", "Monogram Logos"] },
  { name: "Flyers", subs: ["Business Flyers", "Church Flyers", "Event Flyers", "Birthday Flyers", "Burial Flyers", "Real Estate Flyers", "Promotional Flyers"] },
  { name: "Posters", subs: ["Event Posters", "Movie Posters", "Music Posters", "Sales Posters", "Motivational Posters"] },
  { name: "Business Cards", subs: ["Corporate Cards", "Minimal Cards", "Luxury Cards", "Creative Cards"] },
  { name: "Wedding Designs", subs: ["Wedding Invitations", "Save the Date", "Wedding Programmes", "Thank You Cards"] },
  { name: "Calendars", subs: ["Wall Calendars", "Desk Calendars", "Corporate Calendars"] },
  { name: "Social Media Designs", subs: ["Instagram Posts", "Facebook Posts", "TikTok Covers", "YouTube Thumbnails", "LinkedIn Banners", "X (Twitter) Posts"] },
  { name: "Banners", subs: ["Roll Up Banners", "Web Banners", "Event Backdrops", "Shop Banners"] },
  { name: "Invitations", subs: ["Birthday Invitations", "Baby Shower Invitations", "Graduation Invitations", "Corporate Invitations"] },
  { name: "Certificates", subs: ["Award Certificates", "Training Certificates", "Church Certificates", "School Certificates"] },
  { name: "Branding", subs: ["Brand Style Guides", "Letterheads", "Company Profiles", "Brand Kits"] },
  { name: "Packaging", subs: ["Product Labels", "Box Packaging", "Pouch Packaging", "Bottle Labels"] },
  { name: "Marketing Materials", subs: ["Brochures", "Catalogues", "Menus", "Price Lists", "Roll Up Adverts"] },
  { name: "Clothing Designs", subs: ["T-Shirt Prints", "Hoodie Prints", "Cap Designs", "Jersey Designs"] },
  { name: "Book & Print", subs: ["Book Covers", "Magazine Covers", "Ebook Covers", "Newspaper Adverts"] },
  { name: "Digital Products", subs: ["Presentation Templates", "Resume Templates", "Social Media Kits", "Planner Templates"] },
];

const IMG = {
  logo: "img/design-logo.jpg",
  flyer: "img/design-flyer.jpg",
  card: "img/design-card.jpg",
  wedding: "img/design-wedding.jpg",
  social: "/img/design-social.jpg",
  calendar: "/img/design-calendar.jpg",
};

const CATEGORY_IMAGE = {
  Logos: IMG.logo,
  Flyers: IMG.flyer,
  Posters: IMG.flyer,
  "Business Cards": IMG.card,
  "Wedding Designs": IMG.wedding,
  Calendars: IMG.calendar,
  "Social Media Designs": IMG.social,
  Banners: IMG.flyer,
  Invitations: IMG.wedding,
  Certificates: IMG.card,
  Branding: IMG.logo,
  Packaging: IMG.card,
  "Marketing Materials": IMG.social,
  "Clothing Designs": IMG.social,
  "Book & Print": IMG.logo,
  "Digital Products": IMG.calendar,
};

const PORTRAIT_CATEGORIES = ["Flyers", "Posters", "Wedding Designs", "Invitations", "Book & Print"];

/* --- taxonomy store (admin edits live here) --- */
function getTaxonomy() {
  const saved = Store.read("taxonomy", null);
  if (Array.isArray(saved) && saved.length) return saved;
  return DEFAULT_TAXONOMY.map((c) => ({ name: c.name, subs: c.subs.slice() }));
}
function setTaxonomy(list) {
  Store.write("taxonomy", list);
}
function resetTaxonomy() {
  Store.remove("taxonomy");
}
function categoryNames() {
  return getTaxonomy().map((c) => c.name);
}
function subcategoriesOf(category) {
  const found = getTaxonomy().find((c) => c.name === category);
  return found ? found.subs.slice() : [];
}

/** Kept for backwards compatibility with older page scripts. */
const CATEGORIES = categoryNames();
const FLYER_SUBCATEGORIES = subcategoriesOf("Flyers");

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const DESIGN_VARIANTS = [
  { prefix: "Premium", note: "A polished, print-ready layout with fully editable text and colours." },
  { prefix: "Modern", note: "A clean contemporary design built for both print and social sharing." },
];

/** Templates are generated from the taxonomy so every subcategory has stock. */
function buildDesigns() {
  const list = [];
  let n = 0;
  getTaxonomy().forEach((cat) => {
    const subs = cat.subs.length ? cat.subs : [cat.name];
    subs.forEach((sub) => {
      DESIGN_VARIANTS.forEach((variant, vi) => {
        n += 1;
        const title = variant.prefix + " " + sub;
        list.push({
          id: "d-" + slug(cat.name) + "-" + slug(sub) + "-" + (vi + 1),
          title: title,
          category: cat.name,
          sub: sub,
          orientation: PORTRAIT_CATEGORIES.indexOf(cat.name) !== -1 ? "Portrait" : vi === 1 ? "Portrait" : "Landscape",
          level: LEVEL_KEYS[n % 3],
          popularity: ((n * 37) % 900) + 40,
          createdAt: new Date(Date.now() - ((n * 3) % 180) * 86400000).toISOString(),
          image: CATEGORY_IMAGE[cat.name] || IMG.logo,
          description: variant.note + " Ideal for " + sub.toLowerCase() + " in the " + cat.name.toLowerCase() + " category.",
          keywords: [cat.name, sub, variant.prefix, "custom", "editable", "nigeria", "download"],
          price: levelPrice(LEVEL_KEYS[n % 3]),
        });
      });
    });
  });
  return list;
}


let DESIGNS = buildDesigns();
function refreshDesigns() {
  DESIGNS = buildDesigns();
  return DESIGNS;
}

/* --------------------------------------------------------------------------
   2b. Search engine — case-insensitive, partial matching, ranked results
   -------------------------------------------------------------------------- */
function normalise(text) {
  return String(text || "").toLowerCase().trim();
}

/** Index built once per catalogue for fast repeated searching. */
function searchIndex() {
  return DESIGNS.map((d) => ({
    design: d,
    title: normalise(d.title),
    category: normalise(d.category),
    sub: normalise(d.sub),
    keywords: normalise((d.keywords || []).join(" ")),
    description: normalise(d.description),
  }));
}
let SEARCH_INDEX = searchIndex();
function rebuildSearchIndex() {
  refreshDesigns();
  SEARCH_INDEX = searchIndex();
}

function scoreEntry(entry, tokens) {
  let score = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let hit = 0;
    if (entry.title === t) hit = 140;
    else if (entry.title.indexOf(t) === 0) hit = 110;
    else if (entry.title.indexOf(t) !== -1) hit = 90;
    if (entry.sub.indexOf(t) !== -1) hit = Math.max(hit, entry.sub.indexOf(t) === 0 ? 80 : 65);
    if (entry.category.indexOf(t) !== -1) hit = Math.max(hit, entry.category.indexOf(t) === 0 ? 70 : 55);
    if (entry.keywords.indexOf(t) !== -1) hit = Math.max(hit, 35);
    if (entry.description.indexOf(t) !== -1) hit = Math.max(hit, 15);
    if (!hit) return 0; /* every token must match somewhere */
    score += hit;
  }
  return score;
}

/**
 * searchDesigns("logo", { category, sub, level, sort })
 * sort: relevance | price-asc | price-desc | newest | popular
 */
function searchDesigns(term, filters) {
  const f = filters || {};
  const tokens = normalise(term).split(/\s+/).filter(Boolean);
  let rows = SEARCH_INDEX;

  if (f.category && f.category !== "All") rows = rows.filter((e) => e.design.category === f.category);
  if (f.sub && f.sub !== "All") rows = rows.filter((e) => e.design.sub === f.sub);
  if (f.level && f.level !== "All") {
    const want = String(f.level).toUpperCase();
    rows = rows.filter((e) => String(e.design.level).toUpperCase() === want);
  }

  let scored = rows.map((e) => ({ design: e.design, score: tokens.length ? scoreEntry(e, tokens) : 1 }));
  if (tokens.length) scored = scored.filter((r) => r.score > 0);

  const sort = f.sort || "relevance";
  scored.sort((a, b) => {
    if (sort === "price-asc") return a.design.price - b.design.price || b.score - a.score;
    if (sort === "price-desc") return b.design.price - a.design.price || b.score - a.score;
    if (sort === "newest") return new Date(b.design.createdAt) - new Date(a.design.createdAt) || b.score - a.score;
    if (sort === "popular") return b.design.popularity - a.design.popularity || b.score - a.score;
    return b.score - a.score || b.design.popularity - a.design.popularity;
  });

  return scored.map((r) => r.design);
}

/** Type-ahead suggestions across categories, subcategories and template names. */
function searchSuggestions(term, limit) {
  const q = normalise(term);
  if (!q) return [];
  const max = limit || 8;
  const out = [];
  const seen = {};
  const push = (type, label, category, sub) => {
    const key = type + "|" + label;
    if (seen[key] || out.length >= max) return;
    seen[key] = true;
    out.push({ type: type, label: label, category: category || null, sub: sub || null });
  };
  getTaxonomy().forEach((c) => {
    if (normalise(c.name).indexOf(q) !== -1) push("Category", c.name, c.name, null);
    c.subs.forEach((s) => {
      if (normalise(s).indexOf(q) !== -1) push("Subcategory", s, c.name, s);
    });
  });
  DESIGNS.forEach((d) => {
    if (normalise(d.title).indexOf(q) !== -1) push("Template", d.title, d.category, d.sub);
  });
  return out;
}



function getDesign(id) {
  return DESIGNS.find((d) => d.id === id) || null;
}

function formatNaira(amount) {
  return "₦" + Number(amount).toLocaleString("en-NG");
}

function getUser() {
  return Store.read("user", null);
}
function setUser(user) {
  Store.write("user", user);
}
function initialOf(name) {
  const clean = (name || "").trim();
  return clean ? clean.charAt(0).toUpperCase() : "S";
}

const DEFAULT_TASKS = { instagram: false, x: false, tiktok: false, youtube: false };
function getTasks() {
  return Object.assign({}, DEFAULT_TASKS, Store.read("tasks", {}));
}
function setTasks(tasks) {
  Store.write("tasks", tasks);
}
function tasksComplete(t) {
  return !!(t.instagram && t.x && t.tiktok && t.youtube);
}

/* --------------------------------------------------------------------------
   4. Validation
   -------------------------------------------------------------------------- */
/** Accepts an email address OR a phone number (7–15 digits, optional +). */
function isEmailOrPhone(value) {
  const v = (value || "").trim();
  if (!v) return false;
  const email = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const phone = /^\+?[0-9][0-9\s-]{6,18}$/;
  return email.test(v) || phone.test(v.replace(/[()]/g, ""));
}

/** Password must be at least 10 chars with letters, numbers and symbols. */
function passwordChecks(pw) {
  const value = pw || "";
  return {
    length: value.length >= 10,
    letter: /[A-Za-z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
}
function passwordStrong(pw) {
  const c = passwordChecks(pw);
  return c.length && c.letter && c.number && c.symbol;
}

/* --------------------------------------------------------------------------
   5. Icons
   -------------------------------------------------------------------------- */
const ICONS = {
  home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/><rect x="3" y="14" width="8" height="7" rx="2"/></svg>',
  market: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h2.2l2.3 11.2a2 2 0 0 0 2 1.6h9a2 2 0 0 0 2-1.6L21 7H5"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.4-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"/></svg>',
  contact: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>',
  bell: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  whatsapp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.42 1.28 4.86L2 22l5.32-1.34a9.9 9.9 0 0 0 4.72 1.2c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.8 14.06c-.24.68-1.4 1.3-1.94 1.36-.54.06-1.02.08-1.94-.24-1.1-.38-3.62-1.58-5.24-4.06-1.14-1.74-.92-3.2-.34-3.92.3-.38.7-.62 1.06-.66.28-.02.6.02.8.5.2.48.66 1.64.72 1.76.06.12.1.28.02.44-.08.16-.36.52-.5.66-.14.14-.24.24-.12.48.5.96 1.16 1.62 1.9 2.1.7.46 1.02.5 1.2.44.18-.06.5-.5.66-.72.16-.22.34-.18.54-.1.2.08 1.28.62 1.5.74.22.12.36.18.42.28.06.1.06.58-.18 1.26Z"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>',
  landscape: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  portrait: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/></svg>',
  star: '<svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b"><path d="m12 2 2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.2 6.1 20.3l1.2-6.6L2.5 9l6.6-.9Z"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m4 12.5 5 5L20 6.5"/></svg>',
  facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-8h2.8l.4-3.2h-3.2V8.7c0-.9.3-1.5 1.6-1.5h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.3V14h2.8v8h3.4Z"/></svg>',
  tiktok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 2h-3v13.1a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a5.7 5.7 0 1 0 4.8 5.6V8.4a6 6 0 0 0 3.4 1.1V6.4a3.5 3.5 0 0 1-3.4-3.5V2Z"/></svg>',
  youtube: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12s0-3.2-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>',
  telegram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 19 19.4c-.2 1-.8 1.2-1.6.7l-4.4-3.2-2.1 2c-.2.3-.5.4-.9.4l.3-4.4 8.2-7.4c.4-.3-.1-.5-.6-.2L7.2 13l-4.3-1.4c-.9-.3-1-1 .2-1.4l17.4-6.7c.8-.3 1.5.2 1.4 1.1Z"/></svg>',
  instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3.2l-7 8 7.3 10h-5.6l-4.4-6.1L5.6 21H2.4l7.3-8.3L2.7 3h5.7l4.1 5.7L17.5 3Zm-1.1 16.2h1.8L7.7 4.7H5.8l10.6 14.5Z"/></svg>',
  google: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"/><path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.74 9.74 0 0 0 12 21.5Z"/><path fill="#FBBC05" d="M6.53 13.58A5.86 5.86 0 0 1 6.22 12c0-.55.1-1.09.31-1.58V7.89H3.28A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.03 4.11l3.25-2.53Z"/><path fill="#EA4335" d="M12 6.39c1.43 0 2.72.49 3.73 1.46l2.79-2.79C16.84 3.49 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.72 5.39l3.25 2.53C7.3 8.11 9.46 6.39 12 6.39Z"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4"/><path d="M15.5 4.3a3.5 3.5 0 0 1 0 6.8"/></svg>',
  wallet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16.5 14.5h1"/></svg>',
  package: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  download: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></svg>',
  checkCircle: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/></svg>',
};

/* --------------------------------------------------------------------------
   6. Toasts
   -------------------------------------------------------------------------- */
function toast(message, kind) {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* --------------------------------------------------------------------------
   7. Chrome: header, drawer, footer, community, WhatsApp button
   -------------------------------------------------------------------------- */
function pageUrl(name, query) {
  var file = String(name).replace(/^\/+/, "").replace(/\.html$/, "") + ".html";
  return file + (query || "");
}

const NAV = [
  { label: "Home", href: pageUrl("home"), icon: "home" },
  { label: "Dashboard", href: pageUrl("dashboard"), icon: "dashboard" },
  { label: "Market", href: pageUrl("market"), icon: "market" },
  { label: "Settings", href: pageUrl("settings"), icon: "settings" },
  { label: "Contact", href: pageUrl("contact"), icon: "contact" },
];

function brandHtml(href) {
  return (
    '<a class="brand" href="' + (href || pageUrl("landing")) + '">' +
    '<img class="brand-mark" src="' + new URL(STARLOG_CONFIG.logoMark, location.href).href + '" alt="Starlog logo" />' +
    '<span class="brand-text">STARLOG</span></a>'
  );
}

function navLinks(current, extraClass) {
  return NAV.map((item) => {
    const active = item.href === current ? " active" : "";
    return (
      '<a class="nav-link' + active + (extraClass ? " " + extraClass : "") + '" href="' + item.href + '">' +
      ICONS[item.icon] + "<span>" + item.label + "</span></a>"
    );
  }).join("");
}

function renderHeader() {
  const host = document.querySelector("[data-header]");
  if (!host) return;
  const current = host.getAttribute("data-header") || location.pathname;
  const user = getUser();
  const initial = initialOf(user && user.name);

  if (host.hasAttribute("data-auth-header")) {
    host.innerHTML = '<header class="site-header"><div class="wrap header-inner">' + brandHtml(pageUrl("landing")) + "</div></header>";
    return;
  }

  host.innerHTML =
    '<header class="site-header"><div class="wrap header-inner">' +
    brandHtml(pageUrl("home")) +
    '<nav class="nav-desktop">' + navLinks(current) + "</nav>" +
    '<div class="header-actions">' +
    '<a class="icon-btn" href="' + pageUrl("dashboard", "#notifications") + '" aria-label="Notifications">' + ICONS.bell + '<span class="dot"></span></a>' +
    '<a class="avatar" href="' + pageUrl("settings") + '" data-avatar aria-label="Your account">' + initial + "</a>" +
    '<button class="icon-btn menu-btn" data-drawer-open aria-label="Open menu">' + ICONS.menu + "</button>" +
    "</div></div></header>" +
    '<div class="drawer-backdrop" data-drawer-close></div>' +
    '<aside class="drawer" aria-label="Menu">' +
    '<div class="row" style="margin-bottom:8px">' + brandHtml(pageUrl("home")) +
    '<button class="icon-btn" data-drawer-close aria-label="Close menu">' + ICONS.close + "</button></div>" +
    navLinks(current) +
    '<a class="nav-link" href="' + pageUrl("login") + '">Login</a>' +
    '<a class="btn btn-primary btn-block mt-2" href="' + pageUrl("market") + '">Browse Market</a>' +
    "</aside>";

  host.querySelectorAll("[data-drawer-open]").forEach((b) =>
    b.addEventListener("click", () => document.body.classList.add("drawer-open")),
  );
  host.querySelectorAll("[data-drawer-close]").forEach((b) =>
    b.addEventListener("click", () => document.body.classList.remove("drawer-open")),
  );
  host.querySelectorAll(".drawer .nav-link").forEach((a) =>
    a.addEventListener("click", () => document.body.classList.remove("drawer-open")),
  );
}

function communityHtml() {
  const s = STARLOG_CONFIG.social;
  const btn = (cls, icon, label, href) =>
    '<a class="btn social-btn ' + cls + '" href="' + href + '" target="_blank" rel="noopener">' + ICONS[icon] + "<span>" + label + "</span></a>";
  return (
    '<section class="surface">' +
    '<h2>Join the Starlog Community</h2>' +
    '<p class="muted small mt-1">Follow us for fresh drops, design tips and giveaways.</p>' +
    '<div class="social-grid mt-2">' +
    btn("s-instagram", "instagram", "Instagram", s.instagram) +
    btn("s-x", "x", "X (Twitter)", s.x) +
    btn("s-tiktok", "tiktok", "TikTok", s.tiktok) +
    btn("s-telegram", "telegram", "Telegram", s.telegram) +
    btn("s-whatsapp", "whatsapp", "WhatsApp", s.whatsapp) +
    btn("s-youtube", "youtube", "YouTube", s.youtube) +
    "</div></section>"
  );
}

function renderCommunity() {
  document.querySelectorAll("[data-community]").forEach((el) => {
    el.innerHTML = communityHtml();
  });
}

function footerSocialHtml() {
  const s = STARLOG_CONFIG.social;
  const items = [
    ["instagram", "Instagram", s.instagram],
    ["x", "X (Twitter)", s.x],
    ["tiktok", "TikTok", s.tiktok],
    ["youtube", "YouTube", s.youtube],
    ["telegram", "Telegram", s.telegram],
    ["whatsapp", "WhatsApp", s.whatsapp],
  ];
  return (
    '<div class="footer-social">' +
    items
      .map(
        ([icon, label, href]) =>
          '<a class="footer-social-link" href="' + href + '" target="_blank" rel="noopener" aria-label="' + label + '" title="' + label + '">' + ICONS[icon] + "</a>",
      )
      .join("") +
    "</div>"
  );
}

function renderFooter() {
  const host = document.querySelector("[data-footer]");
  if (!host) return;
  const year = new Date().getFullYear();
  host.innerHTML =
    '<footer class="site-footer"><div class="wrap footer-inner">' +
    "<div>" + brandHtml(pageUrl("landing")) + '<p class="muted small mt-1">' + STARLOG_CONFIG.business.tagline + "</p>" + footerSocialHtml() + "</div>" +
    '<nav class="footer-links">' +
    NAV.map((i) => '<a href="' + i.href + '">' + i.label + "</a>").join("") +
    '<a href="' + pageUrl("login") + '">Login</a><a href="' + pageUrl("signup") + '">Sign Up</a>' +
    "</nav>" +
    '<p class="muted small">© ' + year + " Starlog. All rights reserved.</p>" +
    "</div></footer>";
}

function renderTalkButton() {
  if (document.querySelector(".talk-btn")) return;
  const num = STARLOG_CONFIG.whatsappNumber;
  const el = document.createElement(num ? "a" : "button");
  el.className = "talk-btn";
  el.innerHTML = ICONS.whatsapp + "<span>Talk to Us</span>";
  if (num) {
    el.href = "https://wa.me/" + num;
    el.target = "_blank";
    el.rel = "noopener";
  } else {
    el.type = "button";
    el.addEventListener("click", () =>
      toast("WhatsApp number not set yet — add it in public/starlog.js", "error"),
    );
  }
  document.body.appendChild(el);
}

/* --------------------------------------------------------------------------
   8. Reveal on scroll + auto-grow textareas
   -------------------------------------------------------------------------- */
function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  items.forEach((el) => io.observe(el));
}

function autoGrow(textarea) {
  const fit = () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 320) + "px";
  };
  textarea.addEventListener("input", fit);
  fit();
}

/* --------------------------------------------------------------------------
   9. Design card + details modal
   -------------------------------------------------------------------------- */
function designCardHtml(design) {
  return (
    '<article class="card">' +
    '<div class="card-media"><img src="' + design.image + '" alt="' + design.title + '" loading="lazy" />' +
    '<span class="tag">' + (design.sub ? design.category + " · " + design.sub : design.category) + "</span></div>" +
    '<div class="card-body">' +
    "<h3>" + design.title + "</h3>" +
    '<div class="row small muted"><span>' + levelBadgeHtml(design.level) + "</span><span>" + design.orientation + "</span></div>" +
    '<div class="row"><span class="price">' + formatNaira(design.price) + "</span>" +
    '<button class="btn btn-primary" data-details="' + design.id + '">View Details</button></div>' +

    "</div></article>"
  );

}

function ensureModal() {
  let host = document.querySelector(".modal-backdrop");
  if (host) return host;
  host = document.createElement("div");
  host.className = "modal-backdrop";
  host.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
  host.addEventListener("click", (e) => {
    if (e.target === host) closeModal();
  });
  document.body.appendChild(host);
  return host;
}
function closeModal() {
  const host = document.querySelector(".modal-backdrop");
  if (host) host.classList.remove("open");
}
function openDetails(id) {
  const d = getDesign(id);
  if (!d) return;
  const host = ensureModal();
  host.querySelector(".modal").innerHTML =
    '<div class="modal-media"><img src="' + d.image + '" alt="' + d.title + '" /></div>' +
    '<h2 class="mt-2">' + d.title + "</h2>" +
    '<div class="meta">' +
    '<div><span class="muted">Category</span><strong>' + (d.sub ? d.category + " · " + d.sub : d.category) + "</strong></div>" +
    '<div><span class="muted">Level</span><strong>' + levelBadgeHtml(d.level) + "</strong></div>" +
    '<div><span class="muted">Price</span><strong class="price">' + formatNaira(d.price) + "</strong></div>" +
    '<div><span class="muted">Orientation</span><strong>' +
    (d.orientation === "Landscape" ? ICONS.landscape : ICONS.portrait) + " " + d.orientation + "</strong></div>" +

    "</div>" +
    '<a class="btn btn-primary btn-block btn-lg mt-3" href="' + pageUrl("order", "?id=" + d.id) + '">Order this design</a>' +
    '<button class="btn btn-outline btn-block mt-2" data-modal-close>Close</button>';
  host.querySelector("[data-modal-close]").addEventListener("click", closeModal);
  host.classList.add("open");
}

function wireDetailButtons(root) {
  (root || document).querySelectorAll("[data-details]").forEach((btn) => {
    btn.addEventListener("click", () => openDetails(btn.getAttribute("data-details")));
  });
}

/* --------------------------------------------------------------------------
   Referral sharing (production data lives in Supabase)
   -------------------------------------------------------------------------- */
function myReferralCode() {
  const user = getUser();
  return user && user.referralCode ? user.referralCode : null;
}
function referralLink(code) {
  return location.origin + "/signup.html?ref=" + encodeURIComponent(code || "");
}

const REF_SHARE_MESSAGE = "Join Starlog with my referral link: ";

function shareReferral(channel, link) {
  const url = link || referralLink(myReferralCode());
  const text = REF_SHARE_MESSAGE + url;
  const targets = {
    whatsapp: "https://wa.me/?text=" + encodeURIComponent(text),
    telegram: "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(REF_SHARE_MESSAGE),
    tiktok: "https://www.tiktok.com/upload",
    instagram: "https://www.instagram.com/",
    x: "https://twitter.com/intent/tweet?text=" + encodeURIComponent(REF_SHARE_MESSAGE) + "&url=" + encodeURIComponent(url),
  };
  if (channel === "copy") {
    return copyText(url).then(() => toast("Referral link copied.", "success"));
  }
  if (channel === "native" && navigator.share) {
    return navigator.share({ title: "Starlog", text: REF_SHARE_MESSAGE, url: url }).catch(() => {});
  }
  if (channel === "tiktok" || channel === "instagram") {
    copyText(url);
    toast("Link copied — paste it in your " + (channel === "tiktok" ? "TikTok" : "Instagram") + " bio, caption or story.", "success");
  }
  window.open(targets[channel] || targets.whatsapp, "_blank", "noopener");
  return Promise.resolve();
}

/* --------------------------------------------------------------------------
   10. Boot
   -------------------------------------------------------------------------- */
function refreshAvatars() {
  const user = getUser();
  const initial = initialOf(user && user.name);
  document.querySelectorAll("[data-avatar]").forEach((el) => {
    el.textContent = initial;
  });
  document.querySelectorAll("[data-user-name]").forEach((el) => {
    el.textContent = (user && user.name) || "Guest";
  });
  document.querySelectorAll("[data-user-contact]").forEach((el) => {
    el.textContent = (user && user.contact) || "Not signed in";
  });
}

function query(name) {
  return new URLSearchParams(location.search).get(name);
}

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderCommunity();
  renderFooter();
  renderTalkButton();
  refreshAvatars();
  initReveal();
  wireDetailButtons();
  document.querySelectorAll("textarea[data-autogrow]").forEach(autoGrow);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.body.classList.remove("drawer-open");
    }
  });
});