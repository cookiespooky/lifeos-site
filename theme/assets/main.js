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

// Граф частей: фильтр сверху («что нужно, чтобы работали…»), группа слева или точка на схеме подсвечивают связанное,
// а справа пишется, что выбрано, и ссылки на выбранные части. Нажатие на фильтр или группу закрепляет выбор.
// Без скрипта граф остаётся картинкой со ссылками.
(function () {
  var graph = document.querySelector('[data-graph]');
  if (!graph) return;
  var caption = graph.querySelector('[data-graph-caption]');
  var kind = graph.querySelector('[data-graph-kind]');
  var result = graph.querySelector('[data-graph-result]');
  var parts = graph.querySelectorAll('.graph__part');
  var groups = graph.querySelectorAll('.graph__group');
  var edges = graph.querySelectorAll('.graph__edge');
  var chips = graph.querySelectorAll('[data-use]');
  var picks = graph.querySelectorAll('.graph__pick');
  var pinned = null;

  function say(label, title, text, list) {
    kind.textContent = label || kind.getAttribute('data-default');
    caption.textContent = '';
    result.textContent = '';
    if (!title) { caption.textContent = caption.getAttribute('data-default'); return; }
    var b = document.createElement('strong');
    b.textContent = title;
    caption.appendChild(b);
    if (text) caption.appendChild(document.createTextNode(text));
    (list || []).forEach(function (p) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = p.getAttribute('href');
      a.textContent = p.getAttribute('data-title');
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

  function mark(el) {
    chips.forEach(function (c) { c.classList.toggle('is-on', c === el); });
    picks.forEach(function (c) { c.classList.toggle('is-on', c === el); });
  }

  function useChip(chip) {
    var use = chip.getAttribute('data-use');
    mark(chip);
    var list = show(function (p) { return (' ' + p.getAttribute('data-uses') + ' ').indexOf(' ' + use + ' ') >= 0; });
    say('Для чего', chip.getAttribute('data-caption'), 'Для этого нужны:', list);
  }

  function useGroup(id) {
    var pick = graph.querySelector('.graph__pick[data-group="' + id + '"]');
    mark(pick);
    var list = show(function (p) { return p.getAttribute('data-group') === id; });
    say('Группа', pick.getAttribute('data-caption'), 'В неё входят:', list);
  }

  function rest() {
    if (pinned) return pinned.hasAttribute('data-use') ? useChip(pinned) : useGroup(pinned.getAttribute('data-group'));
    mark(null);
    show(null);
    say();
  }

  function hover(el, enter) {
    el.addEventListener('mouseenter', enter);
    el.addEventListener('focus', enter);
    el.addEventListener('mouseleave', rest);
    el.addEventListener('blur', rest);
  }

  function pin(el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      pinned = pinned === el ? null : el;
      rest();
    });
  }

  parts.forEach(function (p) {
    hover(p, function () {
      show(function (x) { return x === p; });
      say('Часть', p.getAttribute('data-title'), p.getAttribute('data-caption'));
    });
  });
  groups.forEach(function (g) { hover(g, function () { useGroup(g.getAttribute('data-group')); }); });
  picks.forEach(function (pick) { hover(pick, function () { useGroup(pick.getAttribute('data-group')); }); pin(pick); });
  chips.forEach(function (chip) { hover(chip, function () { useChip(chip); }); pin(chip); });
})();
