// Живые схемы «как это работает»: производство мебели, в котором идут пять процессов — по вкладке на каждый
// (<div class="lm lm--flow" data-lm="flow|deal|doc|idea|ask"> в src/home.md, gen.py кладёт схему над шагами вкладки).
// Граф и первая схема взяты с antonlozhkin.ru (site/theme/templates/partials/line-live.html); с 13.10 и 16.10 всё ниже
// карты (scene и пять схем) здесь своё — при новом переносе с того сайта эту часть не затирать. map не стоит нигде.
// Без скрипта схем нет.
(function () {
  var boxes = document.querySelectorAll('[data-lm]');
  if (!boxes.length) return;
  var NS = 'http://www.w3.org/2000/svg';
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- производство мебели: две сделки ---------- */
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

  /* Граф: возвращает узлы по id и способы их двигать и подсвечивать. extra — точки и связи, которых нет в общей карте:
     они появляются только в своей схеме (reveal) и гаснут вместе с её кругом (conceal). */
  function graph(host, extra) {
    var nodes = NODES.concat(extra ? extra.nodes : []), links = EDGES.concat(extra ? extra.edges : []);
    var s = svg('svg', { 'class': 'lm__svg', viewBox: '0 ' + TOP + ' ' + W + ' ' + (H - TOP - 28), role: 'img', 'aria-label': 'Карта производства мебели: две сделки, заказчики, счета и документы' });
    var gE = svg('g', {}), gN = svg('g', {});
    s.appendChild(gE); s.appendChild(gN); host.appendChild(s);
    var by = {}, edges = [];
    nodes.forEach(function (n) {
      var g = svg('g', { 'class': 'lm__node lm__node--' + n.k + (n.open ? ' is-open' : ''), tabindex: '0' });
      var r = n.k === 'deal' ? 9 : 6;
      g.appendChild(svg('circle', { r: r }));
      var t = svg('text', { y: r + 15, 'text-anchor': 'middle' }); t.textContent = n.t; g.appendChild(t);
      gN.appendChild(g);
      by[n.id] = { n: n, g: g, text: t, x: n.x, y: n.y, near: [], extra: !!extra && extra.nodes.indexOf(n) >= 0 };
    });
    links.forEach(function (p) {
      var l = svg('line', { 'class': 'lm__edge' + (p[0] === 'a1' || p[1] === 'a1' ? ' lm__edge--gap' : '') });
      gE.appendChild(l); edges.push({ a: by[p[0]], b: by[p[1]], l: l, extra: by[p[0]].extra || by[p[1]].extra });
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
      for (var id in by) by[id].g.classList.toggle('is-hid', by[id].extra);
      edges.forEach(function (e) { e.l.classList.toggle('is-hid', e.extra); e.l.style.cssText = ''; });
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
        later(function () { edges.forEach(function (e) { if (!e.extra && (e.a.n.id === id || e.b.n.id === id) && e.l.classList.contains('is-hid')) grow(e, id, later); }); }, t);
        t += 500;
        later(function () { by[id].near.forEach(function (n) { if (!by[n].extra) by[n].g.classList.remove('is-hid'); }); }, t);
        t += 450;
      });
      later(function () { edges.forEach(function (e) { if (!e.extra && e.l.classList.contains('is-hid')) grow(e, e.a.n.id, later); }); }, t);
      later(function () { showAll(); if (done) done(); }, t + 750);
    }
    /* своя точка схемы появляется, и от неё растут её связи */
    function reveal(id, later) {
      by[id].g.classList.remove('is-hid');
      edges.forEach(function (e) { if ((e.a.n.id === id || e.b.n.id === id) && e.l.classList.contains('is-hid')) { if (still) e.l.classList.remove('is-hid'); else grow(e, id, later); } });
    }
    function conceal() {
      for (var id in by) if (by[id].extra) by[id].g.classList.add('is-hid');
      edges.forEach(function (e) { if (e.extra) { e.l.classList.add('is-hid'); e.l.style.cssText = ''; } });
    }
    draw();
    return { svg: s, by: by, draw: draw, light: light, move: move, build: build, hideAll: hideAll, showAll: showAll, reveal: reveal, conceal: conceal };
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
    side.appendChild(el('div', 'lm__kicker', 'Пример · производство мебели'));
    var cap = el('p', 'lm__cap'); side.appendChild(cap);
    var btn = el('button', 'lm__btn'); btn.type = 'button'; side.appendChild(btn);
    var HINT = 'Две сделки производства мебели: заказчики, счета, документы и кто чем занят. Нажмите на любую точку.';
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


  /* ---------- вкладки «Как это работает»: пять схем в одной раскладке ----------
     Слева — что пришло или что вы сделали, в середине — карта производства, справа — что из этого получилось.
     Одна точка ведёт взгляд. Шаги под схемой стоят неподвижно (Антон, 16.10). Карта вырастает один раз
     на страницу, в первой показанной схеме; остальные открываются с готовой картой — производство то же. */
  var grown = false;
  function scene(box, inKick, outKick, extra) {
    var inc = el('div', 'lm__col'), fig = el('div', 'lm__fig'), out = el('div', 'lm__col');
    box.appendChild(inc); box.appendChild(fig); box.appendChild(out);
    inc.appendChild(el('div', 'lm__kicker', inKick));
    var inbox = el('div', 'lm__inbox'); inc.appendChild(inbox);
    var G = graph(fig, extra);
    out.appendChild(el('div', 'lm__kicker', outKick));
    var dot = el('span', 'lm__fly'); box.appendChild(dot);
    var S = { box: box, inbox: inbox, out: out, G: G, dot: dot, run: 0, timers: [] };
    S.later = function (fn, ms) { var me = S.run; S.timers.push(setTimeout(function () { if (me === S.run) fn(); }, ms)); };
    /* точка в координатах схемы: середина узла, левый край карточки, буллет строки */
    S.at = function (node, how) {
      var b = box.getBoundingClientRect(), r = node.getBoundingClientRect();
      if (how === 'bullet') return [r.left - b.left + 3, r.top - b.top + 11];
      if (how === 'card') return [r.left - b.left, r.top - b.top + r.height / 2];
      if (how === 'end') return [r.right - b.left + 10, r.top - b.top + r.height / 2];
      return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
    };
    S.node = function (id) { return S.at(G.by[id].g.querySelector('circle')); };
    S.fly = function (from, to, ms, done) {
      var me = S.run, t0 = null;
      dot.style.opacity = 1;
      (function f(t) {
        if (me !== S.run) return;
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        dot.style.transform = 'translate(' + (from[0] + (to[0] - from[0]) * e - 5) + 'px,' + (from[1] + (to[1] - from[1]) * e - 5) + 'px)';
        if (k < 1) requestAnimationFrame(f); else done();
      })(performance.now());
    };
    S.hide = function () { dot.style.opacity = 0; };
    /* точка обегает записи по очереди, каждая загорается; at(id) — что сделать, когда точка на ней; done(где точка) */
    S.walk = function (path, from, at, done) {
      var lit = [];
      (function next(k, p) {
        if (k >= path.length) { done(p); return; }
        var to = S.node(path[k]);
        S.fly(p, to, k ? 480 : 750, function () {
          lit.push(path[k]); G.light(lit.slice());
          if (at) at(path[k]);
          S.later(function () { next(k + 1, to); }, 300);
        });
      })(0, from);
    };
    S.card = function (src, who, text) {
      var c = el('div', 'lm__msg');
      c.appendChild(el('span', 'lm__msg-src', src)); c.appendChild(el('b', '', who)); c.appendChild(el('span', '', text));
      inbox.appendChild(c); return c;
    };
    /* текст гаснет, появляется другой */
    S.swap = function (t, text, done) {
      if (still) { t.textContent = text; if (done) done(); return; }
      t.classList.add('is-out');
      S.later(function () { t.textContent = text; t.classList.remove('is-out'); if (done) S.later(done, 350); }, 350);
    };
    /* круг схемы: start(cycle) играет её от пустого состояния reset; в конце схема гаснет и начинается заново */
    S.loop = function (reset, start, final) {
      function stop() { S.run++; S.timers.forEach(clearTimeout); S.timers = []; S.hide(); }
      function cycle() {
        reset(); box.classList.remove('is-fade');
        if (grown) { G.showAll(); S.later(function () { start(again); }, 600); return; }
        grown = true; G.build(S.later, function () { S.later(function () { start(again); }, 500); });
      }
      function again() { box.classList.add('is-fade'); S.later(cycle, 800); }
      reset();
      if (still) { G.showAll(); final(); return; }
      G.hideAll();
      /* схема идёт, когда она на экране и её вкладка выбрана: невыбранные панели лежат под выбранной скрытыми
         (visibility, не display — styles.css, «вкладки одной высоты»), а наблюдатель видимость не замечает, поэтому
         переключение вкладки — свой сигнал. Перезапуск — только когда схема была скрыта и снова видна. */
      var panel = box.closest ? box.closest('.tabs__panel') : null, tabs = panel ? panel.parentNode : null;
      var seen = false, shown = false;
      function check() {
        var on = seen && (!panel || getComputedStyle(panel).visibility === 'visible');
        if (on === shown) return; shown = on; stop(); if (on) cycle();
      }
      whenSeen(box, function (v) { seen = v; check(); });
      if (tabs) tabs.addEventListener('change', check);
    };
    return S;
  }
  /* строки справа: пункты дашборда, поля сделки или документа */
  function row(host, cls, label, value) {
    var r = el('div', cls); r.appendChild(el('span', 'lm__k', label));
    var v = el('span', 'lm__t lm__v', value); r.appendChild(v); host.appendChild(r); return v;
  }

  /* ---------- Сообщение: входящее само попадает в карту и на дашборд ---------- */
  var TODAY = [
    { id: 't1', t: 'Счёт № 17 не оплачен — 84 000 ₽' },
    { id: 't2', t: 'По кафе «Север» нет акта' },
    { id: 't3', t: 'Счёт № 21: срок оплаты завтра' }
  ];
  /* path — записи, которые точка обегает по связям и зажигает по очереди (первая — та, которой касается входящее);
     task — поручение, которое после этого встаёт отдельной строкой на дашборде. */
  var EVENTS = [
    { src: 'Telegram', who: 'Марина', text: 'Север оплатил семнадцатый, пришло 84 000', node: 'i2', path: ['i2', 'd1', 'c1'], done: 't1', kind: 'paid', note: 'Счёт № 17 оплачен' },
    { src: 'Почта', who: 'Фабрика', text: 'Отгрузку для отеля переносим на 16-е', node: 's1', path: ['s1', 'd2', 'p2'], add: 'Отель: отгрузка 16-го, а монтаж назначен на 14-е', task: 'Олегу: перенести монтаж в отеле на 16-е', note: 'Мебель в номера: отгрузка 16 октября' },
    { src: 'Документ', who: 'Акт_кафе_Север.pdf', text: 'подписан обеими сторонами', node: 'a1', path: ['a1', 'd1', 'c1'], done: 't2', kind: 'filled', note: 'Акт по кафе получен' }
  ];
  function initFlow(box) {
    var S = scene(box, 'Что приходит', 'Дашборд'), G = S.G;
    var list = el('ul', 'lm__today'); S.out.appendChild(list);
    function item(text, id) {
      var li = el('li'); if (id) li.setAttribute('data-id', id);
      li.appendChild(el('span', 'lm__t', text)); list.appendChild(li); return li;
    }
    function reset() {
      S.inbox.textContent = ''; list.textContent = '';
      TODAY.forEach(function (t) { item(t.t, t.id); });
      ['i2', 'a1'].forEach(function (id) { G.by[id].g.classList.remove('is-paid', 'is-filled'); });
      G.light(null);
    }
    function mark(E) { if (E.kind) G.by[E.node].g.classList.add('is-' + E.kind); }
    function play(E, done) {
      
      var card = S.card(E.src, E.who, E.text);
      var li = E.done ? list.querySelector('[data-id="' + E.done + '"]') : item(E.add);
      var t = li.querySelector('.lm__t'), was = t.textContent;
      if (E.add) li.className = 'is-wait';
      var task = E.task ? item(E.task) : null;
      if (task) task.className = 'is-wait';
      S.later(function () {
        
        S.walk(E.path, S.at(card, 'card'), null, function (from) {
          mark(E);
          /* от последней записи — к строке дашборда; если из входящего следует поручение, точка ставит и его */
          S.later(function () {
            
            S.fly(from, S.at(li, 'bullet'), 750, function () {
              G.light(null);
              if (E.add) li.className = 'is-new';
              else { li.className = 'is-hit'; S.swap(t, 'Записано: ' + E.note, function () { S.later(function () { li.className = 'is-done'; S.swap(t, was); }, 1500); }); }
              if (!task) { S.hide(); S.later(done, 3200); return; }
              S.later(function () {
                S.fly(S.at(li, 'bullet'), S.at(task, 'bullet'), 450, function () { S.hide(); task.className = 'is-new'; S.later(done, 3200); });
              }, 500);
            });
          }, 500);
        });
      }, 500);
    }
    S.loop(reset, function (again) {
      (function next(k) { if (k >= EVENTS.length) { S.later(again, 2500); return; } play(EVENTS[k], function () { next(k + 1); }); })(0);
    }, function () {
      EVENTS.forEach(function (E) {
        S.card(E.src, E.who, E.text); mark(E);
        if (E.done) list.querySelector('[data-id="' + E.done + '"]').className = 'is-done'; else item(E.add).className = 'is-new';
        if (E.task) item(E.task).className = 'is-new';
      });
    });
  }

  /* ---------- Сделка: каждое пришедшее — своей записью, страница сделки пересчитывается из записей ---------- */
  var DEAL_X = {
    nodes: [{ id: 'x1', k: 'money', x: 452, y: 262, t: 'Платёж' }, { id: 'x2', k: 'doc', x: 512, y: 78, t: 'Накладная' }],
    edges: [['x1', 'i3'], ['x1', 'd2'], ['x2', 'd2'], ['x2', 's1']]
  };
  function initDeal(box) {
    var S = scene(box, 'Что вы переслали', 'Сделка', DEAL_X), G = S.G;
    var page = el('div', 'lm__page'); S.out.appendChild(page);
    page.appendChild(el('b', 'lm__title', 'Мебель в номера'));
    row(page, 'lm__row', 'По договору', '300 000 ₽');
    var paid = row(page, 'lm__row', 'Оплачено', '0 ₽'), ship = row(page, 'lm__row', 'Отгружено', 'ничего');
    row(page, 'lm__row is-miss', 'Маржа', 'не посчитана: нет счёта фабрики');
    S.out.appendChild(el('div', 'lm__kicker lm__kicker--sub', 'Дашборд'));
    var list = el('ul', 'lm__today lm__today--short'); S.out.appendChild(list);
    function reset() {
      S.inbox.textContent = ''; list.textContent = ''; G.conceal(); G.light(null);
      G.by.i3.g.classList.remove('is-paid');
      paid.textContent = '0 ₽'; ship.textContent = 'ничего';
      [paid, ship].forEach(function (v) { v.parentNode.classList.remove('is-hit'); });
    }
    function line(text) { var li = el('li', 'is-new'); li.appendChild(el('span', 'lm__t', text)); list.appendChild(li); return li; }
    /* пришедшее → новая запись на карте → записи, к которым она относится → строка страницы сделки */
    function play(src, who, text, id, path, v, value, done) {
      
      var card = S.card(src, who, text);
      S.later(function () {
        
        S.fly(S.at(card, 'card'), S.node(id), 750, function () {
          G.reveal(id, S.later); G.light([id]);
          S.later(function () {
            S.walk(path, S.node(id), function (n) { if (n === 'i3') G.by.i3.g.classList.add('is-paid'); }, function (from) {
              G.light([id].concat(path));
              S.later(function () {
                
                S.fly(from, S.at(v.parentNode, 'card'), 700, function () {
                  S.hide(); v.parentNode.classList.add('is-hit'); S.swap(v, value, function () { S.later(done, 900); });
                });
              }, 300);
            });
          }, 500);
        });
      }, 500);
    }
    S.loop(reset, function (again) {
      play('Почта', 'Отель «Берег»', 'Платёжное поручение: аванс 150 000 ₽ по счёту № 21', 'x1', ['i3', 'd2'], paid, '150 000 ₽', function () {
        play('Почта', 'Фабрика', 'Накладная: отгружено 2 позиции из 3', 'x2', ['d2'], ship, '2 позиции из 3', function () {
          
          var li = line('Мебель в номера: не отгружена 1 позиция из 3'); li.className = 'is-wait';
          S.fly(S.at(ship.parentNode, 'card'), S.at(li, 'bullet'), 650, function () { S.hide(); G.light(null); li.className = 'is-new'; S.later(again, 4500); });
        });
      });
    }, function () {
      S.card('Почта', 'Отель «Берег»', 'Платёжное поручение: аванс 150 000 ₽ по счёту № 21');
      S.card('Почта', 'Фабрика', 'Накладная: отгружено 2 позиции из 3');
      G.reveal('x1'); G.reveal('x2'); G.by.i3.g.classList.add('is-paid');
      paid.textContent = '150 000 ₽'; ship.textContent = '2 позиции из 3';
      line('Мебель в номера: не отгружена 1 позиция из 3');
    });
  }

  /* ---------- Документ: шаблон и записи → проверка полей → файл; чего нет — называет и ждёт ---------- */
  var DOC_FIELDS = [['work', 'Работы', 'd1', 'монтаж кухни, 3 октября'], ['sum', 'Сумма', 'i2', '204 000 ₽ по счетам № 14 и 17'],
                    ['base', 'Основание', 'k1', 'договор от 5 сентября'], ['who', 'Заказчик', 'c1', 'кафе «Север»'], ['kpp', 'КПП заказчика', null, '']];
  function initDoc(box) {
    var S = scene(box, 'Что вы попросили', 'Документ'), G = S.G;
    var page = el('div', 'lm__page'); S.out.appendChild(page);
    page.appendChild(el('b', 'lm__title', 'Акт к договору с кафе'));
    var f = {}; DOC_FIELDS.forEach(function (d) { f[d[0]] = row(page, 'lm__row', d[1], '…'); });
    var file = el('div', 'lm__file'); S.out.appendChild(file);
    function reset() {
      S.inbox.textContent = ''; G.light(null); G.by.a1.g.classList.remove('is-filled');
      DOC_FIELDS.forEach(function (d) { f[d[0]].textContent = '…'; f[d[0]].parentNode.className = 'lm__row'; });
      file.textContent = ''; file.classList.remove('is-in');
    }
    function fill(n) {
      DOC_FIELDS.forEach(function (d) { if (d[2] === n) { f[d[0]].parentNode.className = 'lm__row is-hit'; S.swap(f[d[0]], d[3]); } });
    }
    function done() {
      file.textContent = 'Акт_кафе_Север.pdf — готов к отправке'; file.classList.add('is-in');
      G.by.a1.g.classList.add('is-filled');
    }
    S.loop(reset, function (again) {
      
      var card = S.card('Вы', 'Акт для кафе «Север»', 'по сделке «Кухня для кафе»');
      S.later(function () {
        
        /* от пустого места «Акт» — по записям, из которых берутся поля */
        S.walk(['a1', 'd1', 'i1', 'i2', 'k1', 'c1'], S.at(card, 'card'), fill, function (from) {
          S.later(function () {
            
            var kpp = f.kpp.parentNode;
            S.fly(from, S.at(kpp, 'card'), 650, function () {
              S.hide(); kpp.className = 'lm__row is-miss'; S.swap(f.kpp, 'нет в записи о кафе — спросите');
              S.later(function () {
                var reply = S.card('Telegram', 'Марина', 'КПП кафе: 780101001');
                S.later(function () {
                  S.walk(['c1'], S.at(reply, 'card'), null, function (p) {
                    S.fly(p, S.at(kpp, 'card'), 650, function () {
                      kpp.className = 'lm__row is-hit'; S.swap(f.kpp, '780101001', function () {
                        
                        S.fly(S.at(kpp, 'card'), S.at(file, 'card'), 500, function () { S.hide(); G.light(null); done(); S.later(again, 4500); });
                      });
                    });
                  });
                }, 600);
              }, 1600);
            });
          }, 400);
        });
      }, 500);
    }, function () {
      S.card('Вы', 'Акт для кафе «Север»', 'по сделке «Кухня для кафе»');
      S.card('Telegram', 'Марина', 'КПП кафе: 780101001');
      DOC_FIELDS.forEach(function (d) { f[d[0]].textContent = d[3] || '780101001'; });
      done();
    });
  }

  /* ---------- Идея: мысль → доводы с датой и автором, из записей и от людей → предположение со сроком ---------- */
  var IDEA_X = { nodes: [{ id: 'x3', k: 'idea', x: 40, y: 206, t: 'Предоплата 50%' }], edges: [['x3', 'i2'], ['x3', 'c1']] };
  function initIdea(box) {
    var S = scene(box, 'Что вы записали', 'Идея', IDEA_X), G = S.G;
    var page = el('div', 'lm__page'); S.out.appendChild(page);
    var status = el('span', 'lm__t lm__status', ''); page.appendChild(status);
    var title = el('b', 'lm__title', ''); page.appendChild(title);
    var args = el('div', 'lm__args'); page.appendChild(args);
    var test = el('div', 'lm__test'); page.appendChild(test);
    function reset() {
      S.inbox.textContent = ''; G.conceal(); G.light(null);
      status.textContent = ''; title.textContent = ''; args.textContent = ''; test.textContent = ''; page.classList.remove('is-test');
    }
    function arg(side, meta, text) {
      var a = el('div', 'lm__arg lm__arg--' + (side === 'за' ? 'pro' : 'con'));
      a.appendChild(el('span', 'lm__k', side + ' · ' + meta)); a.appendChild(el('span', '', text)); args.appendChild(a); return a;
    }
    function hypothesis() {
      page.classList.add('is-test');
      row(test, 'lm__row', 'Срок', '1 декабря');
      row(test, 'lm__row', 'Неверно, если', 'двое из трёх новых заказчиков откажутся из-за предоплаты');
    }
    var PRO = ['13.10 · по записям', 'Счёт № 17 не оплачен, хотя монтаж сдан 3 октября'];
    var CON = ['14.10 · Марина', 'Кафе «Север» платит только после работ — с предоплатой бы не пошло'];
    S.loop(reset, function (again) {
      
      var card = S.card('Вы', 'Мысль', 'Брать 50% предоплаты за монтаж');
      S.later(function () {
        S.fly(S.at(card, 'card'), S.node('x3'), 750, function () {
          G.reveal('x3', S.later); G.light(['x3']);
          status.textContent = 'идея'; title.textContent = 'Брать 50% предоплаты за монтаж';
          S.later(function () {
            
            /* довод из записей: система сама находит, что относится к мысли */
            S.walk(['i2'], S.node('x3'), null, function (p) {
              S.fly(p, S.at(args, 'card'), 650, function () {
                S.hide(); arg('за', PRO[0], PRO[1]);
                S.later(function () {
                  var reply = S.card('Telegram', 'Марина', 'Север бы не пошёл: они платят только после работ');
                  S.later(function () {
                    S.walk(['c1', 'x3'], S.at(reply, 'card'), null, function (p2) {
                      S.fly(p2, S.at(args, 'card'), 650, function () {
                        S.hide(); arg('против', CON[0], CON[1]);
                        S.later(function () {
                          G.light(['x3', 'i2', 'c1']);
                          S.swap(status, 'предположение', hypothesis);
                          S.later(function () { G.light(null); again(); }, 6000);
                        }, 1800);
                      });
                    });
                  }, 600);
                }, 1500);
              });
            });
          }, 900);
        });
      }, 500);
    }, function () {
      S.card('Вы', 'Мысль', 'Брать 50% предоплаты за монтаж');
      S.card('Telegram', 'Марина', 'Север бы не пошёл: они платят только после работ');
      G.reveal('x3');
      status.textContent = 'предположение'; title.textContent = 'Брать 50% предоплаты за монтаж';
      arg('за', PRO[0], PRO[1]); arg('против', CON[0], CON[1]); hypothesis();
    });
  }

  /* ---------- Вопрос: обычными словами → поиск по записям → ответ со ссылками ---------- */
  var QUESTIONS = [
    { q: 'Кто нам должен?', path: ['i2', 'd1', 'c1', 'i3', 'd2', 'c2'],
      a: 'Кафе «Север» — 84 000 ₽ по счёту № 17, выставлен 3 октября. Отель «Берег» — аванс 150 000 ₽ по счёту № 21, срок 13 октября.' },
    { q: 'Чего не хватает по кафе?', path: ['c1', 'd1', 'a1', 'i2'],
      a: 'Акта: монтаж закончен 3 октября, а документа нет. И оплаты по счёту № 17.' },
    { q: 'Олег свободен с 14-го?', path: ['p2', 'd2', 'k2', 'c2'],
      a: 'Нет: с 14 октября он на монтаже в отеле «Берег» — так записано в сделке «Мебель в номера».' }
  ];
  function initAsk(box) {
    var S = scene(box, 'Вы спрашиваете', 'Ответ'), G = S.G;
    S.inbox.classList.add('lm__qs');
    var ans = el('p', 'lm__ans'), refs = el('div', 'lm__refs'); S.out.appendChild(ans); S.out.appendChild(refs);
    var btns = [], loop = null;
    function clear() { ans.textContent = ''; ans.classList.remove('is-in'); refs.textContent = ''; G.light(null); }
    function answer(Q) {
      ans.textContent = Q.a; ans.classList.add('is-in');
      refs.appendChild(el('span', 'lm__refs-t', 'по записям:'));
      Q.path.forEach(function (id) { refs.appendChild(el('span', 'lm__ref', G.by[id].n.t)); });
    }
    /* вопрос → точка от него по записям пути → к ответу; потом следующий вопрос, по кругу */
    function ask(i) {
      var Q = QUESTIONS[i];
      btns.forEach(function (b, j) { b.classList.toggle('is-on', j === i); });
      clear(); 
      S.later(function () {
        
        S.walk(Q.path, S.at(btns[i], 'end'), null, function (from) {
          S.fly(from, S.at(ans, 'card'), 650, function () {
            S.hide(); answer(Q);
            S.later(function () { if (i + 1 < QUESTIONS.length) ask(i + 1); else loop(); }, 6500);
          });
        });
      }, 400);
    }
    QUESTIONS.forEach(function (Q, i) {
      var b = el('button', 'lm__q', Q.q); b.type = 'button'; S.inbox.appendChild(b); btns.push(b);
      b.addEventListener('click', function () {
        if (still) { btns.forEach(function (x, j) { x.classList.toggle('is-on', j === i); }); clear(); G.light(Q.path); answer(Q); return; }
        S.run++; S.timers.forEach(clearTimeout); S.timers = []; S.hide(); G.showAll(); ask(i);
      });
    });
    S.loop(function () { clear(); btns.forEach(function (b) { b.classList.remove('is-on'); }); }, function (again) {
      loop = again; ask(0);
    }, function () { btns[0].classList.add('is-on'); G.light(QUESTIONS[0].path); answer(QUESTIONS[0]); });
  }

  var INIT = { map: initMap, flow: initFlow, deal: initDeal, doc: initDoc, idea: initIdea, ask: initAsk };
  Array.prototype.forEach.call(boxes, function (b) { var f = INIT[b.getAttribute('data-lm')]; if (f) f(b); });
})();
