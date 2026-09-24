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
  sessions_count: number; next_slot: string | null
}
PsychologistPrivate = PsychologistPublic & {
  verification_status: "pending" | "approved" | "rejected" | "suspended"
}

Slot { start: string; end: string }
ScheduleRule { weekday: 0..6 /* 0 = понедельник */; start_time: "HH:MM"; end_time: "HH:MM" }

Session {
  id: uuid; status: "awaiting_payment" | "paid" | "in_progress" | "completed" | "cancelled" | "refunded";
  scheduled_at: string; duration_minutes: 50 | 80; amount_rub: number;
  room_id: uuid; can_join: boolean;          // true за 10 мин до начала и до конца сессии
  psychologist: { id: number; display_name: string; avatar_config: AvatarConfig | null };
  client: { alias: string; avatar_config: AvatarConfig | null };
  payment_url: string | null
}
```

## Авторизация — `/auth/`

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `anonymous/` | `{ password }` | `{ access, refresh, user, recovery_key }` — клиент **без email**; `alias` генерируется (`тихий-кит-4821`), `recovery_key` показывается один раз |
| POST | `register/psychologist/` | `{ email, password, display_name, bio, specializations[], session_rate_rub, experience_years }` | `{ access, refresh, user }` (status pending) |
| POST | `login/` | `{ login, password }` — `login` = alias или email | `{ access, refresh, user }` |
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
| GET | `psychologists/{id}/slots/?from=YYYY-MM-DD&days=14` | `Slot[]` — свободные 50-мин слоты по расписанию минус занятые, не раньше чем через 1 час |

## Кабинет психолога — `/psychologist/`

| Метод | Путь | Тело / Ответ |
|---|---|---|
| GET/PATCH | `profile/` | `PsychologistPrivate` (редактируемые: display_name, bio, approach, specializations, languages, experience_years, session_rate_rub) |
| GET/PUT | `schedule/` | `ScheduleRule[]` (PUT заменяет целиком) |
| GET | `stats/` | `{ upcoming: number; sessions_month: number; sessions_total: number; earnings_month_rub: number; earnings_total_rub: number; clients_total: number }` |

## Сессии — `/sessions/`

| Метод | Путь | Тело / Ответ |
|---|---|---|
| GET | `` | `Session[]` своей роли, новые сверху |
| POST | `book/` | `{ psychologist_id, scheduled_at, duration_minutes }` → `Session` (`payment_url` если нужна оплата; без YooKassa в настройках — сразу `paid`) |
| GET | `{id}/` | `Session` |
| POST | `{id}/cancel/` | `Session` |
| POST | `{id}/join/` | `{ room_id, ws_token, role: "client"\|"psychologist", peer: { name, avatar_config } }`; 403 если `can_join=false` |
| POST | `{id}/complete/` | `Session` |

## Админ — `/admin-panel/`

| Метод | Путь | Ответ |
|---|---|---|
| GET | `psychologists/?status=pending` | `PsychologistPrivate[]` + `created_at` |
| POST | `psychologists/{id}/verify/` | `{ status: "approved"\|"rejected"\|"suspended" }` → `PsychologistPrivate` |
| GET | `stats/` | `{ clients, psychologists, pending, sessions_today, sessions_month, revenue_month_rub }` |
| GET | `sessions/` | `Session[]` последние 100 |

## WebSocket сигналинг

`wss://<host>/ws/signaling/<room_id>/?token=<ws_token>` — `ws_token` из `join/`
(подпись `django.core.signing`, 3 часа, содержит user_id, room_id, role).
Без валидного токена — close 4001. Максимум 2 участника. Сообщения прежние:
`ready | offer | answer | ice-candidate | bye`, сервер шлёт `peer-joined | peer-left`.

## Здоровье

`GET /health/` → `{ status: "ok" }`
