// 방문 기록: 페이지를 열 때 Supabase visits 테이블에 한 줄 넣는다 (anon 키, insert 만 허용).
// 개인정보 없음 — 페이지 경로, 유입 사이트(도메인만), 브라우저별 무작위 ID, 화면 폭.
(function () {
  'use strict';
  var SB = window.SB || {};
  if (!SB.url || !SB.anon || !window.fetch) return;
  if (/\/admin/.test(location.pathname)) return;
  if (navigator.webdriver) return;
  var sid = '';
  try {
    sid = localStorage.getItem('ly_sid') || '';
    if (!/^[a-f0-9]{16}$/.test(sid)) {
      var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a);
      sid = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      localStorage.setItem('ly_sid', sid);
    }
  } catch (e) { sid = ''; }
  var page = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  // 같은 페이지를 30분 안에 다시 열면 세지 않는다(새로고침 중복 방지)
  try {
    var key = 'ly_seen:' + page, last = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (Date.now() - last < 30 * 60 * 1000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch (e) {}
  var ref = '';
  try { if (document.referrer) { var u = new URL(document.referrer); if (u.host !== location.host) ref = u.host; } } catch (e) {}
  fetch(SB.url + '/rest/v1/visits', {
    method: 'POST', keepalive: true,
    headers: { apikey: SB.anon, Authorization: 'Bearer ' + SB.anon, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ page: page.slice(0, 200), ref: ref.slice(0, 200) || null, sid: sid || null, w: window.innerWidth || null })
  }).catch(function () {});
})();
