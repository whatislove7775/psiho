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
    title: "Специальность или квалификация",
    titlePlaceholder: "Психолог, преподаватель психологии",
    issuer: "Вуз",
    issuerPlaceholder: "МГУ имени М. В. Ломоносова",
    year: "Год выпуска",
    yearEnd: null,
    supervisor: false,
    hours: false,
    number: "Номер диплома",
    links: false,
    hint: "Приложите разворот диплома с ФИО и печатью. Вкладыш с оценками не нужен.",
  },
  retraining: {
    title: "Программа",
    titlePlaceholder: "Когнитивно-поведенческая терапия",
    issuer: "Организация",
    issuerPlaceholder: "Институт практической психологии",
    year: "Год окончания",
    yearEnd: null,
    supervisor: false,
    hours: true,
    number: "Номер диплома или удостоверения",
    links: false,
    hint: "Подойдёт диплом о профессиональной переподготовке или удостоверение о повышении квалификации.",
  },
  method: {
    title: "Метод или модальность",
    titlePlaceholder: "Схема-терапия, базовый уровень",
    issuer: "Кто выдал сертификат",
    issuerPlaceholder: "International Society of Schema Therapy",
    year: "Год",
    yearEnd: null,
    supervisor: false,
    hours: true,
    number: "Номер сертификата",
    links: false,
    hint: "Сертификат школы или ассоциации метода.",
  },
  supervision: {
    title: "Формат и тема",
    titlePlaceholder: "Индивидуальная супервизия по КПТ",
    issuer: "Организация, если есть",
    issuerPlaceholder: "Ассоциация когнитивно-поведенческой психотерапии",
    year: "С какого года",
    yearEnd: "По какой год",
    supervisor: true,
    hours: true,
    number: null,
    links: false,
    hint: "Справка или письмо супервизора с количеством часов и периодом.",
  },
  membership: {
    title: "Статус",
    titlePlaceholder: "Действительный член",
    issuer: "Ассоциация",
    issuerPlaceholder: "Российское психологическое общество",
    year: "С какого года",
    yearEnd: "По какой год",
    supervisor: false,
    hours: false,
    number: "Номер членского билета",
    links: true,
    hint: "Членский билет, сертификат или ссылка на реестр ассоциации.",
  },
  publication: {
    title: "Название статьи или книги",
    titlePlaceholder: "Тревога у подростков: обзор исследований",
    issuer: "Журнал или издательство",
    issuerPlaceholder: "Вопросы психологии",
    year: "Год публикации",
    yearEnd: null,
    supervisor: false,
    hours: false,
    number: null,
    links: true,
    hint: "Достаточно ссылки или DOI. Файл — по желанию.",
  },
  course: {
    title: "Название курса",
    titlePlaceholder: "Работа с горем и утратой",
    issuer: "Организатор",
    issuerPlaceholder: "Московский институт психоанализа",
    year: "Год",
    yearEnd: null,
    supervisor: false,
    hours: true,
    number: "Номер сертификата",
    links: false,
    hint: "Сертификат или удостоверение об окончании.",
  },
  other: {
    title: "Название",
    titlePlaceholder: "Например, участие в конференции",
    issuer: "Организация",
    year: "Год",
    yearEnd: null,
    supervisor: false,
    hours: false,
    number: "Номер документа",
    links: true,
    hint: "Любой документ, который подтверждает вашу квалификацию.",
  },
};
