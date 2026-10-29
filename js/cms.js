// 라이칸짐 CMS 로더: Supabase site_content 에 저장된 값으로 화면 문구·가격표·리뷰·사진을 덮어쓴다.
// site.js 보다 먼저 읽히며, window.CMS_READY(Promise) 가 끝난 뒤 site.js 가 슬라이드 등을 초기화한다.
// Supabase 설정이 비어 있거나 응답이 늦으면(1.5초) 원래 HTML 그대로 보여준다.
(function () {
  'use strict';
  var SB = window.SB || {};
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rich = function (s) { return esc(s).replace(/\r?\n/g, '<br>'); };

  function fetchContent() {
    if (!SB.url || !SB.anon || !window.fetch) return Promise.resolve(null);
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 1500);
    return fetch(SB.url + '/rest/v1/site_content?select=key,value', {
      headers: { apikey: SB.anon, Authorization: 'Bearer ' + SB.anon },
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        clearTimeout(timer);
        if (!rows) return null;
        var map = {};
        rows.forEach(function (r) { map[r.key] = r.value; });
        return map;
      })
      .catch(function () { clearTimeout(timer); return null; });
  }

  function applyText(map) {
    var text = map.text || {};
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      var k = el.getAttribute('data-cms');
      if (!(k in text)) return;
      var v = text[k];
      var attr = el.getAttribute('data-cms-attr');
      if (attr) { el.setAttribute(attr, v); return; }
      if (el.getAttribute('data-cms-fmt') === 'rich') el.innerHTML = rich(v); else el.textContent = v;
    });
  }

  // 가격표: [{k, v, per, best}]
  function applyPrices(map) {
    document.querySelectorAll('[data-cms-list^="prices."]').forEach(function (ul) {
      var rows = map[ul.getAttribute('data-cms-list')];
      if (!Array.isArray(rows) || !rows.length) return;
      ul.innerHTML = rows.map(function (r) {
        return '<li' + (r.best ? ' class="best"' : '') + '><p class="k HeadXS">' + esc(r.k) + (r.best ? '<span class="tag">BEST</span>' : '') + '</p><p class="v HeadXS">' + esc(r.v) + '</p><p class="per BodyXS">' + esc(r.per) + '</p></li>';
      }).join('');
    });
  }

  // 리뷰: [{stars, text, name, tag}]
  function applyReviews(map) {
    var ul = document.getElementById('rvTrack'), rows = map.reviews;
    if (!ul || !Array.isArray(rows) || !rows.length) return;
    ul.innerHTML = rows.map(function (r) {
      var n = Math.max(1, Math.min(5, parseInt(r.stars, 10) || 5));
      return '<li><blockquote><p class="stars" aria-label="별점 ' + n + '점">' + '★★★★★'.slice(0, n) + '</p><p class="BodyXS">' + rich(r.text) + '</p><p class="BodyXL">' + esc(r.name) + (r.tag ? ' <small>' + esc(r.tag) + '</small>' : '') + '</p></blockquote></li>';
    }).join('');
  }

  // 사진 슬라이드: [{src, alt, wide}] — 관리자가 올린 사진이 있으면 트랙을 통째로 바꾼다
  function applySlides(map) {
    [['kvTrack', 'slides.kv'], ['baTrack', 'slides.ba'], ['tkTrack', 'slides.tk']].forEach(function (p) {
      var ul = document.getElementById(p[0]), rows = map[p[1]];
      if (!ul || !Array.isArray(rows) || !rows.length) return;
      ul.innerHTML = rows.map(function (r, i) {
        return '<li' + (r.wide ? ' class="wide"' : '') + '><img src="' + esc(r.src) + '" alt="' + esc(r.alt || '') + '"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + '></li>';
      }).join('');
    });
  }

  function apply(map) {
    if (!map) return;
    try { applyText(map); applyPrices(map); applyReviews(map); applySlides(map); } catch (e) { /* 덮어쓰기 실패 시 원본 유지 */ }
  }

  var domReady = new Promise(function (res) {
    if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', function () { res(); });
  });
  window.CMS_READY = Promise.all([fetchContent(), domReady]).then(function (r) { apply(r[0]); window.CMS_DATA = r[0] || {}; });
})();
