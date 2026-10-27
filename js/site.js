(function () {
  'use strict';
  var doc = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  doc.classList.add('intro-done');

  // ---------- 메인 문구: 글자 단위로 쪼개 순차 등장 ('변화'는 빨강 강조) ----------
  var kvH = document.querySelector('.kvCopy .HeadL');
  if (kvH) {
    var idx = 0, frag = document.createDocumentFragment();
    Array.prototype.slice.call(kvH.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        var txt = node.textContent, i = 0;
        while (i < txt.length) {
          var em = txt.indexOf('변화', i) === i;
          var piece = em ? '변화' : txt.charAt(i);
          var wrap = em ? document.createElement('span') : null;
          if (wrap) wrap.className = 'em';
          for (var k = 0; k < piece.length; k++) {
            var sp = document.createElement('span');
            sp.className = 'ch' + (piece.charAt(k) === ' ' ? ' sp' : '');
            sp.textContent = piece.charAt(k) === ' ' ? ' ' : piece.charAt(k);
            sp.style.setProperty('--i', idx++);
            (wrap || frag).appendChild(sp);
          }
          if (wrap) frag.appendChild(wrap);
          i += piece.length;
        }
      } else { frag.appendChild(node.cloneNode(true)); }
    });
    kvH.textContent = ''; kvH.appendChild(frag);
  }

  // ---------- 가로 슬라이드(메인 시설 사진·비포애프터): 자동 넘김 + 스와이프 + 점 표시 ----------
  function initSlider(track, dotsEl) {
    var slides = Array.prototype.slice.call(track.children), idx = 0, timer = null, pause = false;
    slides.forEach(function (_, i) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', (i + 1) + '번째 사진');
      b.addEventListener('click', function () { go(i, true); });
      dotsEl.appendChild(b);
    });
    var dots = Array.prototype.slice.call(dotsEl.children);
    function perView() { var w = slides[0].offsetWidth, gap = parseFloat(getComputedStyle(track).gap) || 0; return Math.max(1, Math.round((track.clientWidth + gap) / (w + gap))); }
    function maxIdx() { return Math.max(0, slides.length - perView()); }
    function go(i, user) {
      idx = Math.min(Math.max(0, i), maxIdx());
      track.scrollTo({ left: slides[idx].offsetLeft - slides[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
      paint();
      if (user) restart();
    }
    function paint() { dots.forEach(function (d, i) { d.classList.toggle('on', i === idx); }); }
    function tick() { if (document.hidden || pause) return; go(idx >= maxIdx() ? 0 : idx + 1); }
    function restart() { clearInterval(timer); if (!reduce) timer = setInterval(tick, 3500); }
    var st;
    track.addEventListener('scroll', function () {
      clearTimeout(st);
      st = setTimeout(function () {
        var x = track.scrollLeft, best = 0, bd = Infinity;
        slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft - slides[0].offsetLeft - x); if (d < bd) { bd = d; best = i; } });
        idx = Math.min(best, maxIdx()); paint();
      }, 80);
    }, { passive: true });
    track.addEventListener('pointerdown', function () { pause = true; }, { passive: true });
    track.addEventListener('pointerup', function () { pause = false; restart(); }, { passive: true });
    track.addEventListener('touchstart', function () { pause = true; }, { passive: true });
    track.addEventListener('touchend', function () { pause = false; restart(); }, { passive: true });
    track.addEventListener('mouseenter', function () { pause = true; });
    track.addEventListener('mouseleave', function () { pause = false; });
    window.addEventListener('resize', function () { go(idx); });
    paint(); restart();
  }
  [['kvTrack', 'kvDots'], ['baTrack', 'baDots']].forEach(function (p) {
    var t = document.getElementById(p[0]), d = document.getElementById(p[1]);
    if (t && d && t.children.length) initSlider(t, d);
  });

  // ---------- 헤더: 어두운 섹션 위에서는 흰색, 스크롤 다운 시 숨김 ----------
  var header = document.getElementById('header');
  var darkSections = Array.prototype.slice.call(document.querySelectorAll('.sec01'));
  var lastY = 0;
  function onScroll() {
    var y = window.scrollY || 0;
    var h = header.offsetHeight;
    var onDark = darkSections.some(function (s) {
      var r = s.getBoundingClientRect();
      return r.top <= h && r.bottom >= h;
    });
    header.classList.toggle('onDark', onDark);
    header.classList.toggle('scrolled', y > 10);
    if (!header.classList.contains('open')) header.classList.toggle('hide', y > lastY && y > 200);
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- 전체 메뉴 ----------
  var menuBtn = document.getElementById('menuOpen'), gnb = document.getElementById('gnb');
  function setMenu(open) {
    header.classList.toggle('open', open);
    doc.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    gnb.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }
  menuBtn.addEventListener('click', function () { setMenu(!header.classList.contains('open')); });
  gnb.querySelectorAll('.gnbList .btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var ex = b.getAttribute('aria-expanded') === 'true';
      gnb.querySelectorAll('.gnbList .btn').forEach(function (o) { o.setAttribute('aria-expanded', 'false'); });
      b.setAttribute('aria-expanded', ex ? 'false' : 'true');
    });
  });
  gnb.querySelectorAll('a[href^="#"]').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && header.classList.contains('open')) setMenu(false); });
  // 첫 그룹은 열어둠
  var firstBtn = gnb.querySelector('.gnbList .btn'); if (firstBtn) firstBtn.setAttribute('aria-expanded', 'true');

  // ---------- 등장 효과 ----------
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }) : null;
  document.querySelectorAll('.reveal').forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });

  // ---------- 영상: 화면에 보일 때만 재생 (데이터 절약) ----------
  var vids = document.querySelectorAll('main video');
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; var pp = v.play(); if (pp && pp.catch) pp.catch(function () {}); }
        else v.pause();
      });
    }, { threshold: 0.2 });
    vids.forEach(function (v) { vio.observe(v); });
  }

  // ---------- 앵커 이동 시 고정 헤더만큼 보정 ----------
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1); if (!id) return;
      var el = document.getElementById(id); if (!el) return;
      e.preventDefault();
      var top = el.getBoundingClientRect().top + window.scrollY - (id === 'top' ? 0 : header.offsetHeight);
      window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      history.replaceState(null, '', '#' + id);
    });
  });
})();
