"""Текст статьи — HTML из визуального редактора (TipTap), очищенный по белому списку.

- sanitize_html(): единственная дверь, через которую HTML попадает в базу. Оставляет только
  разметку статьи (абзацы, H2/H3, списки, цитаты, врезки, картинки, ссылки, жирный/курсив),
  выбрасывает стили, шрифты, классы, скрипты и всё чужое; результат — корректно вложенный HTML.
- markdown_to_html(): однократный перевод старых Markdown-статей (миграция 0007, сиды).
- html_to_text(): для счётчика слов и времени чтения.
"""
import html
import re
from html.parser import HTMLParser

MAX_HTML = 300_000

# tag → как выводим. Синонимы сводим к одному виду: b → strong, h1 → h2 (h1 на странице — заголовок).
RENAME = {
    "p": "p", "h1": "h2", "h2": "h2", "h3": "h3", "h4": "h3", "h5": "h3", "h6": "h3",
    "ul": "ul", "ol": "ol", "li": "li", "blockquote": "blockquote", "aside": "aside",
    "strong": "strong", "b": "strong", "em": "em", "i": "em", "code": "code", "a": "a",
    "figure": "figure", "figcaption": "figcaption",
}
VOID = {"br", "hr", "img"}
# Вместе с содержимым: ничего из этого в статье не нужно
DROP = {
    "script", "style", "iframe", "object", "noscript", "template", "svg", "math", "head", "title",
    "textarea", "select", "button", "video", "audio", "canvas",
}
# Пустые элементы без закрывающего тега — просто пропускаем
IGNORE_VOID = {"meta", "link", "base", "input", "source", "track", "wbr", "col", "area", "param", "embed"}
FIGURE_WIDTHS = ("column", "wide")
# Картинки — только наши загрузки (ArticleImage), без хотлинков на чужие сайты
IMG_SRC = re.compile(r"^(?:https?://[a-z0-9.:-]+)?(/media/content/[0-9a-f]{32}(?:-md)?\.webp)$", re.I)


def safe_href(href: str) -> str | None:
    href = (href or "").strip()
    if not href or len(href) > 1000:
        return None
    if href.startswith("/") and not href.startswith("//"):
        return href
    if href.startswith("#") and re.fullmatch(r"#[\w-]{1,60}", href):
        return href
    if re.match(r"^https?://[^\s/]+", href, re.I):
        return href
    if re.fullmatch(r"mailto:[^\s@]+@[^\s@]+", href, re.I) or re.fullmatch(r"tel:[+\d\s()-]{3,20}", href, re.I):
        return href
    return None


def image_src(src: str) -> str | None:
    m = IMG_SRC.match((src or "").strip())
    return m.group(1) if m else None


class _Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []  # открытые (выведенные) теги
        self.skip = 0  # глубина внутри DROP
        self.skip_tag: list[str] = []

    # b с font-weight:normal — обёртка Google Docs вокруг всего текста, не жирный
    @staticmethod
    def _not_bold(attrs: dict) -> bool:
        style = (attrs.get("style") or "").replace(" ", "").lower()
        return "font-weight:normal" in style or "font-weight:400" in style

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.skip:
            if tag == self.skip_tag[-1]:
                self.skip += 1
            return
        if tag in IGNORE_VOID:
            return
        if tag in DROP:
            self.skip, self.skip_tag = 1, [tag]
            return
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag in VOID:
            self._void(tag, a)
            return
        out = RENAME.get(tag)
        if out is None or (tag == "b" and self._not_bold(a)):
            self.stack.append("")  # разворачиваем: тег убираем, текст оставляем
            return
        attr = ""
        if out == "a":
            href = safe_href(a.get("href", ""))
            if href is None:
                self.stack.append("")
                return
            attr = f' href="{html.escape(href)}"'
        elif out == "figure":
            width = a.get("data-width", "")
            attr = f' data-width="{width if width in FIGURE_WIDTHS else "column"}"'
        self.out.append(f"<{out}{attr}>")
        self.stack.append(out)

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if tag in IGNORE_VOID:
            return
        if tag in VOID:
            if not self.skip:
                self._void(tag, {k.lower(): (v or "") for k, v in attrs})
            return
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def _void(self, tag, a):
        if tag == "img":
            src = image_src(a.get("src", ""))
            if src:
                alt = " ".join((a.get("alt") or "").split())[:300]
                self.out.append(f'<img src="{html.escape(src)}" alt="{html.escape(alt)}">')
        else:
            self.out.append(f"<{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.skip:
            if tag == self.skip_tag[-1]:
                self.skip -= 1
            return
        if tag in VOID or tag in IGNORE_VOID or tag in DROP or not self.stack:
            return
        # Закрываем до ближайшего подходящего открытого тега (кривую вложенность выпрямляем)
        want = RENAME.get(tag, None)
        for i in range(len(self.stack) - 1, -1, -1):
            s = self.stack[i]
            if (want and s == want) or (not want and s == "") or (tag == "b" and s in ("", "strong")):
                for t in reversed(self.stack[i:]):
                    if t:
                        self.out.append(f"</{t}>")
                del self.stack[i:]
                return

    def handle_data(self, data):
        if not self.skip and data:
            self.out.append(html.escape(data, quote=False))

    def result(self) -> str:
        for t in reversed(self.stack):
            if t:
                self.out.append(f"</{t}>")
        self.stack = []
        return "".join(self.out)


_EMPTY = re.compile(r"<(p|h2|h3|li|blockquote|aside|strong|em|code|a|figcaption)(?: [^>]*)?>\s*</\1>")


def sanitize_html(value: str) -> str:
    value = (value or "")[:MAX_HTML]
    p = _Sanitizer()
    p.feed(value)
    p.close()
    out = p.result()
    # Пустые хвосты (<p></p> в конце) и пустые инлайн-теги
    prev = None
    while prev != out:
        prev, out = out, _EMPTY.sub(lambda m: "" if m.group(1) != "p" else m.group(0), out)
    out = re.sub(r"(?:<p>\s*(?:<br>)?\s*</p>\s*)+$", "", out)
    # Рамка без картинки (чужая картинка вычищена) не нужна
    out = re.sub(r'<figure data-width="\w+">(?:<figcaption>.*?</figcaption>)?</figure>', "", out)
    return out.strip()


def html_to_text(value: str) -> str:
    text = re.sub(r"<(?:br|/p|/h2|/h3|/li|/blockquote|/aside|/figcaption)>", "\n", value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(text)


def word_count(value: str) -> int:
    return len(html_to_text(value).split())


# ── Markdown → HTML (однократная миграция старых статей) ─────────────────────

_INLINE = re.compile(
    r"(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))"
)


def _inline(text: str) -> str:
    out = []
    for part in _INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            out.append(f"<strong>{html.escape(part[2:-2], quote=False)}</strong>")
        elif len(part) > 2 and ((part[0] == part[-1] == "*") or (part[0] == part[-1] == "_")):
            out.append(f"<em>{html.escape(part[1:-1], quote=False)}</em>")
        elif len(part) > 2 and part[0] == part[-1] == "`":
            out.append(f"<code>{html.escape(part[1:-1], quote=False)}</code>")
        else:
            m = re.fullmatch(r"\[([^\]]+)\]\(([^)\s]+)\)", part)
            if m and safe_href(m.group(2)):
                out.append(f'<a href="{html.escape(safe_href(m.group(2)))}">{html.escape(m.group(1), quote=False)}</a>')
            elif m:
                out.append(html.escape(m.group(1), quote=False))
            else:
                out.append(html.escape(part, quote=False))
    return "".join(out)


def markdown_to_html(src: str) -> str:
    """Тот же разбор, что был у Markdown-рендера сайта (components/content/Markdown.tsx)."""
    lines = (src or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    para: list[str] = []

    def flush():
        if para:
            out.append(f"<p>{_inline(' '.join(para))}</p>")
            para.clear()

    i = 0
    while i < len(lines):
        line = lines[i]
        t = line.strip()
        if not t:
            flush()
            i += 1
            continue
        h = re.match(r"^(#{1,3})\s+(.*)$", t)
        if h:
            flush()
            # "#"/"##" → h2, "###" → h3: в редакторе H2 — основной подзаголовок
            level = 2 if len(h.group(1)) <= 2 else 3
            out.append(f"<h{level}>{_inline(h.group(2))}</h{level}>")
            i += 1
            continue
        if re.fullmatch(r"-{3,}|\*{3,}", t):
            flush()
            out.append("<hr>")
            i += 1
            continue
        if t.startswith(">"):
            flush()
            q = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                q.append(re.sub(r"^>\s?", "", lines[i].strip()))
                i += 1
            out.append(f"<blockquote><p>{_inline(' '.join(q))}</p></blockquote>")
            continue
        ul = re.match(r"^[-*•]\s+", t)
        ol = re.match(r"^\d+[.)]\s+", t)
        if ul or ol:
            flush()
            rx = re.compile(r"^[-*•]\s+" if ul else r"^\d+[.)]\s+")
            items: list[str] = []
            while i < len(lines):
                ln = lines[i].strip()
                if rx.match(ln):
                    items.append(rx.sub("", ln))
                elif ln and items and re.match(r"^\s{2,}", lines[i]) and not re.match(r"^([-*•]|\d+[.)])\s+", ln):
                    items[-1] += " " + ln
                else:
                    break
                i += 1
            tag = "ul" if ul else "ol"
            out.append(f"<{tag}>" + "".join(f"<li><p>{_inline(x)}</p></li>" for x in items) + f"</{tag}>")
            continue
        para.append(t)
        i += 1
    flush()
    return "".join(out)
