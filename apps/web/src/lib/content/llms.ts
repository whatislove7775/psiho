/**
 * llms.txt / llms-full.txt (https://llmstxt.org): a plain Markdown summary of the service and its
 * public content for AI assistants and generative search engines.
 */
import { t } from "@/lib/i18n";
import { EVIDENCE_LEVELS, type Article, type Practice, type Source } from "@/lib/api/content";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { SITE_URL } from "@/lib/seo";
import { serverContent } from "./server";
import { htmlToMarkdown } from "./htmlText";

const ABOUT = `# Aprosop

> Aprosop (${SITE_URL}) — полностью анонимный онлайн-сервис психологической помощи для людей из России. Клиент регистрируется без почты и телефона (только пароль; имя вида «тихий-кит-4821» и ключ восстановления создаются автоматически), общается с проверенными психологами в диалоге (чат) и на видеосозвонах, где вместо лица — 3D-аватар, который повторяет мимику. Распознавание мимики и фильтр голоса работают на устройстве клиента; видео идёт напрямую между браузерами (WebRTC) и не записывается. Оплата — с анонимного баланса. Сервис не оказывает экстренную помощь: в опасной ситуации нужно звонить 112.

Язык сервиса: русский. Материалы сайта (статьи и практики) доступны без регистрации, у каждой статьи есть проверенные источники и пометка о силе доказательств.

## Как это работает

- Регистрация: ${SITE_URL}/start — только пароль, без почты и телефона.
- Анонимность: специалист видит только имя на сервисе и аватар; настоящее имя, почту, телефон и изображение с камеры клиента сервис не получает (если клиент сам не включит показ лица).
- Специалисты: каждый профиль проверяется вручную (образование, опыт). Анкета для психологов: ${SITE_URL}/join
- Диалог: переписка с одним специалистом, внутри неё — запись на видеосозвоны из свободного времени специалиста, история созвонов.
- Оплата: пополнение анонимного баланса; созвоны оплачиваются с баланса, цена видна заранее.
`;

function sourceLine(s: Source, i: number) {
  const who = [s.authors, s.year ? `(${s.year})` : ""].filter(Boolean).join(" ");
  return `${i + 1}. ${who ? `${who}. ` : ""}${s.title}.${s.publisher ? ` ${s.publisher}.` : ""} ${s.url}${s.doi ? ` DOI: ${s.doi}` : ""}`;
}

function level(l?: string) {
  return EVIDENCE_LEVELS.find((x) => x.value === l)?.label ?? t("не указана");
}

function legalSection() {
  return [t("## Документы"), "", ...LEGAL_DOCS.map((d) => `- [${d.title}](${SITE_URL}/legal/${d.slug}): ${d.description}`), ""].join("\n");
}

export async function buildLlmsTxt(): Promise<string> {
  const [articles, practices] = await Promise.all([serverContent.articles(), serverContent.practices()]);
  return [
    ABOUT,
    t("## Статьи"),
    "",
    ...articles.map((a) => t(`- [{title}]({SITE_URL}/articles/{slug}): {summary} Сила доказательств: {level}.`, { title: a.title, SITE_URL, slug: a.slug, summary: a.summary, level: level(a.evidence_level) })),
    "",
    t("## Практики самопомощи"),
    "",
    ...practices.map((p) => t(`- [{title}]({SITE_URL}/practices/{slug}): {summary} {duration_minutes} мин.`, { title: p.title, SITE_URL, slug: p.slug, summary: p.summary, duration_minutes: p.duration_minutes })),
    "",
    legalSection(),
    "## Optional",
    "",
    t(`- [Полные тексты статей и практик]({SITE_URL}/llms-full.txt)`, { SITE_URL }),
    t(`- [Карта сайта]({SITE_URL}/sitemap.xml)`, { SITE_URL }),
    "",
  ].join("\n");
}

function articleFull(a: Article) {
  const sources = a.sources ?? [];
  return [
    `## ${a.title}`,
    "",
    `URL: ${SITE_URL}/articles/${a.slug}`,
    t(`Темы: {v}. Сила доказательств: {level}.{v2}`, { v: (a.topic_labels?.length ? a.topic_labels : [a.topic_label]).join(", "), level: level(a.evidence_level), v2: a.reviewed_at ? t(` Проверено редакцией: {reviewed_at}.`, { reviewed_at: a.reviewed_at }) : "" }),
    "",
    `> ${a.summary}`,
    "",
    ...(a.key_facts?.length
      ? [t("### Главное из исследований"), "", ...a.key_facts.map((f) => `- ${f.text}${f.refs.length ? ` [${f.refs.join(", ")}]` : ""}`), ""]
      : []),
    htmlToMarkdown(a.content),
    "",
    ...(a.when_to_seek_help ? [t("### Когда нужен специалист"), "", a.when_to_seek_help, ""] : []),
    ...(sources.length ? [t("### Источники"), "", ...sources.map(sourceLine), ""] : []),
  ].join("\n");
}

function practiceFull(p: Practice) {
  const sources = p.sources ?? [];
  return [
    t(`## Практика: {title}`, { title: p.title }),
    "",
    `URL: ${SITE_URL}/practices/${p.slug}`,
    t(`Тип: {kind_label}, {duration_minutes} мин. Сила доказательств: {level}.`, { kind_label: p.kind_label, duration_minutes: p.duration_minutes, level: level(p.evidence_level) }),
    "",
    `> ${p.summary}`,
    "",
    t("### Шаги"),
    "",
    ...p.steps.map((s, i) => `${i + 1}. **${s.title}** ${s.text}`),
    "",
    ...(p.mechanism ? [t("### Почему это может помочь"), "", p.mechanism, ""] : []),
    ...(p.cautions ? [t("### Когда остановиться или пропустить"), "", p.cautions, ""] : []),
    ...(sources.length ? [t("### Источники"), "", ...sources.map(sourceLine), ""] : []),
  ].join("\n");
}

export async function buildLlmsFullTxt(): Promise<string> {
  const [cards, pcards] = await Promise.all([serverContent.articles(), serverContent.practices()]);
  const articles = (await Promise.all(cards.map((a) => serverContent.article(a.slug).catch(() => null)))).filter(Boolean) as Article[];
  const practices = (await Promise.all(pcards.map((p) => serverContent.practice(p.slug).catch(() => null)))).filter(Boolean) as Practice[];
  return [
    ABOUT,
    t("Материалы носят справочный характер, не являются диагнозом и не заменяют консультацию специалиста. Если человеку угрожает опасность — 112."),
    "",
    t("# Статьи"),
    "",
    ...articles.map(articleFull),
    t("# Практики"),
    "",
    ...practices.map(practiceFull),
    legalSection(),
  ].join("\n");
}
