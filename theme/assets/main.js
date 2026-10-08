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

// Граф частей: наведение на группу, часть или вариант использования подсвечивает связанное и пишет подпись.
// Без скрипта граф остаётся картинкой со ссылками.
(function () {
  var graph = document.querySelector('[data-graph]');
  if (!graph) return;
  var caption = graph.querySelector('[data-graph-caption]');
  var parts = graph.querySelectorAll('.graph__part');
  var groups = graph.querySelectorAll('.graph__group');
  var edges = graph.querySelectorAll('.graph__edge');
  var chips = graph.querySelectorAll('[data-use]');
  var pinned = null;

  function say(title, text) {
    caption.textContent = '';
    if (!title) { caption.textContent = caption.getAttribute('data-default'); return; }
    var b = document.createElement('strong');
    b.textContent = title;
    caption.appendChild(b);
    if (text) caption.appendChild(document.createTextNode(' — ' + text));
  }

  function show(match) {
    var on = {}, onGroups = {};
    parts.forEach(function (p) {
      var hit = match && match(p);
      p.classList.toggle('is-on', !!hit);
      if (hit) { on[p.getAttribute('data-part')] = 1; onGroups[p.getAttribute('data-group')] = 1; }
    });
    groups.forEach(function (g) { g.classList.toggle('is-on', !!onGroups[g.getAttribute('data-group')]); });
    edges.forEach(function (e) {
      var part = e.getAttribute('data-part');
      e.classList.toggle('is-on', part ? !!on[part] : !!onGroups[e.getAttribute('data-group')]);
    });
    graph.classList.toggle('is-dim', !!match);
  }

  function useChip(chip) {
    var use = chip.getAttribute('data-use');
    chips.forEach(function (c) { c.classList.toggle('is-on', c === chip); });
    show(function (p) { return (' ' + p.getAttribute('data-uses') + ' ').indexOf(' ' + use + ' ') >= 0; });
    say(chip.getAttribute('data-caption'), 'подсвечены части, которые для этого нужны');
  }

  function rest() {
    if (pinned) return useChip(pinned);
    chips.forEach(function (c) { c.classList.remove('is-on'); });
    show(null);
    say(null);
  }

  function hover(el, enter) {
    el.addEventListener('mouseenter', enter);
    el.addEventListener('focus', enter);
    el.addEventListener('mouseleave', rest);
    el.addEventListener('blur', rest);
  }

  parts.forEach(function (p) {
    hover(p, function () {
      show(function (x) { return x === p; });
      say(p.getAttribute('data-title'), p.getAttribute('data-caption'));
    });
  });
  groups.forEach(function (g) {
    hover(g, function () {
      var id = g.getAttribute('data-group');
      show(function (x) { return x.getAttribute('data-group') === id; });
      var text = g.getAttribute('data-caption'), cut = text.indexOf(': ');
      say(text.slice(0, cut), text.slice(cut + 2));
    });
  });
  chips.forEach(function (chip) {
    hover(chip, function () { useChip(chip); });
    chip.addEventListener('click', function () { pinned = pinned === chip ? null : chip; rest(); });
  });
})();
