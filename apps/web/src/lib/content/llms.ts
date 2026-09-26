/**
 * llms.txt / llms-full.txt (https://llmstxt.org): a plain Markdown summary of the service and its
 * public content for AI assistants and generative search engines.
 */
import { EVIDENCE_LEVELS, type Article, type Practice, type Source } from "@/lib/api/content";
import { LEGAL_DOCS } from "@/components/legal/docs";
import { SITE_URL } from "@/lib/seo";
import { serverContent } from "./server";

const ABOUT = `# aprosop

> aprosop (${SITE_URL}) — полностью анонимный онлайн-сервис психологической помощи для людей из России. Клиент регистрируется без почты и телефона (только пароль; имя вида «тихий-кит-4821» и ключ восстановления создаются автоматически), общается с проверенными психологами в диалоге (чат) и на видеосозвонах, где вместо лица — 3D-аватар, который повторяет мимику. Распознавание мимики и фильтр голоса работают на устройстве клиента; видео идёт напрямую между браузерами (WebRTC) и не записывается. Оплата — с анонимного баланса. Сервис не оказывает экстренную помощь: в опасной ситуации нужно звонить 112.

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
  return EVIDENCE_LEVELS.find((x) => x.value === l)?.label ?? "не указана";
}

function legalSection() {
  return ["## Документы", "", ...LEGAL_DOCS.map((d) => `- [${d.title}](${SITE_URL}/legal/${d.slug}): ${d.description}`), ""].join("\n");
}

export async function buildLlmsTxt(): Promise<string> {
  const [articles, practices] = await Promise.all([serverContent.articles(), serverContent.practices()]);
  return [
    ABOUT,
    "## Статьи",
    "",
    ...articles.map((a) => `- [${a.title}](${SITE_URL}/articles/${a.slug}): ${a.summary} Сила доказательств: ${level(a.evidence_level)}.`),
    "",
    "## Практики самопомощи",
    "",
    ...practices.map((p) => `- [${p.title}](${SITE_URL}/practices/${p.slug}): ${p.summary} ${p.duration_minutes} мин.`),
    "",
    legalSection(),
    "## Optional",
    "",
    `- [Полные тексты статей и практик](${SITE_URL}/llms-full.txt)`,
    `- [Карта сайта](${SITE_URL}/sitemap.xml)`,
    "",
  ].join("\n");
}

function articleFull(a: Article) {
  const sources = a.sources ?? [];
  return [
    `## ${a.title}`,
    "",
    `URL: ${SITE_URL}/articles/${a.slug}`,
    `Тема: ${a.topic_label}. Сила доказательств: ${level(a.evidence_level)}.${a.reviewed_at ? ` Проверено редакцией: ${a.reviewed_at}.` : ""}`,
    "",
    `> ${a.summary}`,
    "",
    ...(a.key_facts?.length
      ? ["### Главное из исследований", "", ...a.key_facts.map((f) => `- ${f.text}${f.refs.length ? ` [${f.refs.join(", ")}]` : ""}`), ""]
      : []),
    a.body.replace(/^## /gm, "### "),
    "",
    ...(a.when_to_seek_help ? ["### Когда нужен специалист", "", a.when_to_seek_help, ""] : []),
    ...(sources.length ? ["### Источники", "", ...sources.map(sourceLine), ""] : []),
  ].join("\n");
}

function practiceFull(p: Practice) {
  const sources = p.sources ?? [];
  return [
    `## Практика: ${p.title}`,
    "",
    `URL: ${SITE_URL}/practices/${p.slug}`,
    `Тип: ${p.kind_label}, ${p.duration_minutes} мин. Сила доказательств: ${level(p.evidence_level)}.`,
    "",
    `> ${p.summary}`,
    "",
    "### Шаги",
    "",
    ...p.steps.map((s, i) => `${i + 1}. **${s.title}** ${s.text}`),
    "",
    ...(p.mechanism ? ["### Почему это может помочь", "", p.mechanism, ""] : []),
    ...(p.cautions ? ["### Когда остановиться или пропустить", "", p.cautions, ""] : []),
    ...(sources.length ? ["### Источники", "", ...sources.map(sourceLine), ""] : []),
  ].join("\n");
}

export async function buildLlmsFullTxt(): Promise<string> {
  const [cards, pcards] = await Promise.all([serverContent.articles(), serverContent.practices()]);
  const articles = (await Promise.all(cards.map((a) => serverContent.article(a.slug).catch(() => null)))).filter(Boolean) as Article[];
  const practices = (await Promise.all(pcards.map((p) => serverContent.practice(p.slug).catch(() => null)))).filter(Boolean) as Practice[];
  return [
    ABOUT,
    "Материалы носят справочный характер, не являются диагнозом и не заменяют консультацию специалиста. Если человеку угрожает опасность — 112.",
    "",
    "# Статьи",
    "",
    ...articles.map(articleFull),
    "# Практики",
    "",
    ...practices.map(practiceFull),
    legalSection(),
  ].join("\n");
}
