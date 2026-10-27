(function () {
  'use strict';
  var doc = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  doc.classList.add('intro-done');

  // ---------- 메인 시설 사진 슬라이드: 자동 넘김 + 스와이프 + 점 표시 ----------
  var kvTrack = document.getElementById('kvTrack'), kvDots = document.getElementById('kvDots');
  if (kvTrack && kvDots) {
    var slides = Array.prototype.slice.call(kvTrack.children), kvIdx = 0, kvTimer = null, kvPause = false;
    slides.forEach(function (_, i) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', (i + 1) + '번째 사진');
      b.addEventListener('click', function () { goKv(i, true); });
      kvDots.appendChild(b);
    });
    var dots = Array.prototype.slice.call(kvDots.children);
    function perView() { var w = slides[0].offsetWidth, gap = parseFloat(getComputedStyle(kvTrack).gap) || 0; return Math.max(1, Math.round((kvTrack.clientWidth - 2 * slides[0].offsetLeft + gap) / (w + gap))); }
    function maxIdx() { return Math.max(0, slides.length - perView()); }
    function goKv(i, user) {
      kvIdx = Math.min(Math.max(0, i), maxIdx());
      kvTrack.scrollTo({ left: slides[kvIdx].offsetLeft - slides[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
      paint();
      if (user) restart();
    }
    function paint() { dots.forEach(function (d, i) { d.classList.toggle('on', i === kvIdx); }); }
    function tick() { if (document.hidden || kvPause) return; goKv(kvIdx >= maxIdx() ? 0 : kvIdx + 1); }
    function restart() { clearInterval(kvTimer); if (!reduce) kvTimer = setInterval(tick, 3500); }
    var st;
    kvTrack.addEventListener('scroll', function () {
      clearTimeout(st);
      st = setTimeout(function () {
        var x = kvTrack.scrollLeft, best = 0, bd = Infinity;
        slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft - slides[0].offsetLeft - x); if (d < bd) { bd = d; best = i; } });
        kvIdx = Math.min(best, maxIdx()); paint();
      }, 80);
    }, { passive: true });
    kvTrack.addEventListener('pointerdown', function () { kvPause = true; }, { passive: true });
    kvTrack.addEventListener('pointerup', function () { kvPause = false; restart(); }, { passive: true });
    kvTrack.addEventListener('touchstart', function () { kvPause = true; }, { passive: true });
    kvTrack.addEventListener('touchend', function () { kvPause = false; restart(); }, { passive: true });
    kvTrack.addEventListener('mouseenter', function () { kvPause = true; });
    kvTrack.addEventListener('mouseleave', function () { kvPause = false; });
    window.addEventListener('resize', function () { goKv(kvIdx); });
    paint(); restart();
  }

  // ---------- 헤더: 어두운 섹션 위에서는 흰색, 스크롤 다운 시 숨김 ----------
  var header = document.getElementById('header');
  var darkSections = Array.prototype.slice.call(document.querySelectorAll('.sec01, .sec02'));
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

  // ---------- 프로그램 탭 ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabCategory li'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.tabContent .panel'));
  function activate(cat) {
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-category') === cat); t.setAttribute('aria-selected', t.getAttribute('data-category') === cat ? 'true' : 'false'); });
    panels.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === cat); });
    updateNav();
  }
  tabs.forEach(function (t) { t.addEventListener('click', function (e) { e.preventDefault(); activate(t.getAttribute('data-category')); }); });
  document.querySelectorAll('a[data-tab]').forEach(function (a) { a.addEventListener('click', function () { activate(a.getAttribute('data-tab')); }); });

  // 카드 스와이퍼 좌우 버튼 (PC)
  var prev = document.querySelector('.swiper-button-prev'), next = document.querySelector('.swiper-button-next');
  function activeSwiper() { var p = document.querySelector('.tabContent .panel.active'); return p ? p.querySelector('.swiper') : null; }
  function updateNav() {
    var s = activeSwiper(); if (!s || !prev) return;
    prev.disabled = s.scrollLeft <= 2;
    next.disabled = s.scrollLeft + s.clientWidth >= s.scrollWidth - 2;
  }
  function step(dir) {
    var s = activeSwiper(); if (!s) return;
    var card = s.querySelector('.card'); var w = card ? card.offsetWidth + 24 : 300;
    s.scrollBy({ left: dir * w, behavior: 'smooth' });
    setTimeout(updateNav, 450);
  }
  if (prev && next) {
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    document.querySelectorAll('.swiper').forEach(function (s) { s.addEventListener('scroll', updateNav, { passive: true }); });
    window.addEventListener('resize', updateNav);
    updateNav();
  }

  // ---------- 스토리 섹션: 스크롤에 따라 가로 트랙 이동 (PC) ----------
  var story = document.getElementById('story'), track = document.getElementById('storyTrack');
  function storyScroll() {
    if (!story || !track) return;
    if (window.innerWidth < 1024 || reduce) { track.style.transform = ''; return; }
    var r = story.getBoundingClientRect();
    var total = story.offsetHeight - window.innerHeight;
    var prog = Math.min(1, Math.max(0, -r.top / total));
    var dist = track.scrollWidth - window.innerWidth;
    track.style.transform = 'translate3d(' + (-prog * dist) + 'px,0,0)';
  }
  window.addEventListener('scroll', storyScroll, { passive: true });
  window.addEventListener('resize', storyScroll);
  storyScroll();

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
