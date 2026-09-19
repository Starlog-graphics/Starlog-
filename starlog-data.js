/* ==========================================================================
   Starlog — live data layer (Supabase / PostgreSQL)
   Loaded after starlog.js on every page. Everything the pages render comes
   from the database: categories, subcategories, designs, hot picks, orders,
   custom design briefs, referrals and notifications.
   The demo catalogue in starlog.js is only used as a last-resort fallback for
   category chips before the first round trip completes.
   ========================================================================== */

const SB_URL = "https://tjzbezgtoybpmpagoaqs.supabase.co";
const SB_KEY = "sb_publishable_X9wgXS8FqkhUF3rVfww4Dw_Fo4IJAwL";

/* global supabase */
const SB = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const STARLOG_API = (STARLOG_CONFIG.apiBaseUrl || "https://starlog-backend.onrender.com").replace(/\/$/, "");
async function apiFetch(path, options) {
  const session = (await SB.auth.getSession()).data.session;
  const headers = Object.assign({ "Content-Type": "application/json" }, (options && options.headers) || {});
  if (session && session.access_token) headers.Authorization = "Bearer " + session.access_token;
  let res;
  try {
    res = await fetch(STARLOG_API + path, Object.assign({}, options || {}, { headers }));
  } catch (err) {
    throw new Error("Starlog could not reach the backend. Check that the FastAPI server is running and that STARLOG_CONFIG.apiBaseUrl points to the deployed backend URL.");
  }
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const detail = body && body.detail !== undefined ? body.detail : (body && body.message);
    let message = detail || "Request failed";
    if (typeof message !== "string") {
      if (Array.isArray(message)) {
        message = message.map(function (item) {
          if (typeof item === "string") return item;
          if (item && item.msg) return item.msg;
          return JSON.stringify(item);
        }).join("; ");
      } else {
        try { message = JSON.stringify(message); } catch (_) { message = String(message); }
      }
    }
    throw new Error(message);
  }
  return body;
}


/* --------------------------------------------------------------------------
   Session helpers
   -------------------------------------------------------------------------- */
async function sbUser() {
  const { data } = await SB.auth.getUser();
  return data && data.user ? data.user : null;
}

async function sbProfile() {
  const user = await sbUser();
  if (!user) return null;
  const { data } = await SB.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data ? Object.assign({ email: user.email }, data) : { id: user.id, email: user.email, full_name: "" };
}

/** Redirects to login (keeping the current page as `next`) when signed out. */
async function requireAccount(message) {
  const user = await sbUser();
  if (user) return user;
  if (message) toast(message, "error");
  const next = encodeURIComponent(location.pathname + location.search);
  setTimeout(function () {
    location.href = pageUrl("login", "?next=" + next);
  }, 700);
  return null;
}

async function sbSignOut() {
  await SB.auth.signOut();
  Store.remove("user");
  location.href = pageUrl("landing");
}

/** Keeps the localStorage mirror used by the header/avatar in sync. */
async function syncLocalUser() {
  const profile = await sbProfile();
  if (profile) {
    setUser({
      name: profile.full_name || "Starlog User",
      contact: profile.email || "",
      id: profile.id,
      referralCode: profile.referral_code || null,
      verified: true,
    });
  } else {
    Store.remove("user");
  }
  return profile;
}

/* --------------------------------------------------------------------------
   Catalogue reads
   -------------------------------------------------------------------------- */
async function dbCategories() {
  const { data, error } = await SB.from("categories")
    .select("id,name,slug,image,sort_order,subcategories(id,name,slug,is_active)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data || !data.length) {
    return getTaxonomy().map(function (c, i) {
      return { id: null, name: c.name, slug: slug(c.name), image: null, sort_order: i, subs: c.subs.map(function (s) { return { id: null, name: s, slug: slug(s), is_active: true }; }) };
    });
  }
  return (data || []).map(function (c) {
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      image: c.image,
      subs: (c.subcategories || []).filter(function (s) { return s.is_active !== false; }),
    };
  });
}

/** Ranked search straight from the database function. */
async function dbSearchDesigns(term, filters) {
  const f = filters || {};
  const sortMap = {
    relevance: "relevance",
    "price-asc": "price_low",
    "price-desc": "price_high",
    newest: "newest",
    popular: "popular",
  };
  const { data, error } = await SB.rpc("search_templates", {
    q: term || null,
    p_category: f.category && f.category !== "All" ? f.category : null,
    p_subcategory: f.sub && f.sub !== "All" ? f.sub : null,
    min_price: null,
    max_price: null,
    min_rating: null,
    sort: sortMap[f.sort || "relevance"] || "relevance",
    page_limit: f.limit || 48,
    page_offset: f.offset || 0,
    p_level: f.level && f.level !== "All" ? f.level : null,
  });
  if (error) {
    console.error("search_templates", error.message);
    return [];
  }
  return (data || []).map(mapTemplateRow);
}

function mapTemplateRow(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || "",
    category: row.category_name || "",
    sub: row.subcategory_name || "",
    orientation: row.orientation || "Portrait",
    level: row.complexity_level || "CLASSIC",
    price: Number(row.price || 0),
    image: row.preview_image || "",
    rating: Number(row.rating || 0),
    createdAt: row.created_at,
    popularity: row.number_of_sales || 0,
  };
}

async function dbDesign(id) {
  const { data, error } = await SB.from("templates")
    .select("id,title,slug,description,orientation,preview_image,price,complexity_level,rating,number_of_sales,created_at,categories(name),subcategories(name)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return mapTemplateRow(
    Object.assign({}, data, {
      category_name: data.categories ? data.categories.name : "",
      subcategory_name: data.subcategories ? data.subcategories.name : "",
    }),
  );
}

/** Level prices come from the database, never from the page. */
let LEVEL_PRICES = null;
async function dbLevels() {
  if (LEVEL_PRICES) return LEVEL_PRICES;
  const keys = ["SIMPLE", "CLASSIC", "PREMIUM", "SUPA"];
  const labels = { SIMPLE: "Simple", CLASSIC: "Classic", PREMIUM: "Premium", SUPA: "Supa" };
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const { data } = await SB.rpc("price_for_level", { _level: keys[i] });
    out.push({ key: keys[i], label: labels[keys[i]], price: Number(data || levelPrice(keys[i])) });
  }
  LEVEL_PRICES = out;
  return out;
}

/* --------------------------------------------------------------------------
   Hot Picks — admin-curated, read-only for everyone else
   -------------------------------------------------------------------------- */
async function dbHotPicks() {
  const { data, error } = await SB.from("hot_picks")
    .select("id,title,description,image_url,display_order,design_id,templates(id,title,preview_image,price,complexity_level,categories(name),subcategories(name))")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .limit(10);
  if (error) { console.error("hot_picks", error.message); return []; }
  return (data || []).map(function (p) {
    const t = p.templates;
    return {
      id: p.id, designId: p.design_id || (t && t.id) || null,
      title: p.title || (t && t.title) || "Starlog Hot Pick", description: p.description || "",
      image: p.image_url || (t && t.preview_image) || "",
      category: t && t.categories ? t.categories.name : "Featured Design",
      sub: t && t.subcategories ? t.subcategories.name : "",
      level: t ? t.complexity_level : null, price: t ? Number(t.price || 0) : 0,
      position: p.display_order
    };
  });
}


/**
 * Renders the Hot Picks slider into `host`. Touch swipe, arrow navigation,
 * auto-advance, looping and lazy images — all in the existing Starlog style.
 */
async function renderHotPicks(host) {
  if (!host) return;
  host.innerHTML =
    '<div class="hp-head"><h2 class="section-title">Hot Picks</h2>' +
    '<p class="muted small">Hand-picked designs from the Starlog team</p></div>' +
    '<div class="skeleton" style="height:320px;border-radius:18px"></div>';

  const rawPicks = await dbHotPicks();
  const byPosition = {}; rawPicks.forEach(function(p){ byPosition[p.position] = p; });
  const picks = Array.from({length:10}, function(_, i){ return byPosition[i+1] || {id:null,designId:null,title:"Hot Pick " + (i+1),description:"Upload an image for this slot from the Starlog admin page.",image:"",category:"Featured Design",sub:"",level:null,price:0,position:i+1}; });

  host.innerHTML =
    '<div class="hp-head"><h2 class="section-title">Hot Picks</h2>' +
    '<p class="muted small">Hand-picked designs from the Starlog team</p></div>' +
    '<div class="hp"><div class="hp-track">' +
    picks
      .map(function (p, i) {
        return (
          '<article class="hp-slide" data-hp-slide="' + i + '">' +
          '<div class="hp-media">' + (p.image ? '<img src="' + p.image + '" alt="' + p.title + '" loading="' + (i === 0 ? "eager" : "lazy") + '" decoding="async" />' : '<div class="hp-placeholder"><span>Hot Pick ' + (i+1) + '</span></div>') + '</div>' +
          '<div class="hp-body">' +
          '<span class="tag">' + (p.sub ? p.category + " · " + p.sub : p.category) + "</span>" +
          "<h3>" + p.title + "</h3>" +
          '<p class="muted small">' + (p.description || "") + "</p>" +
          '<div class="row mt-1">' + (p.level ? levelBadgeHtml(p.level) + '<span class="price">' + formatNaira(p.price) + '</span>' : '') + '</div>' +
          (p.designId ? '<a class="btn btn-primary mt-2" href="' + pageUrl("order", "?id=" + p.designId) + '">View design</a>' : '') +
          "</div></article>"
        );
      })
      .join("") +
    "</div>" +
    '<button class="hp-nav prev" type="button" aria-label="Previous hot pick">‹</button>' +
    '<button class="hp-nav next" type="button" aria-label="Next hot pick">›</button>' +
    '<div class="hp-foot"><span class="hp-count"><span data-hp-index>1</span> / ' + picks.length + "</span>" +
    '<div class="hp-dots">' + picks.map(function (_, i) {
      return '<button class="hp-dot' + (i === 0 ? " active" : "") + '" type="button" data-hp-dot="' + i + '" aria-label="Go to slide ' + (i + 1) + '"></button>';
    }).join("") + "</div></div></div>";

  const track = host.querySelector(".hp-track");
  const dots = host.querySelectorAll("[data-hp-dot]");
  const label = host.querySelector("[data-hp-index]");
  let index = 0;

  function go(next) {
    index = (next + picks.length) % picks.length;
    const slide = track.children[index];
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: "smooth" });
    paint();
  }
  function paint() {
    label.textContent = String(index + 1);
    dots.forEach(function (d, i) { d.classList.toggle("active", i === index); });
  }

  host.querySelector(".hp-nav.prev").addEventListener("click", function () { go(index - 1); });
  host.querySelector(".hp-nav.next").addEventListener("click", function () { go(index + 1); });
  dots.forEach(function (d) {
    d.addEventListener("click", function () { go(Number(d.getAttribute("data-hp-dot"))); });
  });

  /* keep the counter honest while the user swipes on a phone */
  let ticking = false;
  track.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      const width = track.clientWidth || 1;
      index = Math.min(picks.length - 1, Math.round(track.scrollLeft / width));
      paint();
      ticking = false;
    });
  });

  let timer = window.setInterval(function () { go(index + 1); }, 6000);
  host.addEventListener("pointerenter", function () { window.clearInterval(timer); });
  host.addEventListener("pointerleave", function () {
    window.clearInterval(timer);
    timer = window.setInterval(function () { go(index + 1); }, 6000);
  });
}

/* --------------------------------------------------------------------------
   Empty state shared by the market, home feed and category pages
   -------------------------------------------------------------------------- */
function noTemplatesHtml() {
  return (
    '<div class="surface center empty-state">' +
    '<p class="bold">No templates available.</p>' +
    '<a class="btn btn-primary mt-2" href="' + pageUrl("order", "?new=1") + '">Order a new design</a>' +
    "</div>"
  );
}

function orderNewButtonHtml(extraClass) {
  return '<a class="btn btn-gold ' + (extraClass || "") + '" href="' + pageUrl("order", "?new=1") + '">Order new</a>';
}

/* --------------------------------------------------------------------------
   Orders, custom briefs and re-customization
   -------------------------------------------------------------------------- */
const MAX_RECUSTOMIZATIONS = 3;

async function apiOrderLevel(level) {
  const key = String(level || "").trim().toUpperCase();
  const map = { SIMPLE: "Simple", CLASSIC: "Classic", PREMIUM: "Premium", SUPA: "Supa" };
  return map[key] || String(level || "").trim();
}

async function createTemplateOrder(templateId, brief, level) {
  const user = await requireAccount("Sign in to order a design.");
  if (!user) return null;
  try {
    return await apiFetch("/api/orders", { method:"POST", body:JSON.stringify({ template_id:templateId, is_custom:false, complexity_level:apiOrderLevel(level), brief:brief || null }) });
  } catch (e) { toast(e.message,"error"); return null; }
}

async function createCustomOrder(payload) {
  const user = await requireAccount("Sign in to order a new design.");
  if (!user) return null;
  try {
    return await apiFetch("/api/orders", { method:"POST", body:JSON.stringify({ template_id:null, is_custom:true, complexity_level:apiOrderLevel(payload.level), category_id:payload.categoryId || null, subcategory_id:payload.subcategoryId || null, brief:payload.brief || null }) });
  } catch (e) { toast(e.message,"error"); return null; }
}

async function myOrders() {
  try { return await apiFetch("/api/orders"); } catch (e) { toast(e.message,"error"); return []; }
}

async function recustomizationsLeft(orderId) {
  const { count } = await SB.from("recustomization_requests")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  return Math.max(0, MAX_RECUSTOMIZATIONS - (count || 0));
}

async function requestRecustomization(orderId, message) {
  const user = await requireAccount("Sign in to request a re-customization.");
  if (!user) return null;
  try {
    const data = await apiFetch("/api/custom-requests", { method:"POST", body:JSON.stringify({ order_id:orderId, instructions:message }) });
    toast("Customization request sent.", "success");
    return data;
  } catch (e) { toast(e.message,"error"); return null; }
}

/* --------------------------------------------------------------------------
   Notifications + referrals straight from the database
   -------------------------------------------------------------------------- */
async function myReferralSummary() {
  try { return await apiFetch("/api/referrals/summary"); } catch (_) { return null; }
}

/* --------------------------------------------------------------------------
   Authentication (email confirmation + password)
   -------------------------------------------------------------------------- */
function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value || "").trim());
}

/** Authentication accepts email addresses only. */
function identityOf(contact) {
  return { email: String(contact || "").trim().toLowerCase() };
}

async function sbSignUp(payload) {
  const email = String(payload.contact || "").trim().toLowerCase();
  const { data, error } = await SB.auth.signUp({
    email,
    password: payload.password,
    options: {
      data: { full_name: payload.name, referral_code: payload.referralCode || null },
    },
  });
  return { data, error, identity: { email } };
}

async function sbOAuth(provider, next) {
  var ref = query("ref") || Store.read("referralCode", "");
  if (ref) Store.write("referralCode", ref);
  return SB.auth.signInWithOAuth({ provider: provider, options: { redirectTo: new URL(next || "home.html", location.href).href } });
}

async function claimStoredReferral() {
  var ref=Store.read("referralCode", "");
  var user=await sbUser();
  if (!ref || !user) return;
  try { await apiFetch("/api/referrals/claim", {method:"POST", body:JSON.stringify({referral_code:ref})}); Store.remove("referralCode"); } catch (_) {}
}

async function sbSignInPassword(contact, password) {
  const email = String(contact || "").trim().toLowerCase();
  const { data, error } = await SB.auth.signInWithPassword({ email, password });
  return { data, error, identity: { email } };
}

/** Legacy OTP helper retained for backward compatibility; Starlog UI now uses email confirmation links. */
async function sbSendOtp(contact, options) {
  const email = String(contact || "").trim().toLowerCase();
  const { error } = await SB.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: !!(options && options.createUser) },
  });
  return { error, identity: { email } };
}

/** Verify a six-digit email Auth code. */

async function sbResendConfirmation(email) {
  const { error } = await SB.auth.resend({ type: "signup", email: String(email || "").trim().toLowerCase() });
  return { error, identity: { email } };
}

async function sbVerifyOtp(contact, token, kind) {
  const email = String(contact || "").trim().toLowerCase();
  const type = kind === "signup" ? "signup" : kind === "recovery" ? "recovery" : "email";
  const { data, error } = await SB.auth.verifyOtp({ email, token, type });
  return { data, error };
}

/** Request a password-recovery confirmation email. */
async function sbSendRecovery(contact) {
  const email = String(contact || "").trim().toLowerCase();
  const { error } = await SB.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("forgot-password.html", location.href).href,
  });
  return { error, identity: { email } };
}

async function sbUpdatePassword(password) {
  const { error } = await SB.auth.updateUser({ password });
  return { error };
}

/** Sends the signed-in visitor to `/login` unless they already have a session. */
async function guardPage() {
  const { data } = await SB.auth.getSession();
  if (data && data.session) return data.session.user;
  location.href = pageUrl("login", "?next=" + encodeURIComponent(location.pathname + location.search));
  return null;
}

/* --------------------------------------------------------------------------
   Live overrides — the pages keep calling the original helper names, but the
   data behind them now comes from the database instead of the demo catalogue.
   -------------------------------------------------------------------------- */
const LIVE_DESIGNS = {};
let LIVE_TAXONOMY = null;

function cacheDesigns(list) {
  (list || []).forEach(function (d) { LIVE_DESIGNS[d.id] = d; });
  return list;
}

/* Replace the demo lookups (classic scripts share one global scope). */
getDesign = function (id) {
  return id && LIVE_DESIGNS[id] ? LIVE_DESIGNS[id] : null;
};

categoryNames = function () {
  return (LIVE_TAXONOMY || []).map(function (c) { return c.name; });
};

subcategoriesOf = function (category) {
  const hit = (LIVE_TAXONOMY || []).filter(function (c) { return c.name === category; })[0];
  return hit ? hit.subs.map(function (s) { return s.name; }) : [];
};

/** Loads the taxonomy once; safe to await on every page. */
async function loadTaxonomy() {
  if (!LIVE_TAXONOMY) {
    try { LIVE_TAXONOMY = await dbCategories(); } catch (_) { LIVE_TAXONOMY = []; }
    if (!LIVE_TAXONOMY || !LIVE_TAXONOMY.length) {
      LIVE_TAXONOMY = getTaxonomy().map(function (c, i) {
        return { id: null, name: c.name, slug: slug(c.name), image: null, sort_order: i, subs: c.subs.map(function (s) { return { id: null, name: s, slug: slug(s), is_active: true }; }) };
      });
    }
  }
  return LIVE_TAXONOMY;
}

function taxonomyIds(categoryName, subName) {
  const cat = (LIVE_TAXONOMY || []).filter(function (c) { return c.name === categoryName; })[0];
  if (!cat) return { categoryId: null, subcategoryId: null };
  const sub = (cat.subs || []).filter(function (s) { return s.name === subName; })[0];
  return { categoryId: cat.id, subcategoryId: sub ? sub.id : null };
}

/** Fetch + cache designs so `getDesign`/the details modal keep working. */
async function liveSearch(term, filters) {
  const list = await dbSearchDesigns(term, filters);
  cacheDesigns(list);
  return list;
}

async function liveDesign(id) {
  if (LIVE_DESIGNS[id]) return LIVE_DESIGNS[id];
  const design = await dbDesign(id);
  if (design) LIVE_DESIGNS[design.id] = design;
  return design;
}

/* --------------------------------------------------------------------------
   Notifications
   -------------------------------------------------------------------------- */
async function myNotifications() {
  const user = await sbUser();
  if (!user) return [];
  const { data } = await SB.from("notifications")
    .select("id,title,message,type,is_read,created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}

async function markNotificationRead(id) {
  await SB.from("notifications").update({ is_read: true }).eq("id", id);
}

async function myReferralRows() {
  const summary=await myReferralSummary();
  return summary ? (summary.rows || []) : [];
}

/* --------------------------------------------------------------------------
   Profile updates + contact form
   -------------------------------------------------------------------------- */
async function updateMyProfile(patch) {
  const user = await sbUser();
  if (!user) return { error: { message: "Not signed in." } };
  const { error } = await SB.from("profiles").update(patch).eq("id", user.id);
  if (!error) await syncLocalUser();
  return { error };
}

async function sendContactMessage(payload) {
  const { error } = await SB.from("contact_messages").insert({
    name: payload.name,
    email: payload.email,
    subject: payload.subject || null,
    message: payload.message,
  });
  return { error };
}

/* --------------------------------------------------------------------------
   Order status helpers used by the dashboard / payment pages
   -------------------------------------------------------------------------- */
function orderTitle(order) {
  if (order.templates && order.templates.title) return order.templates.title;
  return order.is_custom ? "Custom design brief" : "Design order";
}

function orderBadgeClass(status) {
  if (status === "Completed") return "badge-blue";
  if (status === "Cancelled") return "badge-red";
  return "badge-gold";
}

/** Header/avatar hydration + sign-out wiring for every page. */
document.addEventListener("DOMContentLoaded", function () {
  var incomingRef = query("ref"); if (incomingRef) Store.write("referralCode", incomingRef);
  syncLocalUser().then(async function () {
    await claimStoredReferral();
    if (typeof renderHeader === "function") renderHeader();
  });
  document.addEventListener("click", function (e) {
    const el = e.target.closest ? e.target.closest("[data-signout]") : null;
    if (el) {
      e.preventDefault();
      sbSignOut();
    }
  });
});

/* --------------------------------------------------------------------------
   Single order + public app settings (payment instructions, referral reward)
   -------------------------------------------------------------------------- */
async function dbOrder(id) {
  if (!id) return null;
  try { return await apiFetch("/api/orders/" + encodeURIComponent(id)); } catch (_) { return null; }
}

let APP_SETTINGS = null;
async function appSettings() {
  if (APP_SETTINGS) return APP_SETTINGS;
  try {
    const cfg=await fetch(STARLOG_API+"/api/config/public").then(r=>r.json());
    APP_SETTINGS={payment_bank_name:cfg.bank_name,payment_account_number:cfg.bank_account_number,payment_account_name:cfg.bank_account_name,referral_reward_amount:String(cfg.referral_reward_ngn||1000),paystack_public_key:cfg.paystack_public_key};
  } catch (_) { APP_SETTINGS={referral_reward_amount:"1000"}; }
  return APP_SETTINGS;
}

async function myPayments() {
  try { return await apiFetch("/api/payments/mine"); } catch (_) { return []; }
}

async function initializeCardPayment(orderId,email) { return apiFetch("/api/payments/initialize",{method:"POST",body:JSON.stringify({order_id:orderId,email:email||undefined})}); }
async function createBankTransfer(orderId) { return apiFetch("/api/payments/bank-transfer",{method:"POST",body:JSON.stringify({order_id:orderId})}); }
async function verifyPayment(reference) { return apiFetch("/api/payments/verify/"+encodeURIComponent(reference)); }
async function requestReferralPayout(payload) { return apiFetch("/api/payouts",{method:"POST",body:JSON.stringify(payload)}); }

async function myCompletedDesigns() {
  const user = await sbUser();
  if (!user) return [];
  const { data } = await SB.from("completed_designs")
    .select("id,order_id,file_name,design_file,created_at")
    .order("created_at", { ascending: false });
  return data || [];
}

/** Signed, time-limited link for a private storage object. */
async function signedFileUrl(bucket, path, seconds) {
  const { data, error } = await SB.storage.from(bucket).createSignedUrl(path, seconds || 300);
  if (error) return null;
  return data.signedUrl;
}
