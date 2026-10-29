// 라이칸짐 연수점 Worker — 정적 파일은 Cloudflare assets 가 먼저 처리하고, 여기는 /api/* 와 /uploads/* 만 맡는다.
// 저장소: D1 (binding DB). settings(비밀번호 해시·세션 키), content(관리자 저장값), visits(방문 기록), files(사진).
// 비밀번호는 관리자 페이지에서 처음 한 번 정하며(wrangler secret 불필요), 세션은 HMAC 서명 쿠키.

const COOKIE = 'ly_admin';
const SESSION_DAYS = 30;
const KST = 9 * 3600;
const MAX_UPLOAD = 1536 * 1024;        // 1.5MB (관리자 화면이 1600px 로 줄여 올림)

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

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

// ---------- 통계 ----------
const dayOf = (ts) => new Date((ts + KST) * 1000).toISOString().slice(0, 10);
async function stats(env) {
  const now = Math.floor(Date.now() / 1000), since = now - 30 * 86400;
  const { results } = await env.DB.prepare('SELECT ts, page, ref, sid FROM visits WHERE ts >= ? ORDER BY ts DESC LIMIT 50000').bind(since).all();
  const today = dayOf(now), d7 = dayOf(now - 6 * 86400);
  const agg = (rows) => ({ pv: rows.length, uv: new Set(rows.map((r) => r.sid || Math.random())).size });
  const days = []; for (let i = 29; i >= 0; i--) days.push(dayOf(now - i * 86400));
  const byDay = {}, pages = {}, refs = {};
  results.forEach((r) => {
    const d = dayOf(r.ts); byDay[d] = (byDay[d] || 0) + 1;
    pages[r.page] = (pages[r.page] || 0) + 1;
    const k = r.ref || '직접 입력 · 북마크 · 앱'; refs[k] = (refs[k] || 0) + 1;
  });
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    today: agg(results.filter((r) => dayOf(r.ts) === today)),
    week: agg(results.filter((r) => dayOf(r.ts) >= d7)),
    month: agg(results),
    days: days.map((d) => ({ day: d, pv: byDay[d] || 0 })),
    pages: top(pages), refs: top(refs),
  };
}

// ---------- 라우팅 ----------
export default {
  async fetch(req, env) {
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
      if (p === '/api/track' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const page = String(b.page || '').slice(0, 200), ref = b.ref ? String(b.ref).slice(0, 200) : null;
        const sid = /^[a-f0-9]{16}$/.test(b.sid || '') ? b.sid : null, w = Number.isFinite(b.w) ? Math.round(b.w) : null;
        if (!page.startsWith('/') || page.startsWith('/admin') || page.startsWith('/api')) return json({ ok: false }, 400);
        await env.DB.prepare('INSERT INTO visits (ts, page, ref, sid, w) VALUES (?, ?, ?, ?, ?)').bind(Math.floor(Date.now() / 1000), page, ref, sid, w).run();
        return json({ ok: true }, 201);
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
      if (p === '/api/stats' && req.method === 'GET') return json(await stats(env));
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
