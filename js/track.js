// 방문 통계 (자체 호스팅, /api/track → D1 hits). 개인정보 없음.
// 보내는 것: 페이지 경로, 유입 주소, UTM 쿼리, 화면 크기, 언어, 브라우저별 무작위 ID(localStorage ly_sid),
//            연락 버튼 클릭(전화·카톡·지도·리뷰·인스타·블로그·톡톡), 페이지를 떠날 때 머문 시간·스크롤 깊이.
// 관리자로 로그인한 브라우저와 검색엔진 봇은 서버에서 제외한다.
(function () {
  'use strict';
  if (!window.fetch || location.protocol === 'file:') return;
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
  var base = { p: page, r: document.referrer || '', q: location.search || '', s: screen.width + 'x' + screen.height, l: navigator.language || '', v: sid || undefined };

  function send(extra) {
    try {
      var d = {}; for (var k in base) if (base[k] !== undefined) d[k] = base[k];
      if (extra) for (var j in extra) d[j] = extra[j];
      var body = JSON.stringify(d);
      if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      else fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: body }).catch(function () {});
    } catch (e) {}
  }

  // 1) 페이지 열람
  send();

  // 2) 연락·이동 버튼 클릭
  document.addEventListener('click', function (ev) {
    var t = ev.target, a = t && t.closest ? t.closest('a,button,summary') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '', name = '';
    if (href.indexOf('tel:') === 0) name = 'tel';
    else if (href.indexOf('pf.kakao.com') >= 0) name = 'kakao';
    else if (href.indexOf('talk.naver.com') >= 0) name = 'talk';
    else if (href.indexOf('instagram.com') >= 0) name = 'insta';
    else if (href.indexOf('blog.naver.com') >= 0) name = 'blog';
    else if (href.indexOf('map.naver.com') >= 0 || href.indexOf('place.naver.com') >= 0) name = /review/.test(href) ? 'review' : 'map';
    else if (href.indexOf('maps.google') >= 0 || href.indexOf('goo.gl/maps') >= 0) name = 'map';
    else if (a.tagName === 'SUMMARY' && a.closest('.faqList')) { var det = a.parentNode; if (det && !det.open) name = 'faq'; }
    else if (/health(\.html)?(#price)?$/.test(href) || /#price$/.test(href)) name = 'price';
    if (name) send({ e: name });
  }, true);

  // 3) 떠날 때: 머문 시간(화면에 보인 시간만)·스크롤 깊이
  var shown = Date.now(), acc = 0, maxDepth = 0, sent = false;
  function depthNow() {
    var doc = document.documentElement, h = Math.max(doc.scrollHeight - window.innerHeight, 1);
    return Math.min(100, Math.round(((window.scrollY || doc.scrollTop || 0) / h) * 100));
  }
  function onScroll() { var d = depthNow(); if (d > maxDepth) maxDepth = d; }
  window.addEventListener('scroll', onScroll, { passive: true });
  setTimeout(onScroll, 1500);
  var hidden = false;
  function leave() {
    if (sent) return;
    sent = true;
    var ms = acc + (hidden ? 0 : Date.now() - shown);
    send({ d: Math.round(ms / 1000), sd: Math.max(maxDepth, depthNow()) });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (!hidden) { acc += Date.now() - shown; hidden = true; } leave(); }
    else { shown = Date.now(); hidden = false; }
  });
  window.addEventListener('pagehide', function () { if (!hidden) { acc += Date.now() - shown; hidden = true; } leave(); });
})();
