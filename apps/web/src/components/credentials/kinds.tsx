import { t } from "@/lib/i18n";
import { Award, BookOpen, FileBadge, GraduationCap, Landmark, Newspaper, Presentation, UsersRound, type LucideIcon } from "lucide-react";
import type { CredentialKind } from "@/lib/api/credentials";

export const KIND_ICON: Record<CredentialKind, { icon: LucideIcon; tone: "lilac" | "sun" | "coral" | "cyan" | "mint" }> = {
  diploma: { icon: GraduationCap, tone: "lilac" },
  retraining: { icon: BookOpen, tone: "cyan" },
  method: { icon: Award, tone: "sun" },
  supervision: { icon: UsersRound, tone: "mint" },
  membership: { icon: Landmark, tone: "coral" },
  publication: { icon: Newspaper, tone: "cyan" },
  course: { icon: Presentation, tone: "sun" },
  other: { icon: FileBadge, tone: "lilac" },
};

export function KindIcon({ kind, size = 20, className }: { kind: CredentialKind; size?: number; className: string }) {
  const { icon: Icon, tone } = KIND_ICON[kind];
  return (
    <span className={className} data-tone={tone} aria-hidden>
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

/** Field labels per kind; `null` hides the field. */
export interface KindFields {
  title: string;
  titlePlaceholder: string;
  issuer: string | null;
  issuerPlaceholder?: string;
  year: string;
  yearEnd: string | null;
  supervisor: boolean;
  hours: boolean;
  number: string | null;
  links: boolean;
  hint: string;
}

export const KIND_FIELDS: Record<CredentialKind, KindFields> = {
  diploma: {
    get title() { return t("Специальность или\u00a0квалификация"); },
    get titlePlaceholder() { return t("Психолог, преподаватель психологии"); },
    get issuer() { return t("Вуз"); },
    get issuerPlaceholder() { return t("МГУ имени М. В. Ломоносова"); },
    get year() { return t("Год выпуска"); },
    yearEnd: null,
    supervisor: false,
    hours: false,
    get number() { return t("Номер диплома"); },
    links: false,
    get hint() { return t("Приложите разворот диплома с\u00a0ФИО и\u00a0печатью. Вкладыш с\u00a0оценками не\u00a0нужен."); },
  },
  retraining: {
    get title() { return t("Программа"); },
    get titlePlaceholder() { return t("Когнитивно-поведенческая терапия"); },
    get issuer() { return t("Организация"); },
    get issuerPlaceholder() { return t("Институт практической психологии"); },
    get year() { return t("Год окончания"); },
    yearEnd: null,
    supervisor: false,
    hours: true,
    get number() { return t("Номер диплома или\u00a0удостоверения"); },
    links: false,
    get hint() { return t("Подойдёт диплом о\u00a0профессиональной переподготовке или\u00a0удостоверение о\u00a0повышении квалификации."); },
  },
  method: {
    get title() { return t("Метод или\u00a0модальность"); },
    get titlePlaceholder() { return t("Схема-терапия, базовый уровень"); },
    get issuer() { return t("Кто выдал сертификат"); },
    issuerPlaceholder: "International Society of Schema Therapy",
    get year() { return t("Год"); },
    yearEnd: null,
    supervisor: false,
    hours: true,
    get number() { return t("Номер сертификата"); },
    links: false,
    get hint() { return t("Сертификат школы или\u00a0ассоциации метода."); },
  },
  supervision: {
    get title() { return t("Формат и\u00a0тема"); },
    get titlePlaceholder() { return t("Индивидуальная супервизия по\u00a0КПТ"); },
    get issuer() { return t("Организация, если есть"); },
    get issuerPlaceholder() { return t("Ассоциация когнитивно-поведенческой психотерапии"); },
    get year() { return t("С\u00a0какого года"); },
    get yearEnd() { return t("По\u00a0какой год"); },
    supervisor: true,
    hours: true,
    number: null,
    links: false,
    get hint() { return t("Справка или\u00a0письмо супервизора с\u00a0количеством часов и\u00a0периодом."); },
  },
  membership: {
    get title() { return t("Статус"); },
    get titlePlaceholder() { return t("Действительный член"); },
    get issuer() { return t("Ассоциация"); },
    get issuerPlaceholder() { return t("Российское психологическое общество"); },
    get year() { return t("С\u00a0какого года"); },
    get yearEnd() { return t("По\u00a0какой год"); },
    supervisor: false,
    hours: false,
    get number() { return t("Номер членского билета"); },
    links: true,
    get hint() { return t("Членский билет, сертификат или\u00a0ссылка на\u00a0реестр ассоциации."); },
  },
  publication: {
    get title() { return t("Название статьи или\u00a0книги"); },
    get titlePlaceholder() { return t("Тревога у\u00a0подростков: обзор исследований"); },
    get issuer() { return t("Журнал или\u00a0издательство"); },
    get issuerPlaceholder() { return t("Вопросы психологии"); },
    get year() { return t("Год публикации"); },
    yearEnd: null,
    supervisor: false,
    hours: false,
    number: null,
    links: true,
    get hint() { return t("Достаточно ссылки или\u00a0DOI. Файл\u00a0— по\u00a0желанию."); },
  },
  course: {
    get title() { return t("Название курса"); },
    get titlePlaceholder() { return t("Работа с\u00a0горем и\u00a0утратой"); },
    get issuer() { return t("Организатор"); },
    get issuerPlaceholder() { return t("Московский институт психоанализа"); },
    get year() { return t("Год"); },
    yearEnd: null,
    supervisor: false,
    hours: true,
    get number() { return t("Номер сертификата"); },
    links: false,
    get hint() { return t("Сертификат или\u00a0удостоверение об\u00a0окончании."); },
  },
  other: {
    get title() { return t("Название"); },
    get titlePlaceholder() { return t("Например, участие в\u00a0конференции"); },
    get issuer() { return t("Организация"); },
    get year() { return t("Год"); },
    yearEnd: null,
    supervisor: false,
    hours: false,
    get number() { return t("Номер документа"); },
    links: true,
    get hint() { return t("Любой документ, который подтверждает вашу квалификацию."); },
  },
};
