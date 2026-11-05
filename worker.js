// 라이칸짐 연수점 Worker — 정적 파일은 Cloudflare assets 가 먼저 처리하고, 여기는 /api/* 와 /uploads/* 만 맡는다.
// 저장소: D1 (binding DB). settings(비밀번호 해시·세션 키), content(관리자 저장값), hits(방문 기록), files(사진).
// 비밀번호는 관리자 페이지에서 처음 한 번 정하며(wrangler secret 불필요), 세션은 HMAC 서명 쿠키.
// 방문 기록(hits)은 개인정보 없이 페이지·유입경로·기기·지역(도시)·연락 클릭·체류시간만 저장한다.

const COOKIE = 'ly_admin';
const SESSION_DAYS = 30;
const KST = 9 * 3600;
const MAX_UPLOAD = 1536 * 1024;        // 1.5MB (관리자 화면이 1600px 로 줄여 올림)
const SELF_HOSTS = /(^|\.)(xn--oi2bw61a1wbh8g\.com|lycangym\.hsk9867\.workers\.dev|localhost)$/i;
const LIVE_SEC = 5 * 60;               // "지금 접속" = 최근 5분 안에 기록이 있는 방문자

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256hex(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

// ---------- settings ----------
async function getSetting(env, key) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r ? r.value : null;
}
const setSetting = (env, key, value) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();

async function sessionKey(env) {
  let k = await getSetting(env, 'session_key');
  if (!k) { k = rand(32); await setSetting(env, 'session_key', k); }
  return crypto.subtle.importKey('raw', enc.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// ---------- 비밀번호 (PBKDF2-SHA256) ----------
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}
async function verifyPassword(env, pw) {
  const raw = await getSetting(env, 'auth');
  if (!raw) return false;
  const { salt, hash } = JSON.parse(raw);
  return (await hashPassword(pw, salt)) === hash;
}
async function setPassword(env, pw) {
  const salt = rand(16);
  await setSetting(env, 'auth', JSON.stringify({ salt, hash: await hashPassword(pw, salt) }));
}

// ---------- 세션 쿠키 ----------
async function makeCookie(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = exp + '.' + rand(8);
  const sig = b64url(await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(payload)));
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function hasAdminCookie(req) { return new RegExp('(?:^|;\\s*)' + COOKIE + '=').test(req.headers.get('cookie') || ''); }
async function isAdmin(env, req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  if (parseInt(exp, 10) < Date.now() / 1000) return false;
  const expect = b64url(await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(exp + '.' + nonce)));
  return expect === sig;
}

// 로그인 실패 5회 → 10분 잠금
async function loginLocked(env) {
  const raw = await getSetting(env, 'login_fail');
  if (!raw) return false;
  const { n, at } = JSON.parse(raw);
  return n >= 5 && Date.now() / 1000 - at < 600;
}
async function noteFail(env, ok) {
  if (ok) { await setSetting(env, 'login_fail', JSON.stringify({ n: 0, at: 0 })); return; }
  const raw = await getSetting(env, 'login_fail');
  const cur = raw ? JSON.parse(raw) : { n: 0, at: 0 };
  const fresh = Date.now() / 1000 - cur.at > 600;
  await setSetting(env, 'login_fail', JSON.stringify({ n: fresh ? 1 : cur.n + 1, at: Math.floor(Date.now() / 1000) }));
}

// ---------- 방문 기록 ----------
const kst = (ts) => { const d = new Date((ts + KST) * 1000); return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() }; };
const BOT_RE = /bot|crawl|spider|slurp|yeti|daumoa|kakaotalk-scrap|facebookexternalhit|headless|lighthouse|pagespeed|preview|monitor|python|curl\/|wget|httpclient|go-http|java\/|okhttp|scrapy|phantom|puppeteer|playwright|gptbot|claudebot|perplexitybot|bytespider|petalbot|semrush|ahrefs|mj12|dataforseo|screaming|naverbot|bingpreview|applebot/i;

function parseUA(ua) {
  const device = /iPad|Tablet|SM-T\d/i.test(ua) ? '태블릿' : /Mobi|Android|iPhone/i.test(ua) ? '모바일' : 'PC';
  const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Mac OS/i.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : '기타';
  const browser = /KAKAOTALK/i.test(ua) ? '카카오톡 인앱' : /Instagram/i.test(ua) ? '인스타그램 인앱' : /NAVER\(inapp/i.test(ua) ? '네이버 앱' : /FBAN|FBAV/.test(ua) ? '페이스북 인앱' : /Whale\//.test(ua) ? '웨일' : /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '기타';
  return { device, os, browser };
}

const SOURCE_RULES = [
  [/(^|\.)search\.naver\.com$/, '네이버 검색'],
  [/(^|\.)(m\.place|place|map|pcmap|m\.map)\.naver\.com$/, '네이버 지도·플레이스'],
  [/(^|\.)blog\.naver\.com$/, '네이버 블로그'],
  [/(^|\.)cafe\.naver\.com$/, '네이버 카페'],
  [/(^|\.)talk\.naver\.com$/, '네이버 톡톡'],
  [/(^|\.)(naver\.com|naver\.me)$/, '네이버'],
  [/gemini\.google\.com$/, 'Gemini'],
  [/(^|\.)google\./, '구글'],
  [/(^|\.)daum\.net$/, '다음'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)(kakao\.com|kakao\.co|kko\.to)$/, '카카오톡'],
  [/instagram\.com$/, '인스타그램'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, '페이스북'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, '유튜브'],
  [/(chatgpt\.com|openai\.com)$/, 'ChatGPT'],
  [/perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, 'X(트위터)'],
  [/threads\.(net|com)$/, 'Threads'],
  [/(^|\.)hongslab\.kr$/, '홍스랩'],
  [/(^|\.)(zum\.com|nate\.com|yahoo\.|duckduckgo\.com)/, '기타 검색'],
];
const UTM_NAMES = { naver: '네이버', google: '구글', kakao: '카카오톡', kakaotalk: '카카오톡', instagram: '인스타그램', facebook: '페이스북', youtube: '유튜브', blog: '블로그', sms: '문자', email: '이메일', mail: '이메일', qr: 'QR코드', namecard: '명함', card: '명함', banner: '현수막', flyer: '전단', place: '네이버 플레이스' };

function classifySource(refHost, utmSource, ua) {
  if (utmSource) return UTM_NAMES[utmSource.toLowerCase()] || utmSource.slice(0, 40);
  const h = (refHost || '').toLowerCase();
  if (!h) {
    if (/KAKAOTALK/i.test(ua)) return '카카오톡';
    if (/Instagram/i.test(ua)) return '인스타그램';
    if (/NAVER\(inapp/i.test(ua)) return '네이버 앱';
    return '직접 유입';
  }
  for (const [re, name] of SOURCE_RULES) if (re.test(h)) return name;
  return '기타 사이트';
}

async function track(req, env, ctx) {
  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return new Response(null, { status: 204 });
  const origin = req.headers.get('origin');
  if (origin) { try { if (!SELF_HOSTS.test(new URL(origin).hostname)) return new Response(null, { status: 403 }); } catch (e) { return new Response(null, { status: 403 }); } }
  // 관리자로 로그인한 브라우저의 방문은 세지 않는다
  if (hasAdminCookie(req) && (await isAdmin(env, req))) return new Response(null, { status: 204 });

  let b;
  try { const t = await req.text(); if (t.length > 4096) return new Response(null, { status: 204 }); b = JSON.parse(t); } catch (e) { return new Response(null, { status: 204 }); }
  if (!b || typeof b !== 'object') return new Response(null, { status: 204 });

  // 새 형식(p/r/q/s/l/e/d/sd/v)과 1단계 형식(page/ref/sid/w) 모두 받는다
  let path = String(b.p || b.page || '').split('?')[0].split('#')[0];
  if (!path.startsWith('/') || path.length > 200 || path.startsWith('/admin') || path.startsWith('/api')) return new Response(null, { status: 204 });
  path = path.replace(/\.html$/, '').replace(/\/index$/, '/'); if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const type = b.e ? 'event' : b.d != null ? 'leave' : 'view';
  const name = b.e ? String(b.e).slice(0, 40) : null;

  let refHost = null, refUrl = null;
  const rawRef = typeof b.r === 'string' ? b.r : (typeof b.ref === 'string' && b.ref ? 'https://' + b.ref : '');
  if (rawRef) {
    try { const r = new URL(rawRef); if (!SELF_HOSTS.test(r.hostname)) { refHost = r.hostname.toLowerCase().replace(/^www\./, ''); refUrl = (r.origin + r.pathname + r.search).slice(0, 500); } } catch (e) {}
  }
  let utmSource = null, medium = null, campaign = null;
  if (typeof b.q === 'string' && b.q) {
    const q = new URLSearchParams(b.q);
    utmSource = (q.get('utm_source') || '').slice(0, 60) || null;
    medium = (q.get('utm_medium') || '').slice(0, 60) || null;
    campaign = (q.get('utm_campaign') || '').slice(0, 80) || null;
  }
  const source = classifySource(refHost, utmSource, ua);
  const { device, os, browser } = parseUA(ua);
  const cf = req.cf || {};
  const country = cf.country || null;
  const city = cf.city ? String(cf.city).slice(0, 60) : null;
  const ts = Math.floor(Date.now() / 1000);
  const { day, hour } = kst(ts);
  const sidRaw = b.v || b.sid;
  const vid = /^[a-f0-9]{16}$/.test(sidRaw || '') ? sidRaw : (await sha256hex(day + '|' + (req.headers.get('cf-connecting-ip') || '0') + '|' + ua)).slice(0, 16);
  const screen = typeof b.s === 'string' ? b.s.slice(0, 20) : Number.isFinite(b.w) ? Math.round(b.w) + 'w' : null;
  const lang = typeof b.l === 'string' ? b.l.slice(0, 10) : null;
  const dur = type === 'leave' && Number.isFinite(b.d) ? Math.max(0, Math.min(7200, Math.round(b.d))) : null;
  const depth = type === 'leave' && Number.isFinite(b.sd) ? Math.max(0, Math.min(100, Math.round(b.sd))) : null;

  const stmt = env.DB.prepare('INSERT INTO hits (ts, day, hour, type, name, path, ref_host, ref_url, source, medium, campaign, device, browser, os, country, city, vid, screen, lang, dur, depth) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(ts, day, hour, type, name, path, refHost, refUrl, source, medium, campaign, device, browser, os, country, city, vid, screen, lang, dur, depth);
  ctx.waitUntil(stmt.run().catch(() => {}));
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

// ---------- 통계 ----------
const validDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const shiftDay = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function rangeOf(url) {
  const today = kst(Math.floor(Date.now() / 1000)).day;
  let from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!validDay(to)) to = today;
  if (!validDay(from)) from = shiftDay(to, -6);
  if (from > to) [from, to] = [to, from];
  let days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days > 400) { from = shiftDay(to, -399); days = 400; }
  return { from, to, days, prevFrom: shiftDay(from, -days), prevTo: shiftDay(from, -1), today };
}

const DIMS = [['device', false], ['browser', false], ['os', false], ['country', false], ['city', true], ['screen', true], ['lang', true]];
async function stats(env, url) {
  const rg = rangeOf(url);
  const { from, to, prevFrom: pf, prevTo: pt } = rg;
  const now = Math.floor(Date.now() / 1000);
  const D = env.DB, q = (sql, ...a) => D.prepare(sql).bind(...a);
  const V = `type='view' AND day BETWEEN ? AND ?`;
  const rows = await D.batch([
    /*0*/ q(`SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT day || vid) visits FROM hits WHERE ${V}`, from, to),
    /*1*/ q(`SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT day || vid) visits FROM hits WHERE ${V}`, pf, pt),
    /*2*/ q(`SELECT COUNT(*) c, COUNT(DISTINCT vid) u FROM hits WHERE type='event' AND day BETWEEN ? AND ?`, from, to),
    /*3*/ q(`SELECT COUNT(*) c, COUNT(DISTINCT vid) u FROM hits WHERE type='event' AND day BETWEEN ? AND ?`, pf, pt),
    /*4*/ q(`SELECT day, SUM(type='view') pv, COUNT(DISTINCT CASE WHEN type='view' THEN vid END) uv, SUM(type='event') ev FROM hits WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`, from, to),
    /*5*/ q(`SELECT hour, SUM(type='view') pv, COUNT(DISTINCT CASE WHEN type='view' THEN vid END) uv, SUM(type='event') ev FROM hits WHERE day BETWEEN ? AND ? GROUP BY hour ORDER BY hour`, from, to),
    /*6*/ q(`SELECT source, COUNT(*) pv, COUNT(DISTINCT vid) uv FROM hits WHERE ${V} GROUP BY source ORDER BY uv DESC, pv DESC`, from, to),
    /*7*/ q(`SELECT ref_host, ref_url, COUNT(*) pv, COUNT(DISTINCT vid) uv FROM hits WHERE ${V} AND ref_host IS NOT NULL GROUP BY ref_url ORDER BY uv DESC, pv DESC LIMIT 30`, from, to),
    /*8*/ q(`SELECT source, medium, campaign, COUNT(*) pv, COUNT(DISTINCT vid) uv FROM hits WHERE ${V} AND (medium IS NOT NULL OR campaign IS NOT NULL) GROUP BY source, medium, campaign ORDER BY uv DESC LIMIT 30`, from, to),
    /*9*/ q(`SELECT path, COUNT(*) pv, COUNT(DISTINCT vid) uv FROM hits WHERE ${V} GROUP BY path ORDER BY pv DESC LIMIT 30`, from, to),
    /*10*/ q(`SELECT path, COUNT(*) c FROM (SELECT path, MIN(ts) m FROM hits WHERE ${V} GROUP BY day, vid) GROUP BY path ORDER BY c DESC LIMIT 20`, from, to),
    /*11*/ q(`SELECT 1`), // (예전 UNION ALL 자리 — D1 은 compound SELECT 항 수를 제한해 아래 29~35 로 분리)
    /*12*/ q(`SELECT name, COUNT(*) c, COUNT(DISTINCT vid) u FROM hits WHERE type='event' AND day BETWEEN ? AND ? GROUP BY name ORDER BY c DESC`, from, to),
    /*13*/ q(`SELECT COUNT(DISTINCT vid) n FROM hits WHERE ts > ?`, now - LIVE_SEC),
    /*14*/ q(`SELECT ts, type, name, path, source, ref_host, device, browser, country, city, dur FROM hits WHERE type <> 'leave' OR dur >= 10 ORDER BY ts DESC LIMIT 50`),
    /*15*/ q(`SELECT COUNT(*) n FROM (SELECT vid, MIN(day) d0 FROM hits WHERE type='view' GROUP BY vid) WHERE d0 BETWEEN ? AND ?`, from, to),
    /*16*/ q(`SELECT COUNT(*) n FROM (SELECT vid, MIN(day) d0 FROM hits WHERE type='view' GROUP BY vid) WHERE d0 BETWEEN ? AND ?`, pf, pt),
    /*17*/ q(`SELECT CAST(strftime('%w', day) AS INTEGER) wd, hour, COUNT(DISTINCT vid) uv, COUNT(*) pv FROM hits WHERE ${V} GROUP BY wd, hour`, from, to),
    /*18*/ q(`SELECT path, COUNT(*) n, ROUND(AVG(dur)) dur, ROUND(AVG(depth)) depth FROM hits WHERE type='leave' AND day BETWEEN ? AND ? GROUP BY path ORDER BY n DESC LIMIT 30`, from, to),
    /*19*/ q(`SELECT ROUND(AVG(dur)) dur, ROUND(AVG(depth)) depth, COUNT(*) n FROM hits WHERE type='leave' AND day BETWEEN ? AND ?`, from, to),
    /*20*/ q(`SELECT ROUND(AVG(dur)) dur, ROUND(AVG(depth)) depth FROM hits WHERE type='leave' AND day BETWEEN ? AND ?`, pf, pt),
    /*21*/ q(`SELECT source, COUNT(DISTINCT CASE WHEN type='view' THEN day || vid END) visits, COUNT(DISTINCT CASE WHEN type='event' THEN day || vid END) cv, SUM(type='event') ev FROM hits WHERE day BETWEEN ? AND ? GROUP BY source ORDER BY visits DESC LIMIT 20`, from, to),
    /*22*/ q(`SELECT path, COUNT(DISTINCT CASE WHEN type='view' THEN day || vid END) visits, COUNT(DISTINCT CASE WHEN type='event' THEN day || vid END) cv, SUM(type='event') ev FROM hits WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY visits DESC LIMIT 20`, from, to),
    /*23*/ q(`SELECT COUNT(*) n FROM (SELECT day, vid, COUNT(*) c FROM hits WHERE ${V} GROUP BY day, vid) WHERE c = 1`, from, to),
    /*24*/ q(`SELECT COUNT(*) n FROM (SELECT day, vid, COUNT(*) c FROM hits WHERE ${V} GROUP BY day, vid) WHERE c = 1`, pf, pt),
    /*25*/ q(`SELECT name, COUNT(*) c, COUNT(DISTINCT vid) u FROM hits WHERE type='event' AND day BETWEEN ? AND ? GROUP BY name ORDER BY c DESC`, pf, pt),
    /*26*/ q(`SELECT day, name, COUNT(*) c FROM hits WHERE type='event' AND day BETWEEN ? AND ? GROUP BY day, name ORDER BY day`, from, to),
    /*27*/ q(`SELECT COUNT(*) n FROM hits WHERE type='view'`),
    /*28*/ q(`SELECT MIN(day) d FROM hits`),
    // 29~35: 기기·브라우저·OS·국가·도시·화면·언어 (D1 제한 때문에 UNION ALL 대신 따로 조회)
    ...DIMS.map(([col, notNull]) => q(`SELECT ${col} k, COUNT(DISTINCT vid) uv, COUNT(*) pv FROM hits WHERE ${V}${notNull ? ` AND ${col} IS NOT NULL` : ''} GROUP BY ${col} ORDER BY uv DESC LIMIT 30`, from, to)),
  ]);
  const r = rows.map((x) => x.results || []);
  const dims = {};
  DIMS.forEach(([col], i) => { dims[col] = r[29 + i].map((row) => ({ k: row.k || '알 수 없음', uv: row.uv, pv: row.pv })); });
  return {
    range: rg,
    totals: { ...r[0][0], events: r[2][0].c, eventUsers: r[2][0].u, newUsers: r[15][0].n, bounce: r[23][0].n, dur: r[19][0].dur, depth: r[19][0].depth, leaves: r[19][0].n },
    prev: { ...r[1][0], events: r[3][0].c, eventUsers: r[3][0].u, newUsers: r[16][0].n, bounce: r[24][0].n, dur: r[20][0].dur, depth: r[20][0].depth, eventsByName: r[25] },
    daily: r[4], hourly: r[5], sources: r[6], referrers: r[7], campaigns: r[8], pages: r[9], landing: r[10],
    dims, events: r[12], live: r[13][0].n, recent: r[14], heat: r[17], engagement: r[18],
    convBySource: r[21], convByPage: r[22], eventsDaily: r[26],
    all: { pv: r[27][0].n, since: r[28][0].d },
  };
}

async function exportCsv(env, url) {
  const rg = rangeOf(url);
  const { results } = await env.DB.prepare('SELECT ts, day, hour, type, name, path, ref_host, ref_url, source, medium, campaign, device, browser, os, country, city, vid, screen, lang, dur, depth FROM hits WHERE day BETWEEN ? AND ? ORDER BY ts LIMIT 50000').bind(rg.from, rg.to).all();
  const cols = ['ts', 'day', 'hour', 'type', 'name', 'path', 'ref_host', 'ref_url', 'source', 'medium', 'campaign', 'device', 'browser', 'os', 'country', 'city', 'vid', 'screen', 'lang', 'dur', 'depth'];
  const cell = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [cols.join(',')];
  for (const row of results) lines.push(cols.map((c) => cell(row[c])).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="lycangym-visits-${rg.from}_${rg.to}.csv"`, 'cache-control': 'no-store' } });
}

// ---------- 라우팅 ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;

    // 올린 사진
    if (p.startsWith('/uploads/')) {
      const id = p.slice(9).replace(/\.[a-z]+$/, '');
      if (!/^[a-f0-9]{24}$/.test(id)) return new Response('Not found', { status: 404 });
      const row = await env.DB.prepare('SELECT mime, data FROM files WHERE id = ?').bind(id).first();
      if (!row) return new Response('Not found', { status: 404 });
      return new Response(row.data, { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);

    try {
      // 공개: 저장된 콘텐츠
      if (p === '/api/content' && req.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT key, value FROM content').all();
        const map = {}; results.forEach((r) => { try { map[r.key] = JSON.parse(r.value); } catch (e) {} });
        return json(map, 200, { 'cache-control': 'public, max-age=30' });
      }
      // 공개: 방문 기록
      if (p === '/api/track') {
        if (req.method !== 'POST') return new Response(null, { status: 405 });
        return track(req, env, ctx);
      }
      // 로그인 상태
      if (p === '/api/me') {
        const hasAuth = !!(await getSetting(env, 'auth'));
        return json({ admin: hasAuth && (await isAdmin(env, req)), setup: !hasAuth });
      }
      // 처음 비밀번호 설정 (비밀번호가 아직 없을 때만)
      if (p === '/api/setup' && req.method === 'POST') {
        if (await getSetting(env, 'auth')) return json({ error: '이미 비밀번호가 있습니다.' }, 409);
        const { password } = await req.json().catch(() => ({}));
        if (!password || password.length < 8) return json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400);
        await setPassword(env, password);
        return json({ ok: true }, 200, { 'set-cookie': await makeCookie(env) });
      }
      if (p === '/api/login' && req.method === 'POST') {
        if (await loginLocked(env)) return json({ error: '실패가 많아 10분간 잠겼습니다.' }, 429);
        const { password } = await req.json().catch(() => ({}));
        const ok = await verifyPassword(env, String(password || ''));
        await noteFail(env, ok);
        if (!ok) return json({ error: '비밀번호가 맞지 않습니다.' }, 401);
        return json({ ok: true }, 200, { 'set-cookie': await makeCookie(env) });
      }
      if (p === '/api/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': clearCookie() });

      // 이하 관리자 전용
      if (!(await isAdmin(env, req))) return json({ error: '로그인이 필요합니다.' }, 401);

      if (p === '/api/password' && req.method === 'POST') {
        const { current, next } = await req.json().catch(() => ({}));
        if (!(await verifyPassword(env, String(current || '')))) return json({ error: '현재 비밀번호가 맞지 않습니다.' }, 401);
        if (!next || next.length < 8) return json({ error: '새 비밀번호는 8자 이상이어야 합니다.' }, 400);
        await setPassword(env, next);
        return json({ ok: true });
      }
      const mc = p.match(/^\/api\/content\/([a-z0-9_.-]{1,60})$/i);
      if (mc && req.method === 'PUT') {
        const text = await req.text();
        if (text.length > 400000) return json({ error: '내용이 너무 큽니다.' }, 413);
        let v; try { v = JSON.parse(text); } catch (e) { return json({ error: 'JSON 형식이 아닙니다.' }, 400); }
        await env.DB.prepare('INSERT INTO content (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(mc[1], JSON.stringify(v), Math.floor(Date.now() / 1000)).run();
        return json({ ok: true });
      }
      if (mc && req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM content WHERE key = ?').bind(mc[1]).run();
        return json({ ok: true });
      }
      if (p === '/api/stats' && req.method === 'GET') return json(await stats(env, url));
      if (p === '/api/export' && req.method === 'GET') return exportCsv(env, url);
      if (p === '/api/status' && req.method === 'GET') {
        const [files, content] = await Promise.all([
          env.DB.prepare('SELECT COUNT(*) n, COALESCE(SUM(size),0) bytes FROM files').first(),
          env.DB.prepare('SELECT key, updated_at FROM content ORDER BY updated_at DESC').all(),
        ]);
        return json({ files, content: content.results || [] });
      }
      if (p === '/api/upload' && req.method === 'POST') {
        const mime = (req.headers.get('content-type') || '').split(';')[0].trim();
        if (!/^image\/(jpeg|png|webp)$/.test(mime)) return json({ error: 'JPEG·PNG·WebP 만 올릴 수 있습니다.' }, 415);
        const buf = await req.arrayBuffer();
        if (buf.byteLength > MAX_UPLOAD) return json({ error: '파일이 너무 큽니다 (최대 1.5MB).' }, 413);
        const id = rand(12), ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        await env.DB.prepare('INSERT INTO files (id, mime, size, data, created) VALUES (?, ?, ?, ?, ?)').bind(id, mime, buf.byteLength, buf, Math.floor(Date.now() / 1000)).run();
        return json({ ok: true, url: '/uploads/' + id + '.' + ext });
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: '서버 오류: ' + (e && e.message ? e.message : e) }, 500);
    }
  },
};
