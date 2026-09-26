# aprosop API v1 — контракт фронт ↔ бэк

База: `/api/v1`. JSON. Авторизация: `Authorization: Bearer <access>` (SimpleJWT,
access 2ч, refresh 30д с ротацией). Ошибки: `{ "detail": "Человекочитаемое сообщение" }`
или DRF-ошибки полей `{ "field": ["..."] }`. Время — ISO 8601 с таймзоной (UTC).
Деньги — целые рубли (`*_rub`). Фронтовые типы: `apps/web/src/lib/api/types.ts`.

## Объекты

```ts
AvatarConfig = object // JSON, схема apps/web/src/lib/avatar/schema.ts; бэк хранит как есть (≤ 8 КБ)

User {
  id: uuid; alias: string; role: "client" | "psychologist" | "admin";
  avatar_config: AvatarConfig | null; has_email: boolean; created_at: string;
  psychologist: PsychologistPrivate | null   // только для role=psychologist
}

PsychologistPublic {
  id: number; display_name: string; bio: string; approach: string;
  specializations: string[]; languages: string[]; experience_years: number;
  session_rate_rub: number; avatar_config: AvatarConfig | null;
  photo_url: string | null;   // настоящее фото специалиста, "/media/specialists/<random>.webp" (512×512), null если не загружено
  sessions_count: number; next_slot: string | null;
  // session_rate_rub = цена самого короткого созвона специалиста («от …»), синхронизируется с ценой часа
  booking: { hourly_rate_rub: number; min_duration: number; max_duration: number;
             durations: { minutes: number; price_rub: number }[] }
  gender: "" | "female" | "male";   // необязательно, задаёт специалист (PATCH psychologist/profile/); фильтр поиска
}
PsychologistPrivate = PsychologistPublic & {
  verification_status: "pending" | "approved" | "rejected" | "suspended"
}

Slot { start: string; end: string }
ScheduleRule { weekday: 0..6 /* 0 = понедельник */; start_time: "HH:MM"; end_time: "HH:MM" }

Session {
  id: uuid; status: "awaiting_payment" | "paid" | "in_progress" | "completed" | "cancelled" | "refunded";
  scheduled_at: string; duration_minutes: number /* 50…180 */; amount_rub: number;
  room_id: uuid; can_join: boolean;          // true за 10 мин до начала и до конца созвона
  psychologist: { id: number; display_name: string; avatar_config: AvatarConfig | null; photo_url: string | null };
  client: { alias: string; avatar_config: AvatarConfig | null };
  payment_url: string | null
}
```

## Авторизация — `/auth/`

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `anonymous/` | `{ password }` | `{ access, refresh, user, recovery_key }` — клиент **без email**; `alias` генерируется (`тихий-кит-4821`), `recovery_key` показывается один раз |
| POST | `register/psychologist/` | `{ email, password, display_name, bio, specializations[], session_rate_rub, experience_years }` | `{ access, refresh, user }` (status pending) |
| POST | `login/` | `{ login, password, otp? }` — `login` = alias или email; `otp` — код TOTP для сотрудников с 2FA | `{ access, refresh, user }`; без/с неверным кодом → `400 { detail, otp_required: true }` |
| POST | `recover/` | `{ alias, recovery_key, new_password }` | `{ access, refresh, user, recovery_key }` (новый ключ) |
| POST | `token/refresh/` | `{ refresh }` | `{ access, refresh }` |
| GET | `me/` | — | `User` |
| PATCH | `me/` | `{ avatar_config? }` | `User` |
| POST | `me/password/` | `{ old_password, new_password }` | `204` |
| POST | `me/delete/` | `{ password }` | `204` — полное удаление аккаунта, диалогов и созвонов |

## Специалисты

| Метод | Путь | Ответ |
|---|---|---|
| GET | `psychologists/?<фильтры поиска>` | `PsychologistPublic[]` (только approved). Фильтры — как у `search/` (без `limit`); старые `specialization`, `max_rate` работают |
| GET | `psychologists/search/?q=&topic=&topic=&approach=&max_rate=&when=&duration=&min_experience=&gender=&language=&sort=&tz=&limit=8` | `{ count, results: PsychologistPublic[] }` — палитра поиска. `q` — слова ищутся по началу слов в имени, темах, подходе, «о себе», языках (грубый стемминг: «тревожность» → «Тревога»; аббревиатуры подходов «кпт»; забытая раскладка «nhtdjuf» → «тревога»), все слова обязательны. `topic` (повтор или `topics=a,b`) — любая из тем. `approach` — ключ из `popular-requests.approaches`. `max_rate` — цена самой короткой сессии или выбранной `duration`. `when`: `today` \| `3days` \| `evening` (начало ≥ 18:00) \| `weekend` — в ближайшие 14 дней по поясу клиента `tz` (IANA, по умолчанию Москва). `duration` — специалист разрешает эту длительность; `next_slot` тогда считается для неё. `gender`: `female` \| `male`. `sort`: `relevance` (по умолчанию) \| `soon` \| `price` \| `experience`. Ближайшее время для всех считается пакетно (число SQL-запросов не зависит от числа специалистов). Запросы не сохраняются. Троттлинг `SEARCH_THROTTLE_RATE` (240/min). 400 с `detail` на неверный параметр |
| GET | `psychologists/popular-requests/` | `{ popular: {label,count}[] /* «Часто ищут»: частые запросы, с которыми работают специалисты */, topics: {label,count}[], approaches: {value,label,count}[], languages: {label,count}[], durations: number[], genders: {value,count}[], price: {min,max}, when: {value,label}[] }` — кэш 5 минут, только по одобренным специалистам |
| GET | `psychologists/{id}/` | `PsychologistPublic` |
| GET | `psychologists/{id}/available-starts/?duration=90&from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ duration_minutes, price_rub, durations: {minutes, price_rub}[], horizon_until, starts: string[] /* UTC ISO */ }` — свободные начала для длительности: расписание (шаблоны, особые дни, отпуск) минус сессии ± буфер, с учётом минимального времени до записи и горизонта. Даты — в поясе специалиста; по умолчанию сегодня…горизонт, duration — самая короткая. 400 если длительность не разрешена |
| GET | `psychologists/{id}/slots/?from=YYYY-MM-DD&days=14` | `Slot[]` — устарело: то же для самой короткой длительности |

## Кабинет психолога — `/psychologist/`

| Метод | Путь | Тело / Ответ |
|---|---|---|
| GET/PATCH | `profile/` | `PsychologistPrivate` (редактируемые: display_name, bio, approach, specializations, languages, experience_years, session_rate_rub) |
| POST | `photo/` | multipart: `photo` (JPEG/PNG/WebP, ≤ 5 МБ, сторона ≥ 200 px), `crop?` = JSON `{x, y, size}` — доли: x/y — левый верхний угол от ширины/высоты, size — сторона от min(w, h), 0.1…1; без него центральный квадрат → `{ photo_url }`. Сервер поворачивает по EXIF, обрезает до квадрата, сжимает до 512×512 WebP и удаляет метаданные; старое фото удаляется. 400 `{detail}` на плохой файл, 30 загрузок в час |
| DELETE | `photo/` | 204 (идемпотентно) |
| GET/PUT | `schedule/` | устарело: `ScheduleRule[]` постоянного шаблона (PUT заменяет его правила) |
| GET/PUT | `availability/` | `AvailabilitySettings` (см. ниже). PUT частичный: любые поля; `templates`, если переданы, заменяются целиком |
| GET | `availability/calendar/?from=&to=` | `{ time_zone, today, days: { date, source: "template"\|"override"\|"time_off"\|"none", has_override, time_off_id, ranges: Range[], sessions: Range[] }[] }` (≤120 дней) |
| PUT/DELETE | `availability/overrides/{YYYY-MM-DD}/` | PUT `{ ranges: Range[] }` — особый график на дату (`[]` = выходной); DELETE — вернуть как в шаблоне (204) |
| GET/POST | `availability/time-off/` | `TimeOff[]` (текущие и будущие) / POST `{ start_date, end_date, note? }` → `TimeOff` |
| DELETE | `availability/time-off/{id}/` | 204 |

```ts
Range { start: "HH:MM"; end: "HH:MM" /* до "24:00" */ }
AvailabilitySettings {
  time_zone: string;                 // IANA, по умолчанию SCHEDULE_TIME_ZONE (Europe/Moscow)
  min_duration: number; max_duration: number; durations: number[];   // из 50,60,80,90,120,150,180
  allowed_durations: number[];       // durations в пределах [min, max] — их видит клиент
  buffer_minutes: number;            // перерыв между созвонами
  min_notice_minutes: number;        // запись не позднее чем за … до начала
  horizon_days: number;              // насколько вперёд открыта запись
  start_step_minutes: 15 | 30 | 60;  // сетка начал (+ «сразу после созвона и перерыва»)
  hourly_rate_rub: number;           // цена часа; цена созвона = час × мин/60, округление до 10 ₽
  prices: { minutes, price_rub }[]; platform_fee_percent: number;
  templates: { id, valid_from: date|null, valid_until: date|null, days: Range[][7] /* 0 = пн */ }[];
  options: { durations, buffer_minutes, min_notice_minutes, horizon_days, start_step_minutes }
}
TimeOff { id; start_date; end_date; note }
```
Правило дня: отпуск → ничего; особый день → его интервалы; иначе шаблон, покрывающий дату, с самой поздней `valid_from`.
| GET | `stats/` | `{ upcoming: number; sessions_month: number; sessions_total: number; earnings_month_rub: number; earnings_total_rub: number; clients_total: number }` |

## Созвоны — `/sessions/`

Созвон (бывшая «сессия», модель `ConsultationSession`) всегда живёт внутри диалога пары — новые записи создавайте через `/dialogues/`. `Session` дополнительно содержит `dialogue_id` и `conversation_id` (это один и тот же id: диалог = чат пары).

| Метод | Путь | Тело / Ответ |
|---|---|---|
| GET | `` | `Session[]` своей роли, новые сверху |
| POST | `book/` | `{ psychologist_id, scheduled_at, duration_minutes? }` → `Session` (`payment_url` если нужна оплата; без YooKassa в настройках — сразу `paid`). `scheduled_at` должен быть из `available-starts`; сумма = цена часа × длительность, до 10 ₽. Двойная запись на одно начало невозможна (уникальный индекс + блокировка профиля) → 400 |
| GET | `{id}/` | `Session` |
| POST | `{id}/cancel/` | `Session` — по правилам отмены диалогов (см. ниже), в ленту диалога уходит карточка |
| POST | `{id}/join/` | `{ room_id, ws_token, role: "client"\|"psychologist", peer: { name, avatar_config, photo_url? }, conversation_id, dialogue_id }` (`conversation_id` — чат диалога для панели чата в звонке) (`photo_url` — только когда собеседник специалист); 403 если `can_join=false` |
| POST | `{id}/complete/` | `Session` |

## Админ — `/admin-panel/`

| Метод | Путь | Ответ |
|---|---|---|
| GET | `psychologists/?status=pending` | `PsychologistPrivate[]` + `created_at` |
| POST | `psychologists/{id}/verify/` | `{ status: "approved"\|"rejected"\|"suspended" }` → `PsychologistPrivate` |
| GET | `stats/` | `{ clients, psychologists, pending, sessions_today, sessions_month, revenue_month_rub }` |
| GET | `sessions/` | `Session[]` последние 100 |

Устаревший раздел: права теперь по матрице персонала (`specialists.view`, `specialists.verify`, `dashboard.revenue`, `sessions.view`), решение `verify/` пишется в журнал. Новый код использует `/staff/`.

## Консоль персонала — `/staff/`

Роли: `owner` (суперпользователь из `ADMIN_LOGIN`), `admin`, `moderator`, `support`, `developer`, `editor`.
Все сотрудники — `User.role = "admin"` + запись `StaffMember` с ролью. Без записи: superuser → owner, `role=admin`/`is_staff` → admin.
Матрица прав — `apps/staff/roles.py` (`PERMISSIONS`), в коде: `has_staff_perm(user, "content.edit")`, DRF: `StaffPerm("reports.resolve")`.
Все эндпоинты: 401 без токена, 403 без права (`{ detail, code: "staff_forbidden" }`), 403 `password_change_required` пока не сменён одноразовый пароль,
403 `totp_setup_required` для owner/admin без 2FA при `STAFF_REQUIRE_2FA=1`. Троттлинг: 300 чтений / 60 изменений в минуту. Каждое изменение — запись в журнале.
Списки: `?page=` → `{ count, page, pages, results[] }` (25 на страницу, журнал — 50).

| Метод | Путь | Право | Ответ / тело |
|---|---|---|---|
| GET | `me/` | любой сотрудник | `{ user_id, alias, role, role_label, permissions[], totp_enabled, totp_required, must_change_password, badges{reports?,specialists?,support?} }` |
| POST | `me/password/` | любой | `{ old_password, new_password(≥12) }` → `{ access, refresh, user }` (прочие сеансы завершаются) |
| POST | `me/2fa/setup/` | любой | `{ secret, otpauth_url }` |
| POST | `me/2fa/enable/` · `me/2fa/disable/` | любой | `{ code }` → `{ totp_enabled }` |
| GET | `dashboard/` | `dashboard.view` | `{ users, specialists, sessions, reports, support, revenue\|null, series[14], system\|null, recent_audit\|null }` |
| GET | `users/?q=&role=&status=active\|blocked` | `users.view` | `StaffUserRow` (без email; `has_email` только владельцу) |
| GET | `users/{uuid}/` | `users.view` | + `sessions`, `reports_received`, `reports_sent`, `history` |
| POST | `users/{uuid}/block/` · `unblock/` | `users.block` | `{ reason }` — блок: `is_active=false`, отзыв всех токенов |
| POST | `users/{uuid}/logout/` | `users.logout` | мгновенный отзыв access/refresh токенов |
| GET | `specialists/?status=&q=` | `specialists.view` | `StaffSpecialist[]` + `counts`; `documents` — только наличие |
| GET/PATCH | `specialists/{id}/` | view / `specialists.edit` | PATCH: `display_name, bio, approach, specializations, languages, experience_years, session_rate_rub` |
| POST | `specialists/{id}/decision/` | verify / suspend | `{ decision: approve\|reject\|suspend\|reinstate, reason }` (reason обязателен для reject/suspend) |
| GET | `sessions/?status=a,b&from=&to=&q=` | `sessions.view` | `StaffSessionRow` (деньги сплита — при `dashboard.revenue`) |
| GET | `sessions/{uuid}/` | `sessions.view` | + `events[]` (без содержимого), `reports` |
| POST | `sessions/{uuid}/cancel/` | `sessions.cancel` (+`sessions.refund`) | `{ reason, refund }` — возврат через ЮKassa (или отметка в dev) |
| GET | `reports/?status=active\|open\|in_review\|resolved\|dismissed` | `reports.view` | `StaffReport[]` + `counts` |
| POST | `reports/{id}/assign/` | `reports.resolve` | → `in_review` |
| POST | `reports/{id}/resolve/` | `reports.resolve` | `{ status: resolved\|dismissed, action: none\|warn\|block_user\|suspend_specialist\|cancel_session, note }` |
| GET | `audit/?category=&action=&actor=&target_type=&target_id=&q=` | `audit.view` | `AuditEntry[]` (только чтение) |
| GET | `system/` | `system.view` | `{ health{db,cache,channels}, version{commit,…}, migrations, errors{total,hourly[24],recent}, integrations, security, counts }` |
| GET/POST | `members/` | `staff.view` / `staff.manage` | GET `{ results, roles[{value,label,manageable}], matrix }`; POST `{ login, role, note }` → `{ member, one_time_password }` |
| PATCH | `members/{user_id}/` | `staff.manage` | `{ role?, note? }` (admin не выдаёт admin/owner; owner не изменяем) |
| POST | `members/{user_id}/deactivate/` · `activate/` · `reset-password/` · `reset-2fa/` | `staff.manage` | `{ member, one_time_password? }` |

Версия в `system/`: env `GIT_COMMIT`, `APP_VERSION`, `BUILD_TIME` или файл `apps/api/BUILD_INFO(.json)`.

## Лаборатория — `/lab/`

Тестовые звонки без записи и оплаты (страница `/admin/lab`). Отдельная модель `lab.TestRoom`, не `ConsultationSession`,
поэтому комнаты не попадают в статистику, выручку, выплаты, списки сессий и специалистов. Комната живёт 2 часа
(или до закрытия), не больше 5 активных на сотрудника (старые закрываются сами), истёкшие больше суток назад удаляются.

| Метод | Путь | Право | Ответ / тело |
|---|---|---|---|
| GET | `rooms/` | `lab.use` | `{ results: TestRoom[], ttl_minutes }` — только свои активные |
| POST | `rooms/` | `lab.use` | `{ label?, client_avatar? }` → `201 TestRoom` (в журнал: `lab.room.create`) |
| POST | `rooms/{uuid}/close/` | `lab.use` | `TestRoom` (только своя; `lab.room.close`) |
| POST | `join/` | без входа | `{ token }` → `{ room_id, ws_token, role, peer, test_room{ id, label, created_at, expires_at, client_avatar } }`; 403 плохой токен, 410 комната закрыта/истекла; 60/мин с IP |

`TestRoom`: `{ id, label, created_at, expires_at, is_active, has_client_avatar, tokens{ client, psychologist } }`.
Ссылка входа: `/room/{id}?lab=<token>` — обычная страница комнаты в тестовом режиме. Токен подписан отдельной солью
(`aprosop-lab-join`), живёт ≤ 2 часов и открывает только эту тестовую комнату; `ws_token` выдаётся на её собственный
канал сигналинга (`user_id = "lab:<room>:<role>"`), к настоящим сессиям доступа не даёт.

## Жалобы — `/reports/`

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `` | `{ target_type: user\|specialist\|session\|message, target_id, reason, comment? }` | `201 ReportPublic` (повтор открытой — `200` той же); сессия/сообщение — только участник; 20/час |
| GET | `mine/` | — | `ReportPublic[]` |

`reason`: `abuse, harassment, spam, fraud, unprofessional, inappropriate, safety, other`. `target_id`: alias или UUID (user), id профиля (specialist), UUID (session), id сообщения чата (message). Текст сообщения в жалобу не попадает.

## WebSocket сигналинг

`wss://<host>/ws/signaling/<room_id>/?token=<ws_token>` — `ws_token` из `join/`
(подпись `django.core.signing`, 3 часа, содержит user_id, room_id, role).
Без валидного токена — close 4001. Максимум 2 участника. Сообщения прежние:
`ready | offer | answer | ice-candidate | bye`, сервер шлёт `peer-joined | peer-left`.

## Статьи и практики — `/content/`

Чтение публичное (без токена), показываются только опубликованные материалы.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/content/topics/` | `[{ value, label, count }]` — темы, в которых есть статьи |
| GET | `/content/articles/?topic=&tag=&limit=&exclude=<slug>&q=` | Карточки статей без `body`: `id, slug, title, summary, topic, topic_label, tags, cover, emoji, reading_minutes, author_name, published_at, updated_at, evidence_level`. `q` — поиск по словам в заголовке, описании и тегах (без учёта регистра) |
| GET | `/content/articles/<slug>/` | Статья целиком: `body` в Markdown + `key_facts: [{ text, refs: [int] }]`, `when_to_seek_help` (Markdown), `sources: [{ title, url, authors?, year?, publisher?, doi?, kind? }]`, `reviewed_at` (дата) |
| GET | `/content/practices/?kind=&limit=` | Карточки практик: `id, slug, title, summary, kind, kind_label, duration_minutes, cover, emoji, evidence_level, updated_at` |
| GET | `/content/practices/<slug>/` | + `steps: [{ title, text, seconds? }]`, `pattern: { inhale, hold, exhale, hold_after, cycles } \| null`, `mechanism`, `cautions` (Markdown), `sources`, `reviewed_at` |

Доказательность: `evidence_level` — `strong | moderate | limited | practice | ""`. Метки `[1]`, `[1, 2]` в `body`, `when_to_seek_help`, `mechanism`, `cautions` и `key_facts[].refs` — номера (с 1) в списке `sources`. Ссылки источников — только `http(s)`; CMS отклоняет `refs`, которых нет в списке. Каждую ссылку редактор открывает и проверяет вручную.

`cover` — пастель из токенов: `peach | butter | lime | mint | lilac | sky`.
`topic`: `anxiety | mood | stress | sleep | relationships | self | loss | therapy`.
`kind`: `breathing | grounding | body | journaling | mindfulness`.

Редактирование (право персонала `content.edit`: owner, admin, editor; проверка в `apps/content/permissions.py`):

| Метод | Путь | Описание |
|---|---|---|
| GET, POST | `/content/manage/articles/` | Все статьи, включая черновики (+ `body, is_published, created_at, updated_at`); создание |
| GET, PATCH, DELETE | `/content/manage/articles/<id>/` | При первой публикации `published_at` ставится автоматически |
| GET, POST | `/content/manage/practices/` | Все практики (+ `order, is_published, …`) |
| GET, PATCH, DELETE | `/content/manage/practices/<id>/` | |

Стартовые материалы (12 статей, 8 практик) создаются миграцией `content/0002`; версии с источниками (`content/0004`) заменяют только нетронутые в CMS материалы (сверка по отпечаткам прежних стартовых текстов в `apps/content/seed_history.py`). Повторно — `manage.py seed_content [--overwrite]`. Проверенные источники — `apps/content/sources.py`.

Публичные SEO-страницы Next.js (`/articles`, `/articles/<slug>`, `/practices`, `/practices/<slug>`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`) читают этот API на сервере через `INTERNAL_API_URL` (в docker-compose — `http://api:8000/api/v1`, заголовок `Host: aprosop.ru`) и кэшируют ответы на 5 минут.

## Чаты — `/chat/`

Виды разговоров: `specialist` (клиент↔специалист — это и есть диалог, см. «Диалоги»; без записи — при `CHAT_ALLOW_WITHOUT_BOOKING=True`, по умолчанию, с антиспам-лимитами),
`client_support`, `specialist_support`, `ai` (клиент↔Тиша). Персонал с правом `support.inbox` видит только разговоры с поддержкой.
Текст, имена файлов и файлы шифруются (Fernet, `CHAT_ENCRYPTION_KEY`); файлы лежат в БД и отдаются только через API.

| Метод | Путь | Описание |
|---|---|---|
| GET | `conversations/` (`?scope=support` — входящие поддержки) | список `Conversation` |
| POST | `conversations/` `{with:"support"}` \| `{with:"specialist",psychologist_id}` \| `{with:"client",client_alias}` | найти или создать (201/200) |
| GET/PATCH | `conversations/{id}/` PATCH `{retention?:"forever"\|"24h"\|"1h", screen_protect?:bool}` | «Исчезающие сообщения» (выкл / 1 день / 1 час, только для новых сообщений; истёкшие API не отдаёт сразу, `purge_chats` удаляет физически) и «Защита от скриншотов» для обеих сторон. Меняет клиент (в `specialist_support` — специалист); обе стороны видят системное сообщение (`retention:*`, `screen:on\|off`) |
| POST | `conversations/{id}/read/`, `conversations/{id}/clear/` | прочитано; очистить историю у себя |
| GET | `conversations/{id}/messages/?before=<msg id>&limit=40` | `{results: Message[] (по возрастанию), has_more}` |
| POST | `conversations/{id}/messages/` JSON `{text}` или multipart `{kind:"voice", file, duration_ms, peaks(JSON)}` / `{kind:"file", file}` | файлы — только специалист/поддержка: pdf, doc(x), xls(x), pptx, odt, rtf, txt, png, jpg, webp, gif, mp3, ≤20 МБ; голосовые webm/ogg/mp4 ≤10 мин. Лимит `CHAT_SEND_RATE` |
| PATCH | `messages/{id}/` `{text}` | только своё текстовое, ставит `edited_at` |
| POST | `messages/{id}/delete/` `{for:"me"\|"all"}` | `all` — только своё: текст и файл стираются, остаётся `deleted: true` |
| GET | `messages/{id}/attachment/` | расшифрованный файл, `Cache-Control: private, no-store` |
| GET | `contacts/`, `unread/` | с кем можно начать чат; `{total, support}` |
| POST | `ws-token/` | `{token}` для WebSocket (1 час) |
| GET | `ai/` | `{name, enabled, consent, conversation_id, daily_limit, used_today, remaining_today}` |
| POST/DELETE | `ai/consent/` | дать/отозвать согласие (создаёт разговор с приветствием) |
| POST | `ai/reply/` `{text}` | `text/event-stream`: `user_message` → `delta`* → `done` (или `replace` при отказе, `error`). 503 `ai_unavailable` без ключа, 403 `consent_required`, 429 `ai_limit` |

`Conversation`: `{id, kind, my_role, counterpart{type,name,avatar_config,psychologist_id?}, retention, retention_changed_at,
can_change_retention, screen_protect, can_send_files, unread, last_message{text,created_at,sender_role,kind}, last_message_at, peer_read_at}`.
`Message`: `{id, conversation, kind: text|voice|file|system, sender_role, text, system_code, card (карточка созвона для system «call:*», иначе null), attachment{name,mime,size,duration_ms,peaks}, created_at, edited_at, deleted, expires_at, mine}`.

WebSocket `/ws/chat/?token=…`: сервер шлёт `ready`, `message.new`, `message.updated`, `message.hidden`, `conversation.updated`,
`conversation.cleared`, `typing`, `read`, `dialog.updated` (изменились созвоны диалога — перезапросите `/dialogues/{id}/`); клиент — `{type:"typing"|"read", conversation}`, `{type:"ping"}`.
Истёкшие сообщения (режим 24 ч) удаляет `manage.py purge_chats` (сервис `scheduler`, каждые 5 минут).

## Диалоги — `/dialogues/`

Диалог — единое пространство пары «клиент — специалист»: чат (`Conversation kind=specialist`, id диалога = id разговора)
+ созвоны этой пары (`/sessions/`), предложения времени, файлы, личные заметки специалиста. Видят только двое участников:
сотрудникам и посторонним — 404 (не раскрываем существование). Сообщения отправляются через `/chat/`.

| Метод | Путь | Тело / Ответ |
|---|---|---|
| GET | `` | `DialogItem[]`: диалоги со специалистами/клиентами + закреплённые «Поддержка» и «Тиша» (клиенту). Пока разговора нет, у них `id: "support"\|"ai"`, `conversation_id: null` |
| POST | `` | клиент `{psychologist_id}` — начать диалог без записи (лимит `DIALOG_NEW_PER_DAY`=5 новых за сутки → 429); специалист `{client_alias}` — только со своим клиентом → `DialogDetail` (201/200) |
| POST | `book/` | клиент `{psychologist_id, scheduled_at, duration_minutes?}` — запись из профиля: диалог создаётся вместе с созвоном → `CallInfo + dialogue_id` |
| GET | `{id}/` | `DialogDetail` |
| GET | `{id}/starts/?duration=` | свободные начала специалиста диалога: `{duration_minutes, price_rub, durations, horizon_until, starts}` |
| POST | `{id}/calls/` | клиент `{scheduled_at, duration_minutes?}` → `CallInfo` (201). С `apps.billing` — сразу заморозка с баланса (`paid`), не хватает денег → `awaiting_payment`, `pay_mode:"balance"` (оплата `PayForCall`); без него — прежняя оплата по ссылке (`payment_url`) |
| POST | `{id}/calls/{call_id}/reschedule/` | `{scheduled_at}` → `CallInfo`. Клиент — не позднее чем за `free_cancel_hours` до начала, специалист — до начала |
| POST | `{id}/calls/{call_id}/cancel/` | `{call, refund: "full"\|"partial"\|"none", late}`. Клиент позже `free_cancel_hours` — штраф по правилам `apps.billing`; отмена специалистом — полный возврат |
| POST | `{id}/proposals/` | специалист `{scheduled_at, duration_minutes?}` → `Proposal` (карточка в ленте) |
| POST | `{id}/proposals/{pid}/accept/` | клиент → `CallInfo` (созвон назначен и оплачивается как при записи) |
| POST | `{id}/proposals/{pid}/close/` | клиент отклоняет / специалист отзывает → `Proposal` |
| GET/PUT | `{id}/note/` | только специалист: `{text}` ≤ 10 000 символов, хранится зашифрованным → `{text, updated_at}` |

```ts
DialogItem {
  id; conversation_id; kind: "specialist" | "support" | "ai"; pinned; my_role: "client" | "specialist";
  counterpart { type, name, avatar_config, psychologist_id?, photo_url? };   // клиента — только псевдоним и аватар
  last_message { text, created_at, sender_role, kind, card? } | null; last_message_at; unread; retention;
  next_call: CallInfo | null; calls_count; status: "live" | "scheduled" | "awaiting_payment" | "proposal" | "open";
}
DialogDetail = DialogItem & { conversation: Conversation; calls: CallInfo[]; proposals: Proposal[];
  files: {message_id, name, mime, size, created_at, mine}[]; booking {hourly_rate_rub, min_duration, max_duration, durations};
  rules {free_cancel_hours, late_penalty_percent, first_messages}; pay_mode; can_book; can_propose;
  first_messages_left: number | null }   // сколько сообщений клиент может отправить до ответа специалиста
CallInfo { id, status, scheduled_at, duration_minutes, amount_rub, can_join, ends_at, free_until, completed_at,
  actual_minutes?, can_cancel, can_reschedule, late_cancel, payment_url?, pay_mode? }
Proposal { id, status: "pending" | "accepted" | "declined" | "withdrawn" | "expired", scheduled_at, duration_minutes, price_rub, session_id }
```

Карточки в ленте (системные сообщения `call:*`, поле `card`): `booked`, `rescheduled` (+`by`), `cancelled` (+`by`, `late`),
`started`, `ended` (+`minutes`), `proposed` (+`proposal`). Данные карточки — актуальный статус созвона на момент запроса.

Антиспам: пока специалист не ответил и созвона нет, клиент может отправить `DIALOG_FIRST_MESSAGES` (3) сообщения → 403.
`CHAT_ALLOW_WITHOUT_BOOKING=False` возвращает правило «писать только после записи».

## Баланс и выплаты — `/billing/`

Анонимный баланс (apps.billing, подробно для владельца — docs/PAYMENTS.md). Все суммы — целые
копейки (`*_kopecks`). Ошибки: `{detail, code}`; нехватка денег — **402** `{code: "insufficient_funds", shortfall_kopecks, balance_kopecks}`.

Клиент:
- `GET summary/` → `{balance_kopecks, held_kopecks, topup: {providers, test_mode, min_kopecks, max_kopecks, presets_rub, methods, receipts, confirmation}, cancel_rules}`
- `GET history/?limit=` → `{items: [{id, kind, label, amount_kopecks, created_at, test, call}], holds, pending_topups}`
- `POST topups/` `{amount_rub, method?: any|bank_card|sbp|sberbank|tinkoff_bank, receipt_email?, receipt_phone?, return_to?: "/app/…"}` → 201 `{id, status, confirmation: {type: redirect|embedded, url, token}}`. Контакт для чека уходит только в ЮKassa и не сохраняется. 10/мин.
- `GET topups/<id>/` → статус (перезапрашивается у провайдера) + `balance_kopecks`
- `POST topups/<id>/mock/` `{outcome: succeeded|canceled}` — только тестовая касса
- `POST redeem/` `{code}` → `{amount_kopecks, balance_kopecks}`. 5/мин + блок после 10 неверных кодов в час.
- `GET quote/?psychologist=&minutes=` → `{amount_kopecks, balance_kopecks, enough, shortfall_kopecks}`
- `GET calls/<session_id>/` → `{status, amount_kopecks, specialist, hold, paid, payable, balance_kopecks, shortfall_kopecks}`
- `POST calls/<session_id>/pay/` → оплатить с баланса (заморозка) или 402

Запись `POST /sessions/book/` сразу пытается оплатить с баланса: хватает — `status: "paid"`, нет — `awaiting_payment`
и `payment_url: "/app/balance/pay/<id>"` (запись держится `BILLING_UNPAID_TTL_MINUTES`).

Специалист:
- `GET earnings/` → `{pending_kopecks, available_kopecks, in_payout_kopecks, paid_kopecks, upcoming_kopecks, fee_percent, hold_hours, payout_min_kopecks, payout_rail, method, calls[], payouts[]}`
- `PUT earnings/method/` `{kind: sbp|bank_account, tax_status: self_employed|ip, phone, bank_name | account, bik, recipient, inn?}` → `{kind, masked, tax_status}` (реквизиты шифруются)
- `POST earnings/payouts/` `{amount_rub?}` (без суммы — всё доступное) → 201

Провайдер: `POST webhook/yookassa/` — только с IP ЮKassa; объект перезапрашивается у API ЮKassa; идемпотентно.

Персонал (`finance.view` — чтение, `finance.manage` — действия; всё пишется в журнал):
`GET staff/overview/`, `GET staff/balances/?q=` (только псевдонимы), `GET staff/holds/?status=`,
`POST staff/holds/<id>/settle/` `{action: capture|release|penalty|refund, percent?, reason}`,
`GET staff/payouts/?status=open|paid|all`, `POST staff/payouts/<id>/approve|paid|reject/` `{note}`,
`POST staff/payouts/<id>/details/` (расшифрованные реквизиты для ручной выплаты),
`GET staff/topups/`, `POST staff/topups/<id>/refund|sync/`, `POST staff/adjust/` `{alias, amount_rub, reason, key}`,
`GET|POST staff/gifts/` `{amount_rub, count, label?, expires_at?}` → коды показываются один раз, `POST staff/gifts/<id>/revoke/`,
`GET staff/journal/`, `GET staff/reconcile/`, `POST staff/sweep/`, `GET staff/export/?days=` (CSV).

## Звонки — `/calls/`

Только участники звонка (клиент или специалист этой сессии), иначе 403.

- `POST calls/{session_id}/feedback/` — оценка связи или жалоба.
  Тело: `{ kind: "rating" | "problem", rating?: 1…5, issues?: [...], comment?: string ≤1000, tech?: {...} }`.
  `issues` из: `no_audio, echo, voice_breaks, no_video, video_freezes, avatar_lags, avatar_wrong, voice_filter, disconnects, other`.
  `rating` — одна на автора (повторная перезаписывает), `problem` — каждая новая запись; для `problem` нужны `issues` или `comment`.
  `tech` — только цифры о связи по белому списку (`rttMs, lossIn, lossOut, sendKbps, recvKbps, capKbps, codec, recvFps, recvSize, sendFps, limitation, relay, status, backend, detectFps, detectMs, latencyMs, browser, voice, durationSec, reconnects`), остальное отбрасывается. → 201 `{ id, kind, rating }`. Просмотр — Django admin (CallFeedback). Лимит 30/час.
- `GET calls/{session_id}/presence/` → `{ peer_in_room: bool }` — подключён ли собеседник к сигналингу комнаты (лобби: «Специалист уже в звонке»).

## Личные настройки — `/me/`

| Метод | Путь | Описание |
|---|---|---|
| GET | `settings/` | `{settings, updated_at}` — настройки текущего пользователя (клиент или специалист), `{}` если не сохранены |
| PATCH | `settings/` | частичное обновление (сливается): `{stealth?:{enabled?,preset?:"notes"\|"weather"\|"calendar"\|"docs",exit?:"weather"\|"news"\|"search"\|"wiki",wipe?}, screen_protect?:bool, v?:int}`. Неизвестные ключи отбрасываются, неверные значения — 400 |
| DELETE | `settings/` | стереть копию настроек из аккаунта |

«Незаметный режим» и «Защита от скриншотов» работают из localStorage браузера (`aprosop.privacy`); аккаунт хранит копию,
чтобы режим включался на других устройствах. `v` — время изменения на устройстве (мс): новее — побеждает.

## Документы специалистов — `/psychologist/credentials/`, `/staff/credentials/`

Пункт: `kind` (`diploma` · `retraining` · `method` · `supervision` · `membership` · `publication` · `course` · `other`),
`title`, `issuer`, `year`, `year_end`, `supervisor`, `hours`, `url`, `doi`, `number` (хранится зашифрованным; публично — маска `№ •••• 1234`).
Статусы: `pending` · `approved` · `rejected` (`reject_reason`) · `needs_info` (вопрос в `notes`).
Любое существенное изменение подтверждённого пункта (данные, новый файл, файл стал публичным) → снова `pending` (`was_approved: true`).

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET/POST | `/psychologist/credentials/` | специалист | мои пункты (с файлами и перепиской) / создать |
| PATCH/DELETE | `/psychologist/credentials/<uuid>/` | специалист | изменить / удалить |
| POST | `/psychologist/credentials/<uuid>/files/` | специалист | multipart `file` (PDF/JPG/PNG/WebP ≤ 10 МБ, до 6 на пункт), `is_public` 1/0. EXIF удаляется |
| PATCH/DELETE | `/psychologist/credentials/files/<uuid>/` | специалист | `{is_public}` / удалить файл |
| POST | `/psychologist/credentials/<uuid>/notes/` | специалист | ответ сотруднику `{text}`; `needs_info`/`rejected` → `pending` |
| GET | `/credentials/files/<uuid>/` | владелец или сотрудник с `specialists.verify` | содержимое файла (иначе 404) |
| GET | `/psychologists/<id>/credentials/` | все | только подтверждённые пункты, только публичные файлы |
| GET | `/psychologists/<id>/credentials/files/<uuid>/` | все | публичный файл подтверждённого пункта |
| GET | `/staff/credentials/?status=&q=&specialist=&page=` | `specialists.verify` | очередь `{count, page, pages, results, counts}` |
| GET/POST | `/staff/credentials/<uuid>/` | `specialists.verify` | пункт / решение `{decision: approve\|reject\|request_info, comment}` (comment обязателен для reject/request_info), пишется в журнал `credential.*` |

Файлы хранятся зашифрованными в БД (как вложения чата), не в `/media`. `GET /staff/me/` → `badges.credentials` — число пунктов на проверке.

## Отзывы — `/reviews/`

Оставить отзыв может только клиент с завершённым созвоном у специалиста (`completed`, деньги не возвращены). Один отзыв на пару
(повторный POST обновляет). Автор не показывается: `author_label` «Клиент, N созвонов», дата — месяц (`month: "2026-09"`).

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/psychologists/<id>/reviews/?page=` | все | `{summary: {rating, count, distribution, top_tags}, count, page, pages, results}` |
| GET | `/reviews/eligibility/?psychologist=<id>` | вошедший | `{can_review, completed_calls, review, tags}` |
| POST | `/reviews/` | клиент | `{psychologist, rating 1–5, text?, tags?}` → 201 (новый) / 200 (обновлён); 403 `no_completed_calls` |
| PATCH/DELETE | `/reviews/<id>/` | автор | изменить / удалить |
| GET | `/reviews/about-me/` | специалист | отзывы о себе + сводка |
| POST | `/reviews/<id>/reply/` | специалист | единственный ответ `{text}` (повторный POST правит его) |
| POST | `/reports/` | вошедший | жалоба `{target_type: "review", target_id: "<id>", reason, comment}` |
| GET | `/staff/reviews/?status=reported\|hidden\|all` | `reports.view` | отзывы с жалобами |
| POST | `/staff/reviews/<id>/moderate/` | `reports.resolve` | `{action: hide\|restore\|keep, note}` (note обязателен для hide); закрывает жалобы, журнал `review.*` |

Теги: `attentive` · `clarity` · `gentle` · `tools` · `progress` · `punctual` · `clear` · `safe`.
В карточках специалистов (`/psychologists/`, `/psychologists/search/`, детальная) добавлены `rating` (среднее, null без отзывов),
`reviews_count`, `verified_credentials` (> 0 → значок «Проверено aprosop»).

## Подбор по анкете — `/matching/`

Без входа. Ответы **не сохраняются и не логируются** (фронт держит копию только в localStorage браузера).

| Метод | Путь | Описание |
|---|---|---|
| GET | `options/` | варианты ответов, `weights`, `crisis_help` |
| POST | `` | `{ topics: TopicKey[], duration?: weeks\|months\|year, intensity?: mild\|notable\|heavy, safety: no\|sometimes\|now, style?: support\|techniques\|depth, gender?: female\|male, min_experience?: 0\|3\|5\|10, budget?: ₽ за час\|null, times?: (morning\|day\|evening\|weekend)[], tz? }` → `{ crisis: {level: none\|some\|acute, help: {label, phone, note}[]}, weights, stored: false, count, results: {psychologist: карточка, score: 0–100, fits, summary, price_hour_rub, reasons: {key, ok, text, points, max}[]}[] }` (до 12, лучшие первыми) |

Оценка из 100: темы 35 · стиль 20 (подход специалиста) · бюджет 15 (цена часа) · удобное время 15 (свободные окна
в ближайшие 14 дней по поясу клиента) · опыт 10 · отзывы 5. Пол — жёсткое пожелание: неподходящие идут после всех
подходящих (`fits: false`, причина `gender`). `TopicKey`: anxiety, burnout, relationships, self_esteem, grief,
depression, panic, sleep, anger, addiction, crisis, family, loneliness. Троттлинг — scope `search`.

## Знакомство, 15 минут

Специалист включает в правилах записи (`PUT /psychologist/availability/` → `intro_enabled`, `intro_price_rub` 0…3000;
по умолчанию выключено; в ответе ещё `intro_minutes`, `intro_max_price_rub`). 15 минут — длительность только для
знакомства: `available-starts?duration=15`, `dialogues/<id>/starts/?duration=15`, `dialogues/book/` и
`dialogues/<id>/calls/` с `duration_minutes: 15`. Цена — `intro_price_rub` (0 → бесплатно, оплата с баланса не нужна).
Одно знакомство на пару клиент–специалист (отменённое не считается) → иначе 400. `booking.intro =
{enabled, minutes, price_rub, used}` в карточке специалиста и диалоге (`used` — для текущего клиента).
Созвоны: `is_intro` в `CallBrief`; карточки в ленте — «Знакомство назначено/перенесено/…». Поиск: `?intro=1`;
в `popular-requests/` — `intro` (сколько специалистов проводят знакомства).

## Для компаний (B2B) — `/business/`

Компания предоплачивает бюджет (счёт `company_budget:<id>` в журнале `apps.billing`), сотрудники
активируют одноразовые коды `BIZ-XXXX-XXXX-XXXX` в анонимном аккаунте. Созвон оплачивается сначала из
программы компании, остаток — с личного баланса; возвраты — в обратном порядке (сначала личная часть).
Компания видит только агрегаты: числа людей/созвонов/часов, темы и оценки — только при ≥ 5 участниках
за период (иначе `null` → «менее 5»), только закрытые месяцы, без статусов отдельных кодов.

- `POST leads/` (публично) `{company_name, contact, contact_name?, employees?, message?}` → 201; 5/час с IP.
- Клиент: `GET me/` → `{programs: [{company, program, services, period, amount_kopecks, calls_limit, rub_left_kopecks, calls_left, renews_on, expires_on, budget_ok}]}`;
  `POST redeem/ {code}` → 201 `{programs}`; `POST me/<id>/leave/`.
- HR (роль `business`, одноразовый пароль → `portal/me/password/`, до смены — 403 `password_change_required`):
  `GET portal/me/`, `GET portal/dashboard/` (budget на 1-е число + пополнения месяца + флаг `low`, totals, codes, monthly, topics, satisfaction, `k_min`),
  `GET/POST portal/codes/ {count, label}` (коды — один раз в ответе), `GET portal/codes/<batch>/export/` (CSV),
  `POST portal/codes/<batch>/revoke/`, `POST portal/codes/revoke/ {code}` (одинаковый ответ для активированного и нет),
  `GET/PATCH portal/program/`, `GET portal/documents/`, `POST portal/documents/invoices/ {amount_rub}`, `GET portal/documents/acts.csv`.
- Персонал (`business.view` / `business.manage`, всё в журнал): `GET/POST staff/companies/`, `GET/PATCH staff/companies/<id>/`,
  `POST staff/companies/<id>/admins/ {login, full_name}` → `one_time_password`, `PATCH …/admins/<admin_id>/ {is_active?, reset_password?}`,
  `POST …/programs/`, `PATCH staff/programs/<id>/`, `POST …/codes/`, `GET staff/codes/<batch>/export/`,
  `POST …/invoices/ {amount_rub}`, `POST staff/invoices/<id>/paid|cancel/` (paid → проводка `company_topup`), `POST …/adjust/ {amount_rub, reason, idempotency_key}`,
  `GET staff/leads/`, `PATCH staff/leads/<id>/ {status}`.
- `billing/quote/` и `billing/calls/<id>/` получили поле `company_kopecks` — сколько оплатит программа компании.

## Круги — `/circles/`, `/staff/circles/`

Группы поддержки на 5–8 участников с психологом-ведущим. Участник известен другим **только** по
псевдониму круга («Участник-Лиса») и `handle` (случайная строка, новая в каждом круге); id
пользователя и alias не отдаются никому, включая ведущего. Подробности, mesh и путь к SFU — `docs/CIRCLES.md`.

| Метод | Путь | Кто | Что |
|---|---|---|---|
| GET | `/circles/?topic=` | все | открытые круги (набор, идут) + `topics` со счётчиками |
| GET | `/circles/mine/` | вход | мои круги (участие/лист ожидания) с ближайшей встречей |
| GET | `/circles/{id}/` | все | круг: ведущий, расписание, места, цена, правила, `join_closed_reason`, `amount_due_kopecks`, `cancel_rules`, `my_role`, `me` (псевдоним, место в очереди, `leave_terms`, оплаты) |
| POST | `/circles/{id}/join/` | клиент | записаться: заморозка на балансе (по встрече — каждая будущая встреча; за цикл — одна). Мест нет → лист ожидания (`waitlisted: true`, без заморозки). 402 `insufficient_funds` + `shortfall_kopecks` |
| POST | `/circles/{id}/leave/` | участник | выйти: будущие встречи возвращаются по правилам отмены созвонов (бесплатно ≥ N ч, иначе штраф %); освободившееся место получает первый из очереди, у кого хватает денег |
| GET | `/circles/{id}/members/` | участник/ведущий | псевдонимы участников |
| GET/POST | `/circles/{id}/messages/` | участник/ведущий | групповой чат `{text}`; новый участник видит сообщения с момента входа; исчезающие по `chat_retention`. Живые события — через `/ws/chat/`: `circle.message`, `circle.message.deleted` |
| POST | `/circles/{id}/messages/{mid}/delete/` | автор/ведущий | удалить |
| POST | `/circles/meetings/{mid}/join/` | участник/ведущий | токен групповой комнаты `{ws_token, room_id, role, self{id,name,tone}, circle, meeting, host, max_peers}`; 409 — комната закрыта (открывается за 10 мин, закрывается через 15 мин после конца) |
| GET/POST | `/circles/pro/` | специалист | мои круги / создать черновик `{topic,title,description,rules,format,meeting_minutes,capacity(5–8),billing,price_rub,first_meeting_at,meetings_count,allow_real_faces,chat_retention}` |
| GET/PUT/DELETE | `/circles/pro/{id}/` | ведущий | черновик меняется целиком; после публикации — только `description, rules, allow_real_faces, chat_retention` |
| POST | `/circles/pro/{id}/action/` | ведущий | `{action: submit}` на проверку · `{action: cancel, reason}` — отмена до начала (все получают полный возврат) |
| POST | `/circles/pro/{id}/members/{handle}/` | ведущий | `{action: mute \| unmute \| remove}` (remove — полный возврат будущих встреч) |
| POST | `/circles/pro/meetings/{mid}/end/` | ведущий | завершить встречу и сразу рассчитать оплату |
| GET | `/staff/circles/?status=pending` | `specialists.verify` | очередь проверки + `counts` |
| GET/POST | `/staff/circles/{id}/` | `specialists.verify` | `{decision: approve \| reject \| cancel, comment}` (reject/cancel — с комментарием; в журнал) |

Деньги: `billing.services.hold_for_group` (Hold без созвона, `reason="group"`); после встречи с ведущим —
`capture_for_call(ref)`, ведущий не пришёл — полный возврат. Расчёт — `manage.py circles_sweep` (scheduler) и лениво из API.

WebSocket `/ws/circle/{room_id}/?token=` — групповой сигналинг (до 9 пиров), см. `docs/CIRCLES.md`.

## Здоровье

`GET /health/` → `{ status: "ok" }`
