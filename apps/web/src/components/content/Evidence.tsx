/**
 * Evidence-based sections of article/practice pages (server-compatible, no client state):
 * evidence badge, key research facts, «Когда нужен специалист», mechanism, cautions, sources.
 * Citation markers in texts ([1]) link to #source-N anchors rendered by <Sources>.
 */
import { AlertTriangle, BookMarked, FlaskConical, HeartHandshake, Lightbulb, Phone, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import type { EvidenceLevel, KeyFact, Source } from "@/lib/api/content";
import { EVIDENCE_LEVELS } from "@/lib/api/content";
import { Cite, Markdown } from "./Markdown";
import s from "./evidence.module.css";

export function evidenceInfo(level?: EvidenceLevel | null) {
  return EVIDENCE_LEVELS.find((l) => l.value === level) ?? null;
}

const LEVEL_ICON = {
  strong: ShieldCheck,
  moderate: FlaskConical,
  limited: Sparkles,
  practice: Lightbulb,
} as const;

/** Small pill next to the title. `compact` drops the icon (cards). */
export function EvidenceBadge({ level, compact }: { level?: EvidenceLevel | null; compact?: boolean }) {
  const info = evidenceInfo(level);
  if (!info) return null;
  const Icon = LEVEL_ICON[info.value];
  return (
    <span className={s.badge} data-level={info.value} title={info.hint} data-compact={compact || undefined}>
      {!compact && <Icon size={14} strokeWidth={2} aria-hidden />}
      {compact ? info.short : info.label}
    </span>
  );
}

export function KeyFacts({ facts, title = "Главное из исследований" }: { facts?: KeyFact[]; title?: string }) {
  if (!facts?.length) return null;
  return (
    <section className={s.facts} aria-labelledby="key-facts">
      <h2 id="key-facts" className={s.sectionTitle}>
        <FlaskConical size={18} strokeWidth={1.9} aria-hidden />
        {title}
      </h2>
      <ul>
        {facts.map((f, i) => (
          <li key={i}>
            {f.text}
            <Cite refs={f.refs} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Когда нужен специалист» with an always-present crisis line. */
export function SeekHelp({ text, cta }: { text?: string; cta?: React.ReactNode }) {
  return (
    <section className={s.help} aria-labelledby="seek-help">
      <h2 id="seek-help" className={s.sectionTitle}>
        <Stethoscope size={18} strokeWidth={1.9} aria-hidden />
        Когда нужен специалист
      </h2>
      {text?.trim() && <Markdown source={text} className={s.helpText} />}
      <p className={s.crisis}>
        <Phone size={16} strokeWidth={2} aria-hidden />
        <span>
          Если вам очень плохо прямо сейчас или есть мысли причинить себе вред, звоните{" "}
          <a href="tel:112">
            <strong>112</strong>
          </a>{" "}
          — бесплатно и круглосуточно — или попросите близкого человека побыть рядом.
        </span>
      </p>
      {cta && <div className={s.helpCta}>{cta}</div>}
    </section>
  );
}

export function Mechanism({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <section className={s.block} aria-labelledby="mechanism">
      <h2 id="mechanism" className={s.sectionTitle}>
        <HeartHandshake size={18} strokeWidth={1.9} aria-hidden />
        Почему это может помочь
      </h2>
      <Markdown source={text} className={s.blockText} />
    </section>
  );
}

export function Cautions({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <section className={`${s.block} ${s.caution}`} aria-labelledby="cautions">
      <h2 id="cautions" className={s.sectionTitle}>
        <AlertTriangle size={18} strokeWidth={1.9} aria-hidden />
        Когда остановиться или пропустить
      </h2>
      <Markdown source={text} className={s.blockText} />
    </section>
  );
}

function sourceLine(src: Source) {
  const bits = [src.authors, src.year ? `(${src.year})` : null].filter(Boolean).join(" ");
  return bits;
}

/** Numbered list of verified sources + a note on what the evidence badge means. */
export function Sources({
  sources,
  level,
  reviewedAt,
}: {
  sources?: Source[];
  level?: EvidenceLevel | null;
  reviewedAt?: string | null;
}) {
  const info = evidenceInfo(level);
  if (!sources?.length && !info) return null;
  const reviewed = reviewedAt
    ? new Date(reviewedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <section className={s.sources} aria-labelledby="sources">
      <h2 id="sources" className={s.sectionTitle}>
        <BookMarked size={18} strokeWidth={1.9} aria-hidden />
        Источники
      </h2>
      {sources && sources.length > 0 ? (
        <ol className={s.sourceList}>
          {sources.map((src, i) => (
            <li key={i} id={`source-${i + 1}`}>
              <span className={s.sourceNum}>{i + 1}</span>
              <span className={s.sourceBody}>
                {sourceLine(src) && <span className={s.sourceAuthors}>{sourceLine(src)} </span>}
                <a href={src.url} target="_blank" rel="noopener noreferrer" className={s.sourceTitle} lang="en">
                  {src.title}
                </a>
                {src.publisher && <span className={s.sourceMeta}> {src.publisher}.</span>}
                {src.doi && (
                  <span className={s.sourceMeta}>
                    {" "}
                    DOI:{" "}
                    <a href={`https://doi.org/${src.doi}`} target="_blank" rel="noopener noreferrer">
                      {src.doi}
                    </a>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.note}>
          Отдельных качественных исследований этой техники пока мало, поэтому мы не ссылаемся на конкретные работы.
        </p>
      )}
      <p className={s.note}>
        {info && (
          <>
            <strong>{info.label}.</strong> {info.hint}{" "}
          </>
        )}
        Мы ссылаемся только на рецензируемые исследования, клинические руководства и официальные источники и проверяем
        каждую ссылку.{reviewed ? ` Материал проверен редакцией ${reviewed}.` : ""}
      </p>
    </section>
  );
}
