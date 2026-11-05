// 라이칸짐 CMS 로더: 관리자 페이지에서 저장한 값(/api/content, D1)으로 화면 문구·가격표·리뷰·사진·FAQ 를 덮어쓴다.
// FAQ·가격을 덮어쓴 뒤에는 JSON-LD(FAQPage·Service offers)도 같은 내용으로 맞춘다.
// site.js 보다 먼저 읽히며, window.CMS_READY(Promise) 가 끝난 뒤 site.js 가 슬라이드 등을 초기화한다.
// 응답이 늦으면(1.5초) 원래 HTML 그대로 보여준다. file:// 로 열었을 때는 건너뛴다.
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rich = function (s) { return esc(s).replace(/\r?\n/g, '<br>'); };

  function fetchContent() {
    if (!window.fetch || location.protocol === 'file:') return Promise.resolve(null);
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 1500);
    return fetch('/api/content', { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
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

  // 사진 슬라이드: [{src, alt, wide}] — 관리자가 저장한 목록이 있으면 트랙을 통째로 바꾼다
  function applySlides(map) {
    [['kvTrack', 'slides.kv'], ['baTrack', 'slides.ba'], ['tkTrack', 'slides.tk']].forEach(function (p) {
      var ul = document.getElementById(p[0]), rows = map[p[1]];
      if (!ul || !Array.isArray(rows) || !rows.length) return;
      ul.innerHTML = rows.map(function (r, i) {
        return '<li' + (r.wide ? ' class="wide"' : '') + '><img src="' + esc(r.src) + '" alt="' + esc(r.alt || '') + '"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + '></li>';
      }).join('');
    });
  }

  // 구조화 데이터(JSON-LD) 동기화: 관리자가 FAQ·가격을 바꾸면 검색엔진·AI 가 읽는 데이터도 같이 바꾼다
  function syncFaqLd() {
    var s = document.getElementById('ld-faq'), items = document.querySelectorAll('.faqList details');
    if (!s || !items.length) return;
    var list = [];
    items.forEach(function (d) {
      var q = d.querySelector('summary'), a = d.querySelector('.faqA');
      var qt = q ? q.textContent.replace(/\s+/g, ' ').trim() : '', at = a ? a.textContent.replace(/\s+/g, ' ').trim() : '';
      if (qt && at) list.push({ '@type': 'Question', name: qt, acceptedAnswer: { '@type': 'Answer', text: at } });
    });
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list });
  }
  function syncOffersLd() {
    var s = document.getElementById('ld-offers'), ul = document.querySelector('[data-cms-list^="prices."]');
    if (!s || !ul) return;
    var j; try { j = JSON.parse(s.textContent); } catch (e) { return; }
    var svc = (j['@graph'] || []).filter(function (o) { return o['@type'] === 'Service'; })[0];
    if (!svc) return;
    var offers = [];
    ul.querySelectorAll('li').forEach(function (li) {
      var k = li.querySelector('.k'), v = li.querySelector('.v');
      var name = k && k.firstChild ? k.firstChild.textContent.trim() : '', price = (v ? v.textContent : '').replace(/[^0-9]/g, '');
      if (name && price) offers.push({ '@type': 'Offer', name: name, price: price, priceCurrency: 'KRW', availability: 'https://schema.org/InStock', itemOffered: { '@type': 'Service', name: svc.name + ' ' + name } });
    });
    if (offers.length) { svc.offers = offers; s.textContent = JSON.stringify(j); }
  }

  function apply(map) {
    if (!map) return;
    try { applyText(map); applyPrices(map); applyReviews(map); applySlides(map); } catch (e) { /* 덮어쓰기 실패 시 원본 유지 */ }
    try { if (map.text) syncFaqLd(); if (Object.keys(map).some(function (k) { return k.indexOf('prices.') === 0; })) syncOffersLd(); } catch (e) {}
  }

  var domReady = new Promise(function (res) {
    if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', function () { res(); });
  });
  window.CMS_READY = Promise.all([fetchContent(), domReady]).then(function (r) { apply(r[0]); window.CMS_DATA = r[0] || {}; });
})();
