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

// Граф частей. Фильтр сверху («для чего») и наведение на точку подсвечивают связанное и пишут справа, что это.
// Нажатие на точку показывает рядом пузырь: коротко что это и ссылка «Подробнее» — на описание под графом.
// Без скрипта граф остаётся картинкой, а точки — ссылками на страницы.
(function () {
  var graph = document.querySelector('[data-graph]');
  if (!graph) return;
  var svg = graph.querySelector('svg');
  var bubble = graph.querySelector('[data-graph-bubble]');
  var caption = graph.querySelector('[data-graph-caption]');
  var kind = graph.querySelector('[data-graph-kind]');
  var result = graph.querySelector('[data-graph-result]');
  var parts = graph.querySelectorAll('.graph__part');
  var groups = graph.querySelectorAll('.graph__group');
  var edges = graph.querySelectorAll('.graph__edge');
  var chips = graph.querySelectorAll('[data-use]');
  var pinned = null, open = null;

  function el(tag, text) { var n = document.createElement(tag); n.textContent = text; return n; }

  function say(label, title, text, list) {
    kind.textContent = label || kind.getAttribute('data-default');
    caption.textContent = '';
    result.textContent = '';
    if (!title) { caption.textContent = caption.getAttribute('data-default'); return; }
    caption.appendChild(el('strong', title));
    if (text) caption.appendChild(document.createTextNode(text));
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
    if (node.classList.contains('graph__group')) {
      var id = node.getAttribute('data-group');
      show(function (p) { return p.getAttribute('data-group') === id; });
      say('Группа', node.getAttribute('data-title'), node.getAttribute('data-caption'));
    } else {
      show(function (p) { return p === node; });
      say('Часть', node.getAttribute('data-title'), node.getAttribute('data-caption'));
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
    bubble.classList.remove('is-open');   // гаснет плавно; содержимое остаётся до следующего открытия
    rest();
  }

  function openBubble(node) {
    var box = svg.viewBox.baseVal, x = (node.getAttribute('data-x') - box.x) / box.width, y = (node.getAttribute('data-y') - box.y) / box.height;
    open = node;
    bubble.textContent = '';
    bubble.appendChild(el('strong', node.getAttribute('data-title')));
    bubble.appendChild(el('span', node.getAttribute('data-caption')));
    var more = el('a', 'Подробнее ↓');
    more.href = '#node-' + node.getAttribute('data-node');
    bubble.appendChild(more);
    bubble.style.left = (x * 100) + '%';
    bubble.style.top = (y * 100) + '%';
    bubble.className = 'graph__bubble is-open' + (y > 0.55 ? ' is-up' : '') + (x > 0.66 ? ' is-left' : x < 0.34 ? ' is-right' : '');
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
    chip.addEventListener('click', function () { open = null; bubble.classList.remove('is-open'); pinned = pinned === chip ? null : chip; rest(); });
  });
  bubble.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', closeBubble);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBubble(); });
})();
