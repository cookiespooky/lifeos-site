(function () {
  var modal = document.querySelector('[data-search-modal]');
  var openBtn = document.querySelector('[data-search-open]');
  var closeBtns = document.querySelectorAll('[data-search-close]');
  var input = document.querySelector('[data-search-input]');
  var results = document.querySelector('[data-search-results]');

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    if (input) input.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (openBtn) {
    openBtn.addEventListener('click', openModal);
  }
  closeBtns.forEach(function (btn) {
    btn.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  function renderItems(items) {
    if (!results) return;
    if (!items || items.length === 0) {
      results.innerHTML = '<p class="muted">Ничего не найдено.</p>';
      return;
    }
    var html = '<ul>';
    items.forEach(function (item) {
      html += '<li><a href="' + item.path + '">' + item.title + '</a>';
      if (item.snippet) html += '<p class="muted">' + item.snippet + '</p>';
      html += '</li>';
    });
    html += '</ul>';
    results.innerHTML = html;
  }

  function fetchStaticIndex(query) {
    return fetch('/search.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var q = query.toLowerCase();
        var items = (data.items || []).filter(function (item) {
          return (item.title || '').toLowerCase().includes(q) ||
            (item.snippet || '').toLowerCase().includes(q);
        }).slice(0, 10);
        renderItems(items);
      });
  }

  function fetchServer(query) {
    return fetch('/v1/search?q=' + encodeURIComponent(query))
      .then(function (res) { return res.json(); })
      .then(function (data) { renderItems(data.items || []); });
  }

  function wireSearchInput() {
    if (!input) return;
    var timeout;
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (q.length < 2) {
        renderItems([]);
        return;
      }
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        if (window.__notepubSearchMode === 'static') {
          fetchStaticIndex(q);
        } else {
          fetchServer(q);
        }
      }, 200);
    });
  }

  wireSearchInput();
})();

// Граф частей. Фильтр под графом («для чего») и наведение на точку подсвечивают связанное и пишут ниже, что это.
// Нажатие на точку закрепляет её описание под фильтром и добавляет ссылку «Подробнее» — на полное описание ниже.
// Без скрипта граф остаётся картинкой, а точки — ссылками на страницы.
(function () {
  var graph = document.querySelector('[data-graph]');
  if (!graph) return;
  var svg = graph.querySelector('svg');
  var caption = graph.querySelector('[data-graph-caption]');
  var kind = graph.querySelector('[data-graph-kind]');
  var result = graph.querySelector('[data-graph-result]');
  var parts = graph.querySelectorAll('.graph__part');
  var groups = graph.querySelectorAll('.graph__group');
  var edges = graph.querySelectorAll('.graph__edge');
  var chips = graph.querySelectorAll('[data-use]');
  var pinned = null, open = null;

  function el(tag, text) { var n = document.createElement(tag); n.textContent = text; return n; }

  function say(label, title, text, list, more) {
    kind.textContent = label || kind.getAttribute('data-default');
    caption.textContent = '';
    result.textContent = '';
    if (!title) { caption.textContent = caption.getAttribute('data-default'); return; }
    caption.appendChild(el('strong', title));
    if (text) caption.appendChild(document.createTextNode(text));
    if (more) { var a = el('a', 'Подробнее ↓'); a.href = more; caption.appendChild(document.createElement('br')); caption.appendChild(a); }
    (list || []).forEach(function (p) {
      var li = document.createElement('li'), a = el('a', p.getAttribute('data-title'));
      a.href = p.getAttribute('href');
      li.appendChild(a);
      result.appendChild(li);
    });
  }

  function show(match) {
    var on = {}, onGroups = {}, list = [];
    parts.forEach(function (p) {
      var hit = match && match(p);
      p.classList.toggle('is-on', !!hit);
      if (hit) { on[p.getAttribute('data-part')] = 1; onGroups[p.getAttribute('data-group')] = 1; list.push(p); }
    });
    groups.forEach(function (g) { g.classList.toggle('is-on', !!onGroups[g.getAttribute('data-group')]); });
    edges.forEach(function (e) {
      var part = e.getAttribute('data-part');
      e.classList.toggle('is-on', part ? !!on[part] : !!onGroups[e.getAttribute('data-group')]);
    });
    graph.classList.toggle('is-dim', !!match);
    return list;
  }

  function useChip(chip) {
    var use = chip.getAttribute('data-use');
    chips.forEach(function (c) { c.classList.toggle('is-on', c === chip); });
    var list = show(function (p) { return (' ' + p.getAttribute('data-uses') + ' ').indexOf(' ' + use + ' ') >= 0; });
    say('Для чего', chip.getAttribute('data-caption'), 'Для этого нужны:', list);
  }

  function useNode(node) {
    var more = node === open ? '#node-' + node.getAttribute('data-node') : '';
    if (node.classList.contains('graph__group')) {
      var id = node.getAttribute('data-group');
      show(function (p) { return p.getAttribute('data-group') === id; });
      say('Группа', node.getAttribute('data-title'), node.getAttribute('data-caption'), null, more);
    } else {
      show(function (p) { return p === node; });
      say('Часть', node.getAttribute('data-title'), node.getAttribute('data-caption'), null, more);
    }
  }

  function rest() {
    if (open) return useNode(open);
    if (pinned) return useChip(pinned);
    chips.forEach(function (c) { c.classList.remove('is-on'); });
    show(null);
    say();
  }

  function closeBubble() {
    if (!open) return;
    open = null;
    rest();
  }

  function openBubble(node) {
    open = node;
    useNode(node);
  }

  function wire(node) {
    node.addEventListener('mouseenter', function () { if (!open) useNode(node); });
    node.addEventListener('focus', function () { if (!open) useNode(node); });
    node.addEventListener('mouseleave', rest);
    node.addEventListener('blur', rest);
    node.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      node.blur();
      if (open === node) closeBubble(); else openBubble(node);
    });
  }

  parts.forEach(wire);
  groups.forEach(wire);
  chips.forEach(function (chip) {
    chip.addEventListener('mouseenter', function () { if (!open) useChip(chip); });
    chip.addEventListener('focus', function () { if (!open) useChip(chip); });
    chip.addEventListener('mouseleave', rest);
    chip.addEventListener('blur', rest);
    chip.addEventListener('click', function (e) { e.stopPropagation(); open = null; pinned = pinned === chip ? null : chip; rest(); });
  });
  caption.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', closeBubble);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBubble(); });
})();

// Схема в три экрана. Наведение на точку пишет справа от её экрана, что это; нажатие закрепляет описание.
// На узком экране колонки справа нет — описание выезжает шторкой снизу. Без скрипта у точек остаются подсказки.
(function () {
  var flow = document.querySelector('[data-flow]');
  if (!flow) return;
  var sheet = flow.querySelector('[data-flow-sheet]');
  var narrow = window.matchMedia('(max-width: 860px)');
  var pinned = [];

  function closeSheet() { sheet.classList.remove('is-open'); }

  flow.querySelectorAll('.flow__row').forEach(function (row, i) {
    var kind = row.querySelector('[data-flow-kind]'), caption = row.querySelector('[data-flow-caption]');
    var nodes = row.querySelectorAll('.flow__node');

    var side = row.querySelector('.flow__side'), shown = null, timer;

    function fill(node) {
      kind.textContent = node.getAttribute('data-kind');
      caption.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = node.getAttribute('data-title');
      caption.appendChild(strong);
      caption.appendChild(document.createTextNode(node.getAttribute('data-caption')));
    }

    // Карточка видна всегда: пока ничего не выбрано, в ней подсказка (её текст — в свойствах самой карточки).
    // Навели на точку — текст меняется сразу и проявляется заново; ушли — через полсекунды возвращается подсказка.
    function show(from) {
      fill(from);
      side.classList.remove('is-fresh');
      void side.offsetWidth;              // перезапуск проявления текста
      side.classList.add('is-fresh');
    }

    function say(node) {
      clearTimeout(timer);
      if (!node) { timer = setTimeout(function () { if (shown) { shown = null; show(side); } }, 500); return; }
      if (node === shown) return;
      shown = node;
      show(node);
    }

    function pin(node) {
      pinned[i] = node;
      nodes.forEach(function (n) { n.classList.toggle('is-on', n === node); });
      say(node);
    }

    function choose(node) {
      if (narrow.matches) {
        nodes.forEach(function (n) { n.classList.toggle('is-on', n === node); });
        sheet.querySelector('[data-sheet-kind]').textContent = node.getAttribute('data-kind');
        sheet.querySelector('[data-sheet-title]').textContent = node.getAttribute('data-title');
        sheet.querySelector('[data-sheet-text]').textContent = node.getAttribute('data-caption');
        sheet.classList.add('is-open');
      } else {
        pin(pinned[i] === node ? null : node);
      }
    }

    nodes.forEach(function (node) {
      node.addEventListener('mouseenter', function () { say(node); });
      node.addEventListener('mouseleave', function () { say(pinned[i] || null); });
      node.addEventListener('focus', function () { say(node); });
      node.addEventListener('blur', function () { say(pinned[i] || null); });
      node.addEventListener('click', function (e) { e.stopPropagation(); choose(node); });
      node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(node); } });
    });
  });

  sheet.addEventListener('click', function (e) { e.stopPropagation(); });
  sheet.querySelector('.sheet__close').addEventListener('click', closeSheet);
  document.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
})();

// Боковое меню на узком экране открывается без скрипта (переключатель в шапке). Скрипт только закрывает его:
// после перехода по ссылке внутри ящика и по Escape.
(function () {
  var toggle = document.getElementById('nav-toggle'), drawer = document.querySelector('[data-drawer]');
  if (!toggle || !drawer) return;
  drawer.addEventListener('click', function (e) { if (e.target.closest('a')) toggle.checked = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle.checked = false; });
})();

