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
следующим сообщением карточки того, что система записала (за меткой список; пишется на странице варианта),
{{integrations}} — значки приложений (за меткой: группа и под ней «Название: файл» из theme/assets/logos),
{{benefits}} — преимущества плитками («- Заголовок: текст»), {{ways}} — способы получить ссылками со значком
(«- Заголовок: текст | значок | адрес»). src/flow.md (type: flow) — не страница, а схема первого
экрана в три раздела; пока его нет, первый экран занимает граф частей из реестра. Формат главной — в README.md. Только stdlib.
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


def app(title, file, soon):
    img = f'<img src="/assets/logos/{esc(file)}" alt="" width="32" height="32" loading="lazy">' if file else ''
    return f'<li class="app{" app--soon" if soon else ""}"' + (' title="в планах"' if soon else '') + f'>{img}<span>{esc(title)}</span></li>'


def apps_by_group(lines, name):
    """Приложения по группам: «- Группа» и под ней «  - Название: файл из theme/assets/logos[, в планах]». Файла может
    не быть — тогда строка без значка. -> [(группа, [(название, файл, в планах ли)])] в порядке записи."""
    out = []
    for l in lines:
        if l.startswith('- '):
            out.append((l[2:].strip(), []))
        elif re.match(r'\s+- ', l) and out:
            item, soon = l.strip()[2:], False
            if item.endswith(', в планах'):
                item, soon = item[:-len(', в планах')], True
            title, _, file = item.rpartition(': ') if ': ' in item else (item, '', '')
            if file and not os.path.exists(os.path.join(ROOT, 'theme', 'assets', 'logos', file.strip())):
                errors.append(f'{name}: нет значка theme/assets/logos/{file.strip()} для «{title}»')
            out[-1][1].append((title.strip(), file.strip(), soon))
    return out


def cols(groups, by_group, apps=None):
    """Колонки частей по группам. apps — приложения, с которыми работает группа: встают значками под её частями;
    группы из apps, которых нет в реестре (интерфейсы, адаптеры), идут строками под колонками."""
    apps = apps or []
    mine = {g: items for g, items in apps if g in groups}
    out = ['<div class="cols">']
    for i, g in enumerate(groups, 1):
        items = ''.join(f'<li><a href="{part_url(c)}">{esc(c["title"])}</a>{badge(c)}</li>' for c in by_group[g])
        icons = f'<ul class="col__apps">{"".join(app(*a) for a in mine[g])}</ul>' if mine.get(g) else ''
        out.append(f'<div class="col"><span class="col__num">{i:02d}</span><h3 class="col__title">{esc(g)}</h3><ul class="col__list">{items}</ul>{icons}</div>')
    out.append('</div>')
    rest = [(g, items) for g, items in apps if g not in groups]
    if rest:
        out.append('<div class="apps">')
        for g, items in rest:
            out.append(f'<div class="apps__group"><p class="apps__title">{esc(g)}</p><ul class="apps__list">{"".join(app(*a) for a in items)}</ul></div>')
        out.append('</div>')
    return '\n'.join(out)


def tabs(name, items):
    """Вкладки без скрипта: items — [(подпись, разметка панели)]. Переключатели стоят перед полосой подписей и панелями —
    на этом держатся правила в styles.css; полоса подписей на узком экране прилипает к верху, пока видна её секция."""
    if len(items) > 8:
        errors.append(f'вкладок «{name}» больше восьми — в styles.css правил на столько нет')
    radios = [f'<input class="tabs__radio" type="radio" name="{name}" id="{name}-{i}" aria-label="{esc(label)}"{" checked" if i == 1 else ""}>' for i, (label, _) in enumerate(items, 1)]
    bar = '<div class="tabs__bar">' + ''.join(f'<label class="tabs__tab" for="{name}-{i}">{esc(label)}</label>' for i, (label, _) in enumerate(items, 1)) + '</div>'
    return '\n'.join([f'<div class="tabs tabs--{name}">'] + radios + [bar] + [f'<section class="tabs__panel">{panel}</section>' for _, panel in items] + ['</div>'])


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


def integrations(lines, name):
    """Знакомые приложения значками: «- Группа» и под ней «  - Название: файл из theme/assets/logos»."""
    out, group = ['<div class="apps">'], None
    for l in lines:
        if l.startswith('- '):
            if group:
                out.append('</ul></div>')
            group = l[2:].strip()
            out.append(f'<div class="apps__group"><p class="apps__title">{esc(group)}</p><ul class="apps__list">')
        elif re.match(r'\s+- ', l) and group:
            title, _, file = l.strip()[2:].rpartition(': ')
            if not os.path.exists(os.path.join(ROOT, 'theme', 'assets', 'logos', file.strip())):
                errors.append(f'{name}: нет значка theme/assets/logos/{file.strip()} для «{title}»')
            out.append(f'<li class="app"><img src="/assets/logos/{esc(file.strip())}" alt="" width="32" height="32" loading="lazy"><span>{esc(title.strip())}</span></li>')
    return '\n'.join(out + (['</ul></div>'] if group else []) + ['</div>'])


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
            lx, ly, anchor = gx + (24 if cos > 0 else -24), gy + 8, 'start' if cos > 0 else 'end'
        else:
            lx, ly, anchor = gx, gy + (44 if sin > 0 else -24), "middle"
        names = ', '.join(c['title'] for c in parts)
        nodes.append(f'<a class="graph__group" href="/chto-vnutri/#g{gi}" data-group="g{gi}" data-node="g{gi}" data-x="{gx}" data-y="{gy}" data-title="{esc(g)}" data-caption="{esc(plural(len(parts), "часть", "части", "частей"))}: {esc(names)}.">'
                     f'<circle class="graph__halo" cx="{gx}" cy="{gy}" r="20"/><circle cx="{gx}" cy="{gy}" r="10"/>'
                     f'<text x="{round(lx, 1)}" y="{round(ly, 1)}" text-anchor="{anchor}">{esc(g)}</text><circle class="graph__hit" cx="{gx}" cy="{gy}" r="30"/></a>')
        for c, pa in zip(parts, angles):
            px, py = pt(R2, pa)
            edges.append(f'<line class="graph__edge" data-group="g{gi}" data-part="{c["id"]}" x1="{gx}" y1="{gy}" x2="{px}" y2="{py}"/>')
            soon = '' if c['status'] == 'работает' else ' graph__part--soon'
            state = '' if c['status'] == 'работает' else f' ({c["status"]})'
            nodes.append(f'<a class="graph__part{soon}" href="{part_url(c)}" data-part="{c["id"]}" data-node="{c["id"]}" data-x="{px}" data-y="{py}" data-group="g{gi}" data-uses="{esc(" ".join(c["for"]))}" '
                         f'data-title="{esc(c["title"] + state)}" data-caption="{esc(c["summary"])}"><title>{esc(c["title"] + state)}</title>'
                         f'<circle cx="{px}" cy="{py}" r="8"/><circle class="graph__hit" cx="{px}" cy="{py}" r="22"/></a>')
        px, py = pt(R2, angles[0])
        dur = 5 + gi % 3
        pulses.append(f'<circle class="graph__pulse" r="3.5" opacity="0"><animateMotion dur="{dur}s" begin="{round(gi * 0.8, 1)}s" repeatCount="indefinite" path="M{px} {py} L{gx} {gy} L{CX} {CY}"/>'
                      f'<animate attributeName="opacity" dur="{dur}s" begin="{round(gi * 0.8, 1)}s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.15;0.8;1"/></circle>')
    n_parts, n_groups = len(data['components']), len(groups)
    count = f'{plural(n_groups, "группа", "группы", "групп")}, {plural(n_parts, "часть", "части", "частей")}'
    lead = f'{count[0].upper() + count[1:]}. Нажмите на точку — здесь появится, что это; кнопками выше можно выбрать, для чего система нужна.'
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
        '<div class="graph__stage">',
        f'<div class="graph__canvas"><svg viewBox="{CX - R2 - PAD} {CY - R2 - PAD} {2 * (R2 + PAD)} {2 * (R2 + PAD)}" role="img" aria-label="Схема: {esc(count)} системы вокруг общего центра">',
        *edges,
        f'<circle class="graph__ring" cx="{CX}" cy="{CY}" r="66"/><circle class="graph__core" cx="{CX}" cy="{CY}" r="50"/><text class="graph__core-label" x="{CX}" y="{CY + 8}">Life OS</text>',
        *pulses, *nodes, '</svg></div>',
        f'<div class="graph__filters js-only"><span class="graph__label">Для чего</span><div class="chips">{chips}</div></div>',
        '<div class="graph__side" aria-live="polite"><span class="graph__label" data-graph-kind data-default="Что на схеме">Что на схеме</span>',
        f'<p class="graph__caption" data-graph-caption data-default="{esc(lead)}">{esc(lead)}</p>',
        '<ul class="graph__result" data-graph-result></ul>',
        '<div class="graph__legend"><span><i class="is-group"></i>группа</span><span><i></i>часть</span>' + ('<span><i class="is-soon"></i>в разработке</span>' if soon else '') + '</div></div>',
        '</div>',
        '<div class="graph__details">', *info, '</div>',
        '</div>'])


def flow_parse(body, name):
    """src/flow.md: три «## Раздел», под каждым абзац и список «- Точка: что это» с вложенными «  - Название: файл из
    theme/assets/logos» (без файла — подпись словом). -> [(раздел, описание, [(точка, что это, [(название, файл)])])]"""
    out = []
    for chunk in re.split(r'^## ', body, flags=re.M)[1:]:
        title, _, rest = chunk.partition('\n')
        lines = rest.split('\n')
        text = ' '.join(l.strip() for l in lines if l.strip() and not l.lstrip().startswith('- '))
        nodes = []
        for l in lines:
            if l.startswith('- '):
                t, _, c = l[2:].partition(': ')
                nodes.append((t.strip(), c.strip(), []))
            elif re.match(r'\s+- ', l) and nodes:
                t, _, f = l.strip()[2:].partition(': ')
                if f.strip() and not os.path.exists(os.path.join(ROOT, 'theme', 'assets', 'logos', f.strip())):
                    errors.append(f'{name}: нет значка theme/assets/logos/{f.strip()} для «{t}»')
                nodes[-1][2].append((t.strip(), f.strip()))
        if not text or not nodes or any(not c for _, c, _ in nodes):
            errors.append(f'{name}: раздел «{title.strip()}» — нужен абзац и список «- Точка: что это»')
        out.append((title.strip(), text, nodes))
    if len(out) != 3:
        errors.append(f'{name}: разделов должно быть три — что поступает, сама система, что получается')
    return out


def flow(sections):
    """Схема в три экрана сверху вниз: что поступает → Life OS → что получается. У каждого экрана своя картинка; линия
    уходит в нижний край одной и продолжается с верхнего края следующей, поэтому экраны стоят вплотную."""
    W, CX = 600, 300
    data = lambda title, kind, cap: f'tabindex="0" role="button" data-title="{esc(title)}" data-kind="{esc(kind)}" data-caption="{esc(cap)}"'

    def fan(sec, nodes, down):
        """Точки в ряд и их источники: down — линии приходят сверху (выход), иначе уходят вниз (вход)."""
        JOIN = 70                                   # прямой отрезок линии у стыка экранов: он и есть отступ между ними
        H = 380 + JOIN if down else 350 + JOIN
        gy, d = (120 + JOIN, 1) if down else (220, -1)
        edges, marks, pulses = [], [], []
        for i, (g, cap, kids) in enumerate(nodes):
            gx = round(W * (i + 0.5) / len(nodes), 1)
            path = (f'M{CX} 0 L{CX} {JOIN} C{CX} {JOIN + 70} {gx} {gy - 70} {gx} {gy}' if down
                    else f'M{gx} {gy} C{gx} {gy + 70} {CX} {H - JOIN - 70} {CX} {H - JOIN} L{CX} {H}')
            edges.append(f'<path class="flow__edge" d="{path}"/>')
            dur = 4 + i % 3
            pulses.append(f'<circle class="graph__pulse" r="3.5" opacity="0"><animateMotion dur="{dur}s" begin="{round(i * 0.7, 1)}s" repeatCount="indefinite" path="{path}"/>'
                          f'<animate attributeName="opacity" dur="{dur}s" begin="{round(i * 0.7, 1)}s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.15;0.8;1"/></circle>')
            # Источники стоят друг под другом. На входе у каждого маленький значок и название; на выходе — только названия.
            kid = []
            if down:
                if kids:
                    edges.append(f'<line class="flow__edge" x1="{gx}" y1="{gy + 48}" x2="{gx}" y2="{gy + 80}"/>')   # от подписи точки к её списку
                for j, (t, _) in enumerate(kids):
                    y = gy + 96 + 22 * j
                    kid.append(f'<g class="flow__node flow__word" {data(t, g, cap)}><rect x="{gx - 52}" y="{y - 10}" width="104" height="20" rx="4"/><text x="{gx}" y="{y + 5}">{esc(t)}</text></g>')
            elif kids:
                icons = any(f for _, f in kids)
                wide = max(len(t) for t, _ in kids) * 7.2 + (22 if icons else 0)   # ширина столбца — по самой длинной строке
                x0 = round(gx - wide / 2, 1)
                edges.append(f'<line class="flow__edge" x1="{gx}" y1="{gy}" x2="{gx}" y2="{gy - 58}"/>')
                for j, (t, f) in enumerate(kids):
                    y = gy - 76 - 26 * (len(kids) - 1 - j)
                    icon = (f'<image href="/assets/logos/{esc(f)}" x="{x0}" y="{y - 8}" width="16" height="16"/>' if f
                            else f'<circle class="flow__ring" cx="{x0 + 8}" cy="{y}" r="5.5"/>' if icons else '')
                    label = f'<text x="{x0 + 22}" y="{y + 4.5}">{esc(t)}</text>' if icons else f'<text x="{gx}" y="{y + 4.5}">{esc(t)}</text>'
                    kid.append(f'<g class="flow__node flow__app{" flow__app--left" if icons else ""}" {data(t, g, cap)}>'
                               f'<rect x="{x0 - 4}" y="{y - 12}" width="{round(wide + 8, 1)}" height="24" rx="4"/>{icon}{label}</g>')
            marks.append(f'<g class="flow__node flow__group" {data(g, sec, cap)}><circle class="graph__halo" cx="{gx}" cy="{gy}" r="20"/><circle cx="{gx}" cy="{gy}" r="10"/>'
                         f'<text x="{gx}" y="{gy + 37}">{esc(g)}</text></g>' + ''.join(kid))
        return H, edges + pulses + marks

    def core(sec, nodes):
        """Сама система: линия проходит сверху вниз через центр, вокруг — что в ней происходит."""
        H, CY = 560, 280                            # сверху и снизу — по 70 единиц прямой линии: отступ от соседних экранов
        left = [(130, 165), (95, 280), (130, 395)]
        spots = left + [(W - x, y) for x, y in left]
        if len(nodes) > len(spots):
            errors.append(f'в разделе «{sec}» точек больше {len(spots)} — на схеме мест нет')
        path = f'M{CX} 0 L{CX} {H}'
        out = [f'<path class="flow__edge" d="{path}"/>']
        out += [f'<line class="flow__edge" x1="{CX}" y1="{CY}" x2="{x}" y2="{y}"/>' for (x, y), _ in zip(spots, nodes)]
        out.append(f'<circle class="graph__pulse" r="3.5" opacity="0"><animateMotion dur="5s" repeatCount="indefinite" path="{path}"/>'
                   f'<animate attributeName="opacity" dur="5s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.15;0.8;1"/></circle>')
        out.append(f'<circle class="graph__ring" cx="{CX}" cy="{CY}" r="68"/><circle class="graph__core" cx="{CX}" cy="{CY}" r="52"/><text class="graph__core-label" x="{CX}" y="{CY + 8}">Life OS</text>')
        out += [f'<g class="flow__node flow__part" {data(t, sec, cap)}><circle cx="{x}" cy="{y}" r="9"/><text x="{x}" y="{y + 30}">{esc(t)}</text></g>' for (x, y), (t, cap, _) in zip(spots, nodes)]
        return H, out

    hint = 'Наведите на точку или нажмите на неё — рядом появится, что это.'
    rows = []
    for n, (sec, text, nodes) in enumerate(sections, 1):
        H, body = core(sec, nodes) if n == 2 else fan(sec, nodes, n == 3)
        rows += [f'<section class="flow__row flow__row--{n}">',
                 f'<div class="flow__text"><p class="graph__label">{n:02d} из {len(sections):02d}</p><h2 class="flow__title">{esc(typo(sec))}</h2><p>{esc(text)}</p>'
                 + (f'<p class="flow__hint js-only">{esc(hint)}</p>' if n == 1 else '') + '</div>',
                 f'<div class="flow__canvas"><svg viewBox="0 0 {W} {H}" role="img" aria-label="{esc(sec)}: {esc(", ".join(t for t, _, _ in nodes))}">', *body, '</svg></div>',
                 '<div class="flow__side js-only" aria-live="polite"><span class="graph__label" data-flow-kind></span><p class="flow__caption" data-flow-caption></p></div>',
                 '</section>']
    sheet = ('<div class="sheet" data-flow-sheet aria-live="polite"><button class="sheet__close" type="button" aria-label="Закрыть">×</button>'
             '<span class="graph__label" data-sheet-kind></span><strong data-sheet-title></strong><p data-sheet-text></p></div>')
    return '\n'.join(['<div class="flow" data-flow>', *rows, sheet, '</div>'])


def benefits(lines, name):
    """Преимущества плитками: «- Заголовок: текст»."""
    out = ['<div class="tiles tiles--plain">']
    for n, l in enumerate([l for l in lines if l.startswith('- ')], 1):
        t, _, text = l[2:].partition(': ')
        if not text:
            errors.append(f'{name}: преимущество «{t}» — нужно «Заголовок: текст»')
        out.append(f'<div class="tile"><span class="tile__label"><span>{n:02d}</span></span><span class="tile__title">{esc(typo(t))}</span><span class="tile__text">{esc(text)}</span></div>')
    return '\n'.join(out + ['</div>'])


def ways(lines, name):
    """Способы получить — крупными ссылками со значком: «- Заголовок: текст | файл из theme/assets/logos | адрес».
    Вместо адреса слово «скоро» — карточка бледная и без ссылки."""
    out = ['<div class="ways">']
    for l in [l for l in lines if l.startswith('- ')]:
        parts = [x.strip() for x in l[2:].split(' | ')]
        head, _, text = parts[0].partition(': ')
        if len(parts) != 3 or not text:
            errors.append(f'{name}: способ «{head}» — нужно «Заголовок: текст | значок | адрес»')
            continue
        if not os.path.exists(os.path.join(ROOT, 'theme', 'assets', 'logos', parts[1])):
            errors.append(f'{name}: нет значка theme/assets/logos/{parts[1]} для «{head}»')
        soon = parts[2] == 'скоро'                    # ссылки ещё нет: карточка бледная и не нажимается
        tag, end = ('<div class="way way--soon">', '</div>') if soon else (f'<a class="way" href="{esc(parts[2])}">', '</a>')
        arrow = '' if soon else ' <span aria-hidden="true">→</span>'
        out.append(f'{tag}<span class="way__icon"><img src="/assets/logos/{esc(parts[1])}" alt="" width="28" height="28" loading="lazy"></span>'
                   f'<span class="way__title">{esc(typo(head))}{arrow}</span><span class="way__text">{esc(text)}</span>{end}')
    return '\n'.join(out + ['</div>'])


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
    # Первый экран — одной колонкой: подпись, заголовок, подзаголовок (hero_sub), короткое описание, кнопки; ниже друг
    # под другом граф, фильтры «для чего» и описание выбранного — так, чтобы три последних помещались на один экран.
    out = ['\n'.join(['<section class="hero">', '<div class="hero__inner">', '<div class="hero__text">',
                      f'<p class="eyebrow"><span>{esc(fm.get("kicker", ""))}</span></p>', f'<h1 class="hero__title">{esc(typo(fm.get("hero_title", "")))}</h1>',
                      *([f'<p class="hero__sub">{esc(typo(fm["hero_sub"]))}</p>'] if fm.get('hero_sub') else []),
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
            elif lines[0].strip() == '{{integrations}}':
                block = integrations(lines[1:], name)
            elif lines[0].strip() == '{{benefits}}':
                block = benefits(lines[1:], name)
            elif lines[0].strip() == '{{ways}}':
                block = ways(lines[1:], name)
            elif all(l.startswith('- ') and LINK.fullmatch(l[2:].strip()) for l in lines):
                block = actions([LINK.fullmatch(l[2:].strip()).groups() for l in lines])
            elif len(lines) == 1 and LINK.fullmatch(block.strip()):
                t, u = LINK.fullmatch(block.strip()).groups()
                block = f'<p><a class="more" href="{esc(u)}">{esc(t)}</a></p>'
            elif lines[0].strip() == '{{groups}}' and len(lines) > 1:
                block = marks['cols'](apps_by_group(lines[1:], name))
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
    files, uses, howtos, flow_sections = {}, [], [], None
    # День, когда реестр завели: строки «заведено» этого дня — учёт, а не новость, на сайт они не идут.
    born = min((ch['date'] for ch in data['changes'] if ch['text'].startswith('заведено')), default='')
    data['changes'] = [ch for ch in data['changes'] if not (ch['text'].startswith('заведено') and ch['date'] == born)]

    sources = {f: open(os.path.join(SRC, f), encoding='utf-8').read() for f in sorted(os.listdir(SRC)) if f.endswith('.md')}
    for name, text in sources.items():
        low = text.lower()
        errors.extend(f'{name}: слово с «{w}» — его на сайте быть не должно' for w in STOP if w in low)
        fm, body = split(text, name)
        if fm.get('type') == 'flow':
            flow_sections = flow_parse(body, name)
        elif fm.get('type') == 'use':
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
        'cols': lambda apps: cols(data['groups'], by_group, apps),
        'uses': tiles(uses),
        'howtos': rows_dated([(None, fm['title'], f'/kak/{fm["slug"]}/', fm['description']) for _, fm, _, _ in howtos]) if howtos else '',
    }
    kickers = {'use': 'Для кого', 'howto': 'Инструкции'}
    for name, text in sources.items():
        fm, body = split(text, name)
        if fm.get('type') == 'home':
            files['index.md'] = page('home', fm.get('slug', ''), fm.get('title', ''), fm.get('description', ''),
                                     home(fm, body, name, marks, flow(flow_sections) if flow_sections else graph(data, by_group, uses)))
            continue
        if fm.get('type') == 'flow':
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

    # Названия со сноской: звёздочка встаёт везде, где они названы, — и в текстах из реестра; сама сноска — в подвале
    # (legal_note в config.yaml). Имена файлов и адреса пишутся строчными и под правило не попадают.
    files = {name: re.sub(r'\b(Threads|Instagram)\b(?!\*)', r'\1*', text) for name, text in files.items()}
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
