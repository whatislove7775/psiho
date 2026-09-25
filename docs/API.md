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
  // session_rate_rub = цена самой короткой сессии специалиста («от …»), синхронизируется с ценой часа
  booking: { hourly_rate_rub: number; min_duration: number; max_duration: number;
             durations: { minutes: number; price_rub: number }[] }
}
PsychologistPrivate = PsychologistPublic & {
  verification_status: "pending" | "approved" | "rejected" | "suspended"
}

Slot { start: string; end: string }
ScheduleRule { weekday: 0..6 /* 0 = понедельник */; start_time: "HH:MM"; end_time: "HH:MM" }

Session {
  id: uuid; status: "awaiting_payment" | "paid" | "in_progress" | "completed" | "cancelled" | "refunded";
  scheduled_at: string; duration_minutes: number /* 50…180 */; amount_rub: number;
  room_id: uuid; can_join: boolean;          // true за 10 мин до начала и до конца сессии
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
| POST | `me/delete/` | `{ password }` | `204` — полное удаление аккаунта и сессий |

## Специалисты

| Метод | Путь | Ответ |
|---|---|---|
| GET | `psychologists/?q=&specialization=&max_rate=` | `PsychologistPublic[]` (только approved) |
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
  buffer_minutes: number;            // перерыв между сессиями
  min_notice_minutes: number;        // запись не позднее чем за … до начала
  horizon_days: number;              // насколько вперёд открыта запись
  start_step_minutes: 15 | 30 | 60;  // сетка начал (+ «сразу после сессии и перерыва»)
  hourly_rate_rub: number;           // цена часа; цена сессии = час × мин/60, округление до 10 ₽
  prices: { minutes, price_rub }[]; platform_fee_percent: number;
  templates: { id, valid_from: date|null, valid_until: date|null, days: Range[][7] /* 0 = пн */ }[];
  options: { durations, buffer_minutes, min_notice_minutes, horizon_days, start_step_minutes }
}
TimeOff { id; start_date; end_date; note }
```
Правило дня: отпуск → ничего; особый день → его интервалы; иначе шаблон, покрывающий дату, с самой поздней `valid_from`.
| GET | `stats/` | `{ upcoming: number; sessions_month: number; sessions_total: number; earnings_month_rub: number; earnings_total_rub: number; clients_total: number }` |

## Сессии — `/sessions/`

| Метод | Путь | Тело / Ответ |
|---|---|---|
| GET | `` | `Session[]` своей роли, новые сверху |
| POST | `book/` | `{ psychologist_id, scheduled_at, duration_minutes? }` → `Session` (`payment_url` если нужна оплата; без YooKassa в настройках — сразу `paid`). `scheduled_at` должен быть из `available-starts`; сумма = цена часа × длительность, до 10 ₽. Двойная запись на одно начало невозможна (уникальный индекс + блокировка профиля) → 400 |
| GET | `{id}/` | `Session` |
| POST | `{id}/cancel/` | `Session` |
| POST | `{id}/join/` | `{ room_id, ws_token, role: "client"\|"psychologist", peer: { name, avatar_config, photo_url? } }` (`photo_url` — только когда собеседник специалист); 403 если `can_join=false` |
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
| GET | `/content/articles/?topic=&tag=&limit=&exclude=<slug>` | Карточки статей без `body`: `id, slug, title, summary, topic, topic_label, tags, cover, emoji, reading_minutes, author_name, published_at` |
| GET | `/content/articles/<slug>/` | Статья целиком, `body` в Markdown |
| GET | `/content/practices/?kind=&limit=` | Карточки практик: `id, slug, title, summary, kind, kind_label, duration_minutes, cover, emoji` |
| GET | `/content/practices/<slug>/` | + `steps: [{ title, text, seconds? }]`, `pattern: { inhale, hold, exhale, hold_after, cycles } \| null` |

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

Стартовые материалы (12 статей, 8 практик) создаются миграцией `content/0002`; повторно — `manage.py seed_content [--overwrite]`.

## Чаты — `/chat/`

Виды разговоров: `specialist` (клиент↔специалист, после любой записи на сессию или при `CHAT_ALLOW_WITHOUT_BOOKING=True`),
`client_support`, `specialist_support`, `ai` (клиент↔Тиша). Персонал с правом `support.inbox` видит только разговоры с поддержкой.
Текст, имена файлов и файлы шифруются (Fernet, `CHAT_ENCRYPTION_KEY`); файлы лежат в БД и отдаются только через API.

| Метод | Путь | Описание |
|---|---|---|
| GET | `conversations/` (`?scope=support` — входящие поддержки) | список `Conversation` |
| POST | `conversations/` `{with:"support"}` \| `{with:"specialist",psychologist_id}` \| `{with:"client",client_alias}` | найти или создать (201/200) |
| GET/PATCH | `conversations/{id}/` PATCH `{retention:"24h"\|"forever"}` | режим меняет клиент (в `specialist_support` — специалист); появится системное сообщение |
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
can_change_retention, can_send_files, unread, last_message{text,created_at,sender_role,kind}, last_message_at, peer_read_at}`.
`Message`: `{id, conversation, kind: text|voice|file|system, sender_role, text, system_code, attachment{name,mime,size,duration_ms,peaks}, created_at, edited_at, deleted, expires_at, mine}`.

WebSocket `/ws/chat/?token=…`: сервер шлёт `ready`, `message.new`, `message.updated`, `message.hidden`, `conversation.updated`,
`conversation.cleared`, `typing`, `read`; клиент — `{type:"typing"|"read", conversation}`, `{type:"ping"}`.
Истёкшие сообщения (режим 24 ч) удаляет `manage.py purge_chats` (сервис `scheduler`, каждые 5 минут).

## Здоровье

`GET /health/` → `{ status: "ok" }`
