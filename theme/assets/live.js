// Живая схема «как это работает»: выдуманная мастерская, в которую приходит сообщение, письмо и документ.
// Взят с antonlozhkin.ru (site/theme/templates/partials/line-live.html). С 13.10 третья схема здесь своя: точка обегает
// записи по связям и ставит поручение (EVENTS и play) — при новом переносе с того сайта эту часть не затирать.
// Из трёх её состояний здесь стоит одно: <div class="lm lm--flow" data-lm="flow"> в src/home.md. Без скрипта схемы нет.
(function () {
  var boxes = document.querySelectorAll('[data-lm]');
  if (!boxes.length) return;
  var NS = 'http://www.w3.org/2000/svg';
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- выдуманная мастерская: две сделки ---------- */
  var W = 720, H = 380, TOP = 30;   /* поле 720×380; над верхней точкой и под нижней подписью пусто — рамка графа их срезает */
  var NODES = [
    { id: 'c1', k: 'person', x: 90,  y: 62,  t: 'Кафе «Север»',     d: 'Кафе «Север» — заказчик. Одна сделка, два счёта, второй не оплачен.' },
    { id: 'p1', k: 'person', x: 340, y: 44,  t: 'Марина',           d: 'Марина — менеджер, ведёт обе сделки.' },
    { id: 's1', k: 'person', x: 612, y: 62,  t: 'Фабрика',          d: 'Фабрика — поставщик для обеих сделок.' },
    { id: 'k1', k: 'doc',    x: 104, y: 176, t: 'Договор',          d: 'Договор с кафе — подписан 5 сентября.' },
    { id: 'd1', k: 'deal',   x: 250, y: 132, t: 'Кухня для кафе',   d: 'Кухня для кафе — монтаж закончен 3 октября. Второй счёт не оплачен, акта нет.' },
    { id: 'd2', k: 'deal',   x: 486, y: 152, t: 'Мебель в номера',  d: 'Мебель в номера — замер сделан, монтаж с 14 октября.' },
    { id: 'k2', k: 'doc',    x: 640, y: 178, t: 'Договор',          d: 'Договор с отелем — подписан 1 октября.' },
    { id: 'i1', k: 'money',  x: 70,  y: 286, t: 'Счёт № 14',        d: 'Счёт № 14 — 120 000 ₽, оплачен 12 сентября.' },
    { id: 'i2', k: 'money',  x: 196, y: 262, t: 'Счёт № 17',        d: 'Счёт № 17 — 84 000 ₽, выставлен 3 октября, не оплачен.', open: true },
    { id: 'a1', k: 'gap',    x: 318, y: 232, t: 'Акт',              d: 'Акт — пустое место: работа сдана, а документа нет. На карте такие места видно.' },
    { id: 'p2', k: 'person', x: 392, y: 322, t: 'Олег',             d: 'Олег — монтаж. С 14 октября занят в отеле.' },
    { id: 'i3', k: 'money',  x: 540, y: 282, t: 'Счёт № 21',        d: 'Счёт № 21 — аванс 150 000 ₽, срок оплаты 13 октября.', open: true },
    { id: 'c2', k: 'person', x: 650, y: 300, t: 'Отель «Берег»',    d: 'Отель «Берег» — заказчик. Сделка в работе.' }
  ];
  var EDGES = [['c1','d1'],['p1','d1'],['p1','d2'],['s1','d1'],['s1','d2'],['k1','d1'],['k1','c1'],['d1','i1'],['d1','i2'],
               ['d1','a1'],['p2','d1'],['p2','d2'],['d2','i3'],['d2','c2'],['k2','d2'],['k2','c2']];
  var KINDS = [['deal', 'сделка'], ['person', 'люди'], ['money', 'деньги'], ['doc', 'документ'], ['gap', 'чего не хватает']];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); for (var a in attrs) e.setAttribute(a, attrs[a]); return e; }
  function whenSeen(node, fn) {
    if (!('IntersectionObserver' in window)) { fn(true); return; }
    new IntersectionObserver(function (es) { es.forEach(function (e) { fn(e.isIntersecting); }); }, { threshold: 0.35 }).observe(node);
  }

  /* Граф: возвращает узлы по id и способы их двигать и подсвечивать. */
  function graph(host) {
    var s = svg('svg', { 'class': 'lm__svg', viewBox: '0 ' + TOP + ' ' + W + ' ' + (H - TOP - 28), role: 'img', 'aria-label': 'Карта выдуманной мастерской: две сделки, заказчики, счета и документы' });
    var gE = svg('g', {}), gN = svg('g', {});
    s.appendChild(gE); s.appendChild(gN); host.appendChild(s);
    var by = {}, edges = [];
    NODES.forEach(function (n) {
      var g = svg('g', { 'class': 'lm__node lm__node--' + n.k + (n.open ? ' is-open' : ''), tabindex: '0' });
      var r = n.k === 'deal' ? 9 : 6;
      g.appendChild(svg('circle', { r: r }));
      var t = svg('text', { y: r + 15, 'text-anchor': 'middle' }); t.textContent = n.t; g.appendChild(t);
      gN.appendChild(g);
      by[n.id] = { n: n, g: g, text: t, x: n.x, y: n.y, near: [] };
    });
    EDGES.forEach(function (p) {
      var l = svg('line', { 'class': 'lm__edge' + (p[0] === 'a1' || p[1] === 'a1' ? ' lm__edge--gap' : '') });
      gE.appendChild(l); edges.push({ a: by[p[0]], b: by[p[1]], l: l });
      by[p[0]].near.push(p[1]); by[p[1]].near.push(p[0]);
    });
    function draw() {
      for (var id in by) by[id].g.setAttribute('transform', 'translate(' + by[id].x.toFixed(1) + ' ' + by[id].y.toFixed(1) + ')');
      edges.forEach(function (e) { e.l.setAttribute('x1', e.a.x); e.l.setAttribute('y1', e.a.y); e.l.setAttribute('x2', e.b.x); e.l.setAttribute('y2', e.b.y); });
    }
    function light(ids) {
      for (var id in by) { by[id].g.classList.toggle('is-on', !!ids && ids.indexOf(id) >= 0); by[id].g.classList.toggle('is-dim', !!ids && ids.indexOf(id) < 0); }
      edges.forEach(function (e) { e.l.classList.toggle('is-on', !!ids && ids.indexOf(e.a.n.id) >= 0 && ids.indexOf(e.b.n.id) >= 0); });
    }
    /* плавный переезд всех узлов к целям {id: [x, y]} */
    function move(to, ms, done) {
      var from = {}, t0 = null; for (var id in by) from[id] = [by[id].x, by[id].y];
      if (still || !ms) { for (var i in to) { by[i].x = to[i][0]; by[i].y = to[i][1]; } draw(); if (done) done(); return; }
      function step(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / ms); k = 1 - Math.pow(1 - k, 3);
        for (var id in to) { by[id].x = from[id][0] + (to[id][0] - from[id][0]) * k; by[id].y = from[id][1] + (to[id][1] - from[id][1]) * k; }
        draw();
        if (k < 1) requestAnimationFrame(step); else if (done) done();
      }
      requestAnimationFrame(step);
    }
    /* Постепенное появление: сделки по очереди, от каждой растут связи, на их концах появляются остальные точки,
       последними — связи между ними. later — отменяемый таймер схемы. Узлы должны стоять на своих местах. */
    function hideAll() {
      for (var id in by) by[id].g.classList.add('is-hid');
      edges.forEach(function (e) { e.l.classList.add('is-hid'); e.l.style.cssText = ''; });
    }
    function showAll() {
      for (var id in by) by[id].g.classList.remove('is-hid');
      edges.forEach(function (e) { e.l.classList.remove('is-hid'); e.l.style.cssText = ''; });
    }
    function grow(e, fromId, later) {
      var L = Math.sqrt(Math.pow(e.a.x - e.b.x, 2) + Math.pow(e.a.y - e.b.y, 2)), l = e.l;
      l.style.transition = 'none'; l.style.strokeDasharray = L; l.style.strokeDashoffset = e.a.n.id === fromId ? L : -L;
      l.classList.remove('is-hid'); l.getBoundingClientRect();
      l.style.transition = 'stroke-dashoffset 0.55s ease'; l.style.strokeDashoffset = 0;
      later(function () { l.style.cssText = ''; }, 650);
    }
    function build(later, done) {
      var mains = NODES.filter(function (n) { return n.k === 'deal'; }).map(function (n) { return n.id; }), t = 0;
      hideAll();
      mains.forEach(function (id) { later(function () { by[id].g.classList.remove('is-hid'); }, t); t += 450; });
      mains.forEach(function (id) {
        later(function () { edges.forEach(function (e) { if ((e.a.n.id === id || e.b.n.id === id) && e.l.classList.contains('is-hid')) grow(e, id, later); }); }, t);
        t += 500;
        later(function () { by[id].near.forEach(function (n) { by[n].g.classList.remove('is-hid'); }); }, t);
        t += 450;
      });
      later(function () { edges.forEach(function (e) { if (e.l.classList.contains('is-hid')) grow(e, e.a.n.id, later); }); }, t);
      later(function () { showAll(); if (done) done(); }, t + 750);
    }
    draw();
    return { svg: s, by: by, draw: draw, light: light, move: move, build: build, hideAll: hideAll, showAll: showAll };
  }
  function home() { var o = {}; NODES.forEach(function (n) { o[n.id] = [n.x, n.y]; }); return o; }
  function legend(host) {
    var l = el('div', 'lm__legend');
    KINDS.forEach(function (k) { var i = el('span', 'lm__key lm__key--' + k[0]); l.appendChild(i); l.appendChild(el('span', '', k[1])); });
    host.appendChild(l);
  }

  /* ---------- 1. карта: куча раскладывается, точку можно нажать ---------- */
  function initMap(box) {
    var fig = el('div', 'lm__fig'), side = el('div', 'lm__side');
    box.appendChild(fig); box.appendChild(side);
    var G = graph(fig); legend(fig);
    side.appendChild(el('div', 'lm__kicker', 'Пример · выдуманная мастерская'));
    var cap = el('p', 'lm__cap'); side.appendChild(cap);
    var btn = el('button', 'lm__btn'); btn.type = 'button'; side.appendChild(btn);
    var HINT = 'Две сделки одной мастерской: заказчики, счета, документы и кто чем занят. Нажмите на любую точку.';
    var HEAP = 'Так это лежит в голове и в чатах: всё есть, но связей не видно.';
    var laid = true;
    function heap() { var o = {}; NODES.forEach(function (n, i) { var a = i * 2.4, r = 26 + (i * 37 % 70); o[n.id] = [W / 2 + Math.cos(a) * r * 1.5, H / 2 + Math.sin(a) * r * 0.8]; }); return o; }
    function set(on, ms) {
      laid = on; box.classList.toggle('is-heap', !on); G.light(null);
      cap.textContent = on ? HINT : HEAP; btn.textContent = on ? 'Смешать обратно' : 'Разложить в карту';
      G.move(on ? home() : heap(), ms);
    }
    btn.addEventListener('click', function () { set(!laid, 900); });
    NODES.forEach(function (n) {
      var b = G.by[n.id];
      function pick() { if (!laid) return; G.light([n.id].concat(b.near)); cap.textContent = n.d; }
      b.g.addEventListener('click', pick); b.g.addEventListener('mouseenter', pick); b.g.addEventListener('focus', pick);
    });
    G.svg.addEventListener('mouseleave', function () { if (laid) { G.light(null); cap.textContent = HINT; } });
    if (still) { set(true, 0); return; }
    set(false, 0);
    var played = false;
    whenSeen(box, function (seen) { if (seen && !played) { played = true; setTimeout(function () { set(true, 1300); }, 700); } });
  }

  /* ---------- 2. вопрос к карте ---------- */
  var QUESTIONS = [
    { q: 'Кто нам должен?', path: ['i2', 'd1', 'c1', 'i3', 'd2', 'c2'],
      a: 'Кафе «Север» — 84 000 ₽ по счёту № 17, выставлен 3 октября. Отель «Берег» — аванс 150 000 ₽ по счёту № 21, срок 13 октября.' },
    { q: 'Чего не хватает по кафе?', path: ['c1', 'd1', 'a1', 'i2'],
      a: 'Акта: монтаж закончен 3 октября, а документа нет. И оплаты по счёту № 17.' },
    { q: 'Олег свободен с 14-го?', path: ['p2', 'd2', 'k2', 'c2'],
      a: 'Нет: с 14 октября он на монтаже в отеле «Берег» — так записано в сделке «Мебель в номера».' }
  ];
  function initAsk(box) {
    var fig = el('div', 'lm__fig'), side = el('div', 'lm__side');
    box.appendChild(fig); box.appendChild(side);
    var G = graph(fig);
    side.appendChild(el('div', 'lm__kicker', 'Пример · спросите у карты'));
    var qs = el('div', 'lm__qs'); side.appendChild(qs);
    var ans = el('p', 'lm__ans'), refs = el('div', 'lm__refs'); side.appendChild(ans); side.appendChild(refs);
    var run = 0, btns = [];
    /* одна точка ведёт взгляд: от нажатого вопроса — в граф, по записям пути, от последней — к ответу */
    var dot = el('span', 'lm__fly'); box.appendChild(dot);
    function at(node, how) {
      var b = box.getBoundingClientRect(), r = node.getBoundingClientRect();
      if (how === 'start') return [r.left - b.left - 2, r.top - b.top + 12];
      if (how === 'end') return [r.right - b.left + 10, r.top - b.top + r.height / 2];
      return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
    }
    function fly(me, from, to, ms, done) {
      var t0 = null;
      dot.style.opacity = 1;
      (function f(t) {
        if (me !== run) return;
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        dot.style.transform = 'translate(' + (from[0] + (to[0] - from[0]) * e - 5) + 'px,' + (from[1] + (to[1] - from[1]) * e - 5) + 'px)';
        if (k < 1) requestAnimationFrame(f); else done();
      })(performance.now());
    }
    function ask(i) {
      var Q = QUESTIONS[i], me = ++run, lit = [];
      btns.forEach(function (b, j) { b.classList.toggle('is-on', j === i); });
      ans.textContent = ''; ans.classList.remove('is-in'); refs.textContent = ''; G.light([]); dot.style.opacity = 0;
      function finish() {
        ans.textContent = Q.a; ans.classList.add('is-in');
        refs.appendChild(el('span', 'lm__refs-t', 'по записям:'));
        Q.path.forEach(function (id) { refs.appendChild(el('span', 'lm__ref', G.by[id].n.t)); });
      }
      if (still) { G.light(Q.path); finish(); return; }
      function circle(id) { return G.by[id].g.querySelector('circle'); }
      (function next(k, from) {
        if (me !== run) return;
        if (k >= Q.path.length) {
          fly(me, from, at(ans, 'start'), 650, function () { dot.style.opacity = 0; finish(); });
          return;
        }
        var to = at(circle(Q.path[k]));
        fly(me, from, to, k ? 380 : 700, function () {
          lit.push(Q.path[k]); G.light(lit.slice());
          setTimeout(function () { next(k + 1, to); }, 160);
        });
      })(0, at(btns[i], 'end'));
    }
    QUESTIONS.forEach(function (Q, i) {
      var b = el('button', 'lm__q', Q.q); b.type = 'button'; b.addEventListener('click', function () { ask(i); }); qs.appendChild(b); btns.push(b);
    });
    var played = false;
    whenSeen(box, function (seen) { if (seen && !played) { played = true; ask(0); } });
  }

  /* ---------- 3. входящее само попадает в карту и на страницу «Сегодня» ---------- */
  var TODAY = [
    { id: 't1', t: 'Счёт № 17 не оплачен — 84 000 ₽' },
    { id: 't2', t: 'По кафе «Север» нет акта' },
    { id: 't3', t: 'Счёт № 21: срок оплаты завтра' }
  ];
  /* path — записи, которые точка обегает по связям и зажигает по очереди (первая — та, которой касается входящее);
     task — поручение, которое после этого встаёт отдельной строкой в «Сегодня». */
  var EVENTS = [
    { src: 'Telegram', who: 'Марина', text: 'Север оплатил семнадцатый, пришло 84 000', node: 'i2', path: ['i2', 'd1', 'c1'], done: 't1', kind: 'paid', note: 'Счёт № 17 оплачен' },
    { src: 'Почта', who: 'Фабрика', text: 'Отгрузку для отеля переносим на 16-е', node: 's1', path: ['s1', 'd2', 'p2'], add: 'Отель: отгрузка 16-го, а монтаж назначен на 14-е', task: 'Олегу: перенести монтаж в отеле на 16-е', note: 'Мебель в номера: отгрузка 16 октября' },
    { src: 'Документ', who: 'Акт_кафе_Север.pdf', text: 'подписан обеими сторонами', node: 'a1', path: ['a1', 'd1', 'c1'], done: 't2', kind: 'filled', note: 'Акт по кафе получен' }
  ];
  function initFlow(box) {
    var inc = el('div', 'lm__col'), fig = el('div', 'lm__fig'), out = el('div', 'lm__col');
    box.appendChild(inc); box.appendChild(fig); box.appendChild(out);
    inc.appendChild(el('div', 'lm__kicker', 'Что приходит'));
    var inbox = el('div', 'lm__inbox'); inc.appendChild(inbox);
    var G = graph(fig);
    out.appendChild(el('div', 'lm__kicker', 'Сегодня'));
    var list = el('ul', 'lm__today'); out.appendChild(list);
    /* одна точка на всю схему: от пришедшего — к записи на карте, от неё — к строке «Сегодня». Глаз ведут по одному пути. */
    var dot = el('span', 'lm__fly'); box.appendChild(dot);
    var timers = [], run = 0, step = 0;
    function later(fn, ms) { var me = run; timers.push(setTimeout(function () { if (me === run) fn(); }, ms)); }
    function item(text, id) {
      var li = el('li'); if (id) li.setAttribute('data-id', id);
      li.appendChild(el('span', 'lm__t', text)); list.appendChild(li); return li;
    }
    function reset() {
      inbox.textContent = ''; list.textContent = ''; dot.style.opacity = 0;
      TODAY.forEach(function (t) { item(t.t, t.id); });
      ['i2', 'a1'].forEach(function (id) { G.by[id].g.classList.remove('is-paid', 'is-filled'); });
      G.light(null);
    }
    /* точка в координатах схемы: середина узла, левый край карточки, буллет строки */
    function at(node, how) {
      var b = box.getBoundingClientRect(), r = node.getBoundingClientRect();
      if (how === 'bullet') return [r.left - b.left + 3, r.top - b.top + 11];
      if (how === 'card') return [r.left - b.left, r.top - b.top + r.height / 2];
      return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
    }
    function fly(from, to, ms, done) {
      var me = run, t0 = null;
      dot.style.opacity = 1;
      (function f(t) {
        if (me !== run) return;
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        dot.style.transform = 'translate(' + (from[0] + (to[0] - from[0]) * e - 5) + 'px,' + (from[1] + (to[1] - from[1]) * e - 5) + 'px)';
        if (k < 1) requestAnimationFrame(f); else done();
      })(performance.now());
    }
    /* текст строки гаснет, появляется другой: swap(строка, текст, класс строки, что дальше) */
    function swap(li, text, cls, done) {
      var t = li.querySelector('.lm__t');
      t.classList.add('is-out');
      later(function () { t.textContent = text; li.className = cls; t.classList.remove('is-out'); if (done) later(done, 350); }, 350);
    }
    function mark(E) { var b = G.by[E.node]; if (E.kind) b.g.classList.add('is-' + E.kind); }
    function play(E) {
      var card = el('div', 'lm__msg');
      card.appendChild(el('span', 'lm__msg-src', E.src)); card.appendChild(el('b', '', E.who)); card.appendChild(el('span', '', E.text));
      inbox.appendChild(card);
      var path = E.path || [E.node], lit = [];
      function circle(id) { return G.by[id].g.querySelector('circle'); }
      var li = E.done ? list.querySelector('[data-id="' + E.done + '"]') : item(E.add);
      var was = li.querySelector('.lm__t').textContent;
      if (E.add) li.className = 'is-wait';
      var task = E.task ? item(E.task) : null;
      if (task) task.className = 'is-wait';
      /* от последней записи — к строке «Сегодня»; если из входящего следует поручение, точка ставит и его */
      function finish(from) {
        fly(from, at(li, 'bullet'), 750, function () {
          G.light(null);
          if (E.add) li.className = 'is-new';
          else swap(li, 'Записано: ' + E.note, 'is-hit', function () { later(function () { swap(li, was, 'is-done'); }, 1500); });
          if (!task) { dot.style.opacity = 0; return; }
          later(function () {
            fly(at(li, 'bullet'), at(task, 'bullet'), 450, function () { dot.style.opacity = 0; task.className = 'is-new'; });
          }, 500);
        });
      }
      /* точка идёт от пришедшего к первой записи и дальше по связям: каждая запись и связь к ней загораются */
      later(function () {
        (function next(k, from) {
          if (k >= path.length) { later(function () { finish(from); }, 350); return; }
          var to = at(circle(path[k]));
          fly(from, to, k ? 480 : 750, function () {
            lit.push(path[k]); G.light(lit.slice());
            if (path[k] === E.node) mark(E);
            later(function () { next(k + 1, to); }, 300);
          });
        })(0, at(card, 'card'));
      }, 500);
    }
    function tick() {
      if (step >= EVENTS.length) { box.classList.add('is-fade'); later(cycle, 800); return; }
      play(EVENTS[step]); step++;
      later(tick, step >= EVENTS.length ? 9500 : 7000);
    }
    /* круг: граф вырастает, проходят три события, всё гаснет */
    function cycle() { step = 0; reset(); box.classList.remove('is-fade'); G.build(later, function () { later(tick, 500); }); }
    reset();
    if (!still) G.hideAll();
    if (still) {
      EVENTS.forEach(function (E) {
        var card = el('div', 'lm__msg');
        card.appendChild(el('span', 'lm__msg-src', E.src)); card.appendChild(el('b', '', E.who)); card.appendChild(el('span', '', E.text));
        inbox.appendChild(card); mark(E);
        if (E.done) list.querySelector('[data-id="' + E.done + '"]').className = 'is-done'; else item(E.add).className = 'is-new';
        if (E.task) item(E.task).className = 'is-new';
      });
      return;
    }
    whenSeen(box, function (on) {
      run++; timers.forEach(clearTimeout); timers = [];
      if (on) cycle();
    });
  }

  var INIT = { map: initMap, ask: initAsk, flow: initFlow };
  Array.prototype.forEach.call(boxes, function (b) { var f = INIT[b.getAttribute('data-lm')]; if (f) f(b); });
})();
