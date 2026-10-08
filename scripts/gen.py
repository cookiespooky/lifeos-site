#!/usr/bin/env python3
"""Собирает content/ из src/ (тексты, написанные руками) и data/components.json (выгрузка реестра компонентов).

    python3 scripts/gen.py            # переписать content/ целиком
    python3 scripts/gen.py --check    # только проверить src/ и данные, ничего не писать

Одни и те же входы — одни и те же файлы: дат сборки нет, порядок задан данными, координаты графа считаются из
порядка частей. content/ руками не правится и в git не лежит.

Блоки (плитки, колонки, строки, цепочки, пример, граф) выходят готовой разметкой: только имена классов из
theme/assets/styles.css, ни одного стиля в строке. Вид меняется в theme/assets/tokens.css и styles.css, а не здесь.
Каждый блок — подряд идущие строки без пустых: так движок принимает его как один кусок разметки.

Метки в src/: {{uses}} — плитки «Для кого», {{groups}} — колонки частей, {{parts}} — части одного варианта,
{{howtos}} — инструкции, {{usetabs}} — «Для кого» вкладками с примерами, {{example}} — пример разговором: сообщение и
следующим сообщением карточки того, что система записала (за меткой список; пишется на странице варианта). Формат главной —
в README.md. Только stdlib.
"""
import html, json, math, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT, DATA = (os.path.join(ROOT, d) for d in ('src', 'content', os.path.join('data', 'components.json')))
STOP = ['модел', 'нейросет', 'frontmatter', 'деплой', 'скилл', 'дашборд', 'заметк']   # те же части слов, что в реестре (component_stop)
MONTHS = 'января февраля марта апреля мая июня июля августа сентября октября ноября декабря'.split()
errors = []
esc = lambda s: html.escape(str(s), quote=True)


def typo(s):
    """Короткое слово не остаётся в конце строки: после него — неразрывный пробел."""
    s = s.replace(' — ', '\u00a0— ')   # тире не начинает строку
    return re.sub(r'(?<![\w-])([ВвИиСсКкОоУуАа]|на|не|по|за|из|от|до|об|но|На|Не|По|За|Из|От|До|Об|Но) ', '\\1\u00a0', s)


def date_ru(d):
    y, m, day = d.split('-')
    return f'{int(day)} {MONTHS[int(m) - 1]} {y}'


def plural(n, one, few, many):
    n10, n100 = n % 10, n % 100
    return f'{n} ' + (one if n10 == 1 and n100 != 11 else few if 2 <= n10 <= 4 and not 12 <= n100 <= 14 else many)


def split(text, name):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not m:
        errors.append(f'{name}: нет свойств в начале файла')
        return {}, text
    fm = {}
    for row in m.group(1).split('\n'):
        k, _, v = row.partition(':')
        fm[k.strip()] = v.strip().strip('"')
    return fm, text[m.end():]


def page(kind, slug, title, description, body, order=None, kicker=None, badge=None):
    q = lambda s: json.dumps(s, ensure_ascii=False)
    head = ['---', f'type: {kind}', f'slug: {slug}', f'title: {q(title)}', f'description: {q(description)}']
    head += [f'{k}: {q(v)}' for k, v in (('kicker', kicker), ('badge', badge)) if v]
    if order is not None:
        head.append(f'order: {order}')
    return '\n'.join(head + ['---', '', body.strip(), ''])


# ---------- блоки ----------

def badge(c):
    return '' if c['status'] == 'работает' else f'<span class="badge">{esc(c["status"])}</span>'


def part_url(c):
    return f'/chto-vnutri/{c["id"]}/'


def rows_parts(parts):
    out = ['<div class="rows">']
    out += [f'<div class="row"><div class="row__title"><a href="{part_url(c)}">{esc(c["title"])}</a>{badge(c)}</div>'
            f'<div class="row__text">{esc(c["summary"])}</div></div>' for c in parts]
    return '\n'.join(out + ['</div>'])


def rows_dated(items):
    """items: (дата, заголовок или None, адрес или None, текст)"""
    out = ['<div class="rows">']
    for d, title, url, text in items:
        left = f'<div class="row__title"><a href="{url}">{esc(title)}</a></div>' if title else f'<div class="row__date">{date_ru(d)}</div>'
        out.append(f'<div class="row">{left}<div class="row__text">{esc(text)}</div></div>')
    return '\n'.join(out + ['</div>'])


def tiles(uses):
    out = ['<div class="tiles">']
    for _, fm, _, _ in uses:
        out.append(f'<a class="tile" href="/dlya/{fm["slug"]}/"><span class="tile__label"><span>{esc(fm["use"])}</span><span aria-hidden="true">→</span></span>'
                   f'<span class="tile__title">{esc(typo(fm["title"]))}</span><span class="tile__text">{esc(fm["description"])}</span></a>')
    return '\n'.join(out + ['</div>'])


def cols(groups, by_group):
    out = ['<div class="cols">']
    for i, g in enumerate(groups, 1):
        items = ''.join(f'<li><a href="{part_url(c)}">{esc(c["title"])}</a>{badge(c)}</li>' for c in by_group[g])
        out.append(f'<div class="col"><span class="col__num">{i:02d}</span><h3 class="col__title">{esc(g)}</h3><ul class="col__list">{items}</ul></div>')
    return '\n'.join(out + ['</div>'])


def tabs(name, items):
    """Вкладки без скрипта: items — [(подпись, разметка панели)]. Переключатели стоят перед полосой подписей и панелями —
    на этом держатся правила в styles.css; полоса подписей на узком экране прилипает к верху, пока видна её секция."""
    if len(items) > 8:
        errors.append(f'вкладок «{name}» больше восьми — в styles.css правил на столько нет')
    radios = [f'<input class="tabs__radio" type="radio" name="{name}" id="{name}-{i}" aria-label="{esc(label)}"{" checked" if i == 1 else ""}>' for i, (label, _) in enumerate(items, 1)]
    bar = '<div class="tabs__bar">' + ''.join(f'<label class="tabs__tab" for="{name}-{i}">{esc(label)}</label>' for i, (label, _) in enumerate(items, 1)) + '</div>'
    return '\n'.join(['<div class="tabs">'] + radios + [bar] + [f'<section class="tabs__panel">{panel}</section>' for _, panel in items] + ['</div>'])


def chains(text, name):
    """#### Название / абзац / нумерованный список «Шаг — пояснение» → вкладки."""
    items = []
    for b in [b for b in re.split(r'^#### ', text, flags=re.M) if b.strip()]:
        title, _, rest = b.partition('\n')
        steps = re.findall(r'^\d+\. (.+)$', rest, re.M)
        para = ' '.join(l.strip() for l in rest.split('\n') if l.strip() and not re.match(r'\d+\. ', l))
        if not steps or not para:
            errors.append(f'{name}: цепочка «{title.strip()}» — нужен абзац и нумерованный список шагов')
        li = []
        for n, st in enumerate(steps, 1):
            head, _, note = st.partition(' — ')
            li.append(f'<li class="step"><span class="step__num">{n:02d}</span><div class="step__title">{esc(typo(head))}</div><div class="step__text">{esc(note)}</div></li>')
        items.append((title.strip(), f'<ol class="steps">{"".join(li)}</ol><p class="tabs__text">{esc(para)}</p>'))
    return tabs('chain', items)


def example(lines, name):
    """Пример разговором: «- Что пришло: текст» — сообщение, вложенные строки под ним — следующим сообщением то, что
    система из этого записала или ответила, карточками."""
    top = [l[2:] for l in lines if l.startswith('- ')]
    sub = [l.strip()[2:] for l in lines if re.match(r'\s+- ', l)]
    if len(top) != 1 or not sub:
        errors.append(f'{name}: после {{{{example}}}} — одна строка списка и вложенные под ней')
        return ''
    cell = lambda st: '<div class="chat__label">{}</div><div class="chat__what">{}</div>'.format(*(esc(x.strip()) for x in (st.partition(': ')[0], st.partition(': ')[2])))
    return ('<div class="chat">' + f'<div class="chat__msg">{cell(top[0])}</div>' + '<div class="chat__reply"><div class="chat__from">Life OS</div><ul class="chat__cards">'
            + ''.join(f'<li class="chat__card">{cell(st)}</li>' for st in sub) + '</ul></div></div>')


EXAMPLE = re.compile(r'^\{\{example\}\}\n((?:[ \t]*- .*\n?)+)', re.M)


def use_tabs(uses, examples):
    """«Для кого» вкладками: о какой работе речь, ссылка на страницу варианта и его пример разговором."""
    items = []
    for _, fm, _, name in uses:
        text = (f'<div class="usecase__text"><h3 class="usecase__title">{esc(typo(fm["title"]))}</h3><p>{esc(fm["description"])}</p>'
                f'<a class="more" href="/dlya/{fm["slug"]}/">Подробнее <span aria-hidden="true">→</span></a></div>')
        if name not in examples:
            errors.append(f'{name}: нет примера — {{{{example}}}} и список под ним')
        items.append((fm['use'], f'<div class="usecase">{text}<div class="frame"><div class="frame__label">Ситуация</div>{examples.get(name, "")}</div></div>'))
    return tabs('use', items)


def actions(links):
    return '<div class="actions">' + ''.join(f'<a class="btn{" btn--primary" if i == 0 else ""}" href="{esc(u)}">{esc(t)}</a>' for i, (t, u) in enumerate(links)) + '</div>'


def graph(data, by_group, uses):
    """Граф частей: в центре система, первый круг — группы, второй — части. Всё из реестра; мест «для красоты» нет."""
    CX, CY, R1, R2, PAD = 320, 320, 125, 285, 35   # поле схемы — круг частей с полем PAD вокруг
    groups, GAP = data['groups'], 0.7
    unit = 2 * math.pi / (len(data['components']) + GAP * len(groups))
    pt = lambda r, a: (round(CX + r * math.cos(a), 1), round(CY + r * math.sin(a), 1))
    a, edges, nodes, pulses = -math.pi / 2, [], [], []
    for gi, g in enumerate(groups, 1):
        parts, angles = by_group[g], []
        for c in parts:
            angles.append(a + unit / 2)
            a += unit
        a += GAP * unit
        ga = sum(angles) / len(angles)
        gx, gy = pt(R1, ga)
        edges.append(f'<line class="graph__edge" data-group="g{gi}" x1="{CX}" y1="{CY}" x2="{gx}" y2="{gy}"/>')
        cos, sin = math.cos(ga), math.sin(ga)
        if abs(cos) > 0.35:
            lx, ly, anchor = gx + (18 if cos > 0 else -18), gy + 5.5, 'start' if cos > 0 else 'end'
        else:
            lx, ly, anchor = gx, gy + (32 if sin > 0 else -20), "middle"
        names = ', '.join(c['title'] for c in parts)
        nodes.append(f'<a class="graph__group" href="/chto-vnutri/#g{gi}" data-group="g{gi}" data-node="g{gi}" data-x="{gx}" data-y="{gy}" data-title="{esc(g)}" data-caption="{esc(plural(len(parts), "часть", "части", "частей"))}: {esc(names)}.">'
                     f'<circle class="graph__halo" cx="{gx}" cy="{gy}" r="15"/><circle cx="{gx}" cy="{gy}" r="7"/>'
                     f'<text x="{round(lx, 1)}" y="{round(ly, 1)}" text-anchor="{anchor}">{esc(g)}</text><circle class="graph__hit" cx="{gx}" cy="{gy}" r="22"/></a>')
        for c, pa in zip(parts, angles):
            px, py = pt(R2, pa)
            edges.append(f'<line class="graph__edge" data-group="g{gi}" data-part="{c["id"]}" x1="{gx}" y1="{gy}" x2="{px}" y2="{py}"/>')
            soon = '' if c['status'] == 'работает' else ' graph__part--soon'
            state = '' if c['status'] == 'работает' else f' ({c["status"]})'
            nodes.append(f'<a class="graph__part{soon}" href="{part_url(c)}" data-part="{c["id"]}" data-node="{c["id"]}" data-x="{px}" data-y="{py}" data-group="g{gi}" data-uses="{esc(" ".join(c["for"]))}" '
                         f'data-title="{esc(c["title"] + state)}" data-caption="{esc(c["summary"])}"><title>{esc(c["title"] + state)}</title>'
                         f'<circle cx="{px}" cy="{py}" r="5.5"/><circle class="graph__hit" cx="{px}" cy="{py}" r="16"/></a>')
        px, py = pt(R2, angles[0])
        dur = 5 + gi % 3
        pulses.append(f'<circle class="graph__pulse" r="2.5" opacity="0"><animateMotion dur="{dur}s" begin="{round(gi * 0.8, 1)}s" repeatCount="indefinite" path="M{px} {py} L{gx} {gy} L{CX} {CY}"/>'
                      f'<animate attributeName="opacity" dur="{dur}s" begin="{round(gi * 0.8, 1)}s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.15;0.8;1"/></circle>')
    n_parts, n_groups = len(data['components']), len(groups)
    count = f'{plural(n_groups, "группа", "группы", "групп")}, {plural(n_parts, "часть", "части", "частей")}'
    lead = f'{count[0].upper() + count[1:]}. Нажмите на точку — рядом появится, что это; сверху можно выбрать, для чего система нужна.'
    soon = any(c['status'] != 'работает' for c in data['components'])
    chips = ''.join(f'<button class="chip" type="button" data-use="{esc(fm["use"])}" data-caption="{esc(fm["title"])}">{esc(fm["use"])}</button>' for _, fm, _, _ in uses)
    # Подробное описание каждой точки лежит под графом и открывается по ссылке «Подробнее» из пузыря (правило :target).
    info = []
    for gi, g in enumerate(groups, 1):
        rows = ''.join(f'<li><a href="{part_url(c)}">{esc(c["title"])}</a>{badge(c)}<span>{esc(c["summary"])}</span></li>' for c in by_group[g])
        info.append(f'<article class="graph__info" id="node-g{gi}"><p class="graph__label">Группа</p><h3>{esc(g)}</h3><ul class="graph__parts">{rows}</ul>'
                    f'<a class="more" href="/chto-vnutri/#g{gi}">Вся группа <span aria-hidden="true">→</span></a></article>')
        for c in by_group[g]:
            how = f'<div><p class="graph__label">Как работает</p><p>{esc(c["how"])}</p></div>' if c['how'] else ''
            human = f'<div><p class="graph__label">Что делает человек</p><p>{esc(c["human"])}</p></div>' if c['human'] else ''
            info.append(f'<article class="graph__info" id="node-{c["id"]}"><p class="graph__label">{esc(g)}{badge(c)}</p><h3>{esc(c["title"])}</h3><p class="graph__sum">{esc(c["summary"])}</p>'
                        f'<div class="graph__more">{how}{human}</div><a class="more" href="{part_url(c)}">Открыть страницу <span aria-hidden="true">→</span></a></article>')
    return '\n'.join([
        '<div class="graph" data-graph>',
        f'<div class="graph__filters js-only"><span class="graph__label">Для чего</span><div class="chips">{chips}</div></div>',
        '<div class="graph__stage">',
        f'<div class="graph__canvas"><svg viewBox="{CX - R2 - PAD} {CY - R2 - PAD} {2 * (R2 + PAD)} {2 * (R2 + PAD)}" role="img" aria-label="Схема: {esc(count)} системы вокруг общего центра">',
        *edges,
        f'<circle class="graph__ring" cx="{CX}" cy="{CY}" r="56"/><circle class="graph__core" cx="{CX}" cy="{CY}" r="40"/><text class="graph__core-label" x="{CX}" y="{CY + 5}">Life OS</text>',
        *pulses, *nodes, '</svg><div class="graph__bubble" data-graph-bubble hidden></div></div>',
        '<div class="graph__side" aria-live="polite"><span class="graph__label" data-graph-kind data-default="Что на схеме">Что на схеме</span>',
        f'<p class="graph__caption" data-graph-caption data-default="{esc(lead)}">{esc(lead)}</p>',
        '<ul class="graph__result" data-graph-result></ul>',
        '<div class="graph__legend"><span><i class="is-group"></i>группа</span><span><i></i>часть</span>' + ('<span><i class="is-soon"></i>в разработке</span>' if soon else '') + '</div></div>',
        '</div>',
        '<div class="graph__details">', *info, '</div>',
        '</div>'])


# ---------- главная ----------

LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')


def home(fm, body, name, marks, graph_html):
    """До первого «##» — первый экран: абзац и список ссылок-кнопок. Дальше полосы: «## Подпись {#id .dark}», под ней
    «### Заголовок полосы», затем текст, метки, список из одних ссылок (кнопки), абзац из одной ссылки («дальше →»)."""
    chunks = re.split(r'^## ', body, flags=re.M)
    lead_lines = [l for l in chunks[0].strip().split('\n') if l.strip()]
    buttons = [LINK.fullmatch(l[2:].strip()).groups() for l in lead_lines if l.startswith('- ') and LINK.fullmatch(l[2:].strip())]
    lead = ' '.join(l.strip() for l in lead_lines if not l.startswith('- '))
    for key in ('kicker', 'hero_title'):
        if not fm.get(key):
            errors.append(f'{name}: в свойствах нет {key}')
    # Первый экран — одной колонкой: подпись, заголовок, подзаголовок, кнопки; ниже граф во всю ширину с фильтрами
    # над ним, выбором слева и описанием выбранного справа.
    out = ['\n'.join(['<section class="hero">', '<div class="hero__inner">', '<div class="hero__text">',
                      f'<p class="eyebrow"><span>{esc(fm.get("kicker", ""))}</span></p>', f'<h1 class="hero__title">{esc(typo(fm.get("hero_title", "")))}</h1>',
                      f'<p class="hero__lead">{esc(lead)}</p>', *([actions(buttons)] if buttons else []), '</div>', graph_html, '</div>', '</section>'])]
    for n, chunk in enumerate(chunks[1:], 1):
        headline, _, rest = chunk.partition('\n')
        m = re.match(r'(.*?)\s*(?:\{([^}]*)\})?\s*$', headline)
        label, opts = m.group(1), (m.group(2) or '').split()
        sid = next((o[1:] for o in opts if o.startswith('#')), '')
        cls = ['band'] + [f'band--{o[1:]}' for o in opts if o.startswith('.')]
        if n % 2 == 0 and 'band--dark' not in cls:
            cls.append('band--alt')
        title = re.search(r'^### (.+)$', rest, re.M)
        rest = re.sub(r'^### .+\n?', '', rest, count=1, flags=re.M)
        if re.search(r'^#### ', rest, re.M):
            pre, _, tail = rest.partition('#### ')
            rest = pre + '\n' + chains('#### ' + tail, name) + '\n'
        blocks = []
        for block in re.split(r'\n\s*\n', rest.strip()):
            lines = block.split('\n')
            if lines[0].strip() == '{{example}}':
                block = example(lines[1:], name)
            elif all(l.startswith('- ') and LINK.fullmatch(l[2:].strip()) for l in lines):
                block = actions([LINK.fullmatch(l[2:].strip()).groups() for l in lines])
            elif len(lines) == 1 and LINK.fullmatch(block.strip()):
                t, u = LINK.fullmatch(block.strip()).groups()
                block = f'<p><a class="more" href="{esc(u)}">{esc(t)}</a></p>'
            elif block.strip() in ('{{uses}}', '{{groups}}', '{{usetabs}}'):
                block = marks[block.strip()[2:-2]]
            blocks.append(block)
        head = [f'<section class="{" ".join(cls)}"' + (f' id="{sid}"' if sid else '') + '>', '<div class="band__inner">', f'<p class="eyebrow"><span>{esc(label)}</span></p>']
        if title:
            head.append(f'<h2 class="band__title">{esc(typo(title.group(1)))}</h2>')
        out += ['\n'.join(head), *blocks, '</div>\n</section>']
    return '\n\n'.join(out)


def main():
    data = json.load(open(DATA, encoding='utf-8'))
    comps = data['components']
    by_group = {g: [c for c in comps if c['group'] == g] for g in data['groups']}
    files, uses, howtos = {}, [], []
    # День, когда реестр завели: строки «заведено» этого дня — учёт, а не новость, на сайт они не идут.
    born = min((ch['date'] for ch in data['changes'] if ch['text'].startswith('заведено')), default='')
    data['changes'] = [ch for ch in data['changes'] if not (ch['text'].startswith('заведено') and ch['date'] == born)]

    sources = {f: open(os.path.join(SRC, f), encoding='utf-8').read() for f in sorted(os.listdir(SRC)) if f.endswith('.md')}
    for name, text in sources.items():
        low = text.lower()
        errors.extend(f'{name}: слово с «{w}» — его на сайте быть не должно' for w in STOP if w in low)
        fm, body = split(text, name)
        if fm.get('type') == 'use':
            if fm.get('use') not in data['uses']:
                errors.append(f'{name}: use «{fm.get("use")}» нет в реестре: {", ".join(data["uses"])}')
            uses.append((int(fm.get('order') or 0), fm, body, name))
        elif fm.get('type') == 'howto':
            howtos.append((int(fm.get('order') or 0), fm, body, name))
    uses.sort(key=lambda u: (u[0], u[1].get('slug', '')))
    howtos.sort(key=lambda u: (u[0], u[1].get('slug', '')))

    # Пример варианта написан на его странице и стоит там же; главная берёт его во вкладку «Для кого».
    examples = {}
    for _, _, body, name in uses:
        m = EXAMPLE.search(body)
        if m:
            examples[name] = example(m.group(1).rstrip('\n').split('\n'), name)
    marks = {
        'usetabs': use_tabs(uses, examples),
        'groups': cols(data['groups'], by_group),
        'uses': tiles(uses),
        'howtos': rows_dated([(None, fm['title'], f'/kak/{fm["slug"]}/', fm['description']) for _, fm, _, _ in howtos]) if howtos else '',
    }
    kickers = {'use': 'Для кого', 'howto': 'Инструкции'}
    for name, text in sources.items():
        fm, body = split(text, name)
        if fm.get('type') == 'home':
            files['index.md'] = page('home', fm.get('slug', ''), fm.get('title', ''), fm.get('description', ''),
                                     home(fm, body, name, marks, graph(data, by_group, uses)))
            continue
        local = dict(marks)
        if fm.get('type') == 'use':
            mine = [c for c in comps if fm.get('use') in c['for']]
            if not mine:
                errors.append(f'{name}: в реестре нет компонентов для «{fm.get("use")}»')
            local['parts'] = rows_parts(mine)
        body = EXAMPLE.sub(lambda m: example(m.group(1).rstrip('\n').split('\n'), name) + '\n', body)
        body = re.sub(r'\{\{(\w+)\}\}', lambda m: local.get(m.group(1)) if m.group(1) in local else errors.append(f'{name}: неизвестная метка {m.group(0)}') or '', body)
        kicker = kickers.get(fm.get('type'), '') + (f' · {fm["use"]}' if fm.get('use') else '')
        files[name] = page(fm.get('type', 'page'), fm.get('slug', ''), fm.get('title', ''), fm.get('description', ''), body,
                           fm.get('order') or None, kicker=kicker or None)

    # Что внутри: общий список и страница на компонент
    inside = []
    for i, g in enumerate(data['groups'], 1):
        inside += [f'<h2 id="g{i}">{esc(g)}</h2>', '', rows_parts(by_group[g]), '']
    files['chto-vnutri.md'] = page('page', 'chto-vnutri', 'Что внутри', 'Части системы по группам: что каждая делает и в каком она состоянии.', '\n'.join(inside))
    use_title = {fm['use']: (fm['title'], fm['slug']) for _, fm, _, _ in uses if fm.get('use')}
    for c in comps:
        body = ['## Как работает', '', c['how'] or 'Описание готовится.', '', '## Что делает человек', '', c['human'] or 'Описание готовится.', '']
        where = [f'<a class="chip" href="/dlya/{use_title[u][1]}/">{esc(use_title[u][0])}</a>' for u in c['for'] if u in use_title]
        if where:
            body += ['## Где это нужно', '', '<div class="chips">' + ''.join(where) + '</div>', '']
        mine = [ch for ch in data['changes'] if ch['id'] == c['id']]
        if mine:
            body += ['## История', '', rows_dated([(ch['date'], None, None, ch['text']) for ch in mine])]
        files[f'part-{c["id"]}.md'] = page('part', c['id'], c['title'], c['summary'], '\n'.join(body), c['order'],
                                           kicker=f'Что внутри · {c["group"]}', badge=c['status'])

    # Для кого и Что нового
    files['dlya.md'] = page('page', 'dlya', 'Для кого', 'Четыре способа пользоваться системой — по тому, какая работа для вас главная.', marks['uses'])
    news, days = [], []
    for ch in data['changes']:
        if not days or days[-1][0] != ch['date']:
            days.append((ch['date'], []))
        days[-1][1].append((ch['date'], ch['title'], f'/chto-vnutri/{ch["id"]}/', ch['text']))
    for d, items in days:
        news += [f'## {date_ru(d)}', '', rows_dated(items), '']
    files['chto-novogo.md'] = page('page', 'chto-novogo', 'Что нового', 'Что менялось в системе, по датам. Страница собирается из истории частей.', '\n'.join(news))

    slugs = {}
    for name, text in files.items():
        slug = re.search(r'^slug: (.*)$', text, re.M).group(1)
        if not re.fullmatch(r'[a-z0-9-]+', slug):
            errors.append(f'{name}: slug «{slug}» — строчные латинские буквы, цифры и дефис')
        if slug in slugs:
            errors.append(f'{name}: slug «{slug}» уже занят файлом {slugs[slug]}')
        slugs[slug] = name
        if re.search(r'style\s*=', text):
            errors.append(f'{name}: стиль в строке — вид задаётся только в theme/assets/')
    if errors:
        print('\n'.join(errors))
        sys.exit(f'ошибок: {len(errors)} — content/ не тронут')
    if '--check' in sys.argv:
        return print(f'проверено: страниц {len(files)}, компонентов {len(comps)}')
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    for name, text in sorted(files.items()):
        open(os.path.join(OUT, name), 'w', encoding='utf-8').write(text)
    print(f'content/: страниц {len(files)}, компонентов {len(comps)}')


main()
