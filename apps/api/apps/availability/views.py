from datetime import date, timedelta

from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsPsychologist

from . import engine, services
from .models import DateOverride, TimeOff, WeeklyRule, WeeklyTemplate
from .serializers import (
    OverrideSerializer, RangeField, SettingsSerializer, TimeOffSerializer, settings_payload,
)

MAX_RANGE_DAYS = 120


def _iso(dt) -> str:
    return serializers.DateTimeField().to_representation(dt)


def _parse_range(request, default_first: date, default_days: int):
    raw_from = request.query_params.get("from")
    raw_to = request.query_params.get("to")
    first = date.fromisoformat(raw_from) if raw_from else default_first
    last = date.fromisoformat(raw_to) if raw_to else first + timedelta(days=default_days)
    if last < first:
        raise ValueError("to < from")
    last = min(last, first + timedelta(days=MAX_RANGE_DAYS))
    return first, last


# ── Кабинет специалиста ─────────────────────────────────────────

class AvailabilityView(APIView):
    """GET/PUT правил записи и недельных шаблонов. PUT принимает любые поля (частичное обновление)."""

    permission_classes = [IsPsychologist]

    def _payload(self, profile):
        s = services.get_settings(profile)
        return settings_payload(s, services.templates_of(profile))

    def get(self, request):
        return Response(self._payload(request.user.psychologist_profile))

    def put(self, request):
        profile = request.user.psychologist_profile
        s = services.get_settings(profile)
        serializer = SettingsSerializer(instance=s, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        templates = data.pop("templates", None)
        with transaction.atomic():
            for key, value in data.items():
                setattr(s, key, value)
            s.save()
            if templates is not None:
                WeeklyTemplate.objects.filter(profile=profile).delete()
                for t in templates:
                    obj = WeeklyTemplate.objects.create(
                        profile=profile, valid_from=t.get("valid_from"), valid_until=t.get("valid_until")
                    )
                    WeeklyRule.objects.bulk_create([
                        WeeklyRule(template=obj, weekday=wd, start_minute=a, end_minute=b)
                        for wd, ranges in enumerate(t["days"])
                        for a, b in ranges
                    ])
            services.sync_profile_rate(s)
        return Response(self._payload(profile))

    patch = put


class CalendarView(APIView):
    """Как выглядит каждый день диапазона: источник правил, интервалы, число сессий."""

    permission_classes = [IsPsychologist]

    def get(self, request):
        from apps.sessions.models import ConsultationSession

        profile = request.user.psychologist_profile
        try:
            first, last = _parse_range(request, services.local_today(profile), 41)
        except ValueError:
            return Response({"detail": "Неверные параметры: from, to — даты YYYY-MM-DD."}, status=400)
        av = services.load(profile, first, last)
        overrides = {o.date for o in DateOverride.objects.filter(profile=profile, date__gte=first, date__lte=last)}
        time_off = list(TimeOff.objects.filter(profile=profile, end_date__gte=first, start_date__lte=last))

        busy = services.busy_intervals(
            ConsultationSession.objects.filter(psychologist_profile=profile),
            engine.to_utc(engine.local_dt(first, 0, av.tz)),
            engine.to_utc(engine.local_dt(last, engine.DAY_MINUTES, av.tz)),
        )
        per_day: dict[date, list[dict]] = {}
        for b0, b1 in busy:
            local = b0.astimezone(av.tz)
            per_day.setdefault(local.date(), []).append({
                "start": local.strftime("%H:%M"),
                "end": b1.astimezone(av.tz).strftime("%H:%M"),
            })

        days = []
        d = first
        while d <= last:
            source, ranges = engine.day_plan(av, d)
            off = next((t for t in time_off if t.start_date <= d <= t.end_date), None)
            days.append({
                "date": d.isoformat(),
                "source": source,
                "has_override": d in overrides,
                "time_off_id": off.id if off else None,
                "ranges": [RangeField().to_representation(r) for r in ranges],
                "sessions": sorted(per_day.get(d, []), key=lambda x: x["start"]),
            })
            d += timedelta(days=1)
        return Response({"time_zone": str(av.tz), "today": services.local_today(profile).isoformat(), "days": days})


class OverrideView(APIView):
    """PUT — особый график на дату (пустой список = выходной), DELETE — вернуть как в шаблоне."""

    permission_classes = [IsPsychologist]

    def put(self, request, day):
        profile = request.user.psychologist_profile
        try:
            d = date.fromisoformat(day)
        except ValueError:
            return Response({"detail": "Дата в формате YYYY-MM-DD."}, status=400)
        serializer = OverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ranges = [list(r) for r in serializer.validated_data["ranges"]]
        services.get_settings(profile)
        DateOverride.objects.update_or_create(profile=profile, date=d, defaults={"ranges": ranges})
        return Response({"date": d.isoformat(), "ranges": [RangeField().to_representation(r) for r in ranges]})

    def delete(self, request, day):
        profile = request.user.psychologist_profile
        try:
            d = date.fromisoformat(day)
        except ValueError:
            return Response({"detail": "Дата в формате YYYY-MM-DD."}, status=400)
        DateOverride.objects.filter(profile=profile, date=d).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TimeOffListView(APIView):
    permission_classes = [IsPsychologist]

    def get(self, request):
        profile = request.user.psychologist_profile
        items = TimeOff.objects.filter(profile=profile, end_date__gte=services.local_today(profile))
        return Response(TimeOffSerializer(items, many=True).data)

    def post(self, request):
        profile = request.user.psychologist_profile
        serializer = TimeOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if TimeOff.objects.filter(profile=profile, end_date__gte=services.local_today(profile)).count() >= 30:
            return Response({"detail": "Слишком много запланированных отпусков."}, status=400)
        services.get_settings(profile)
        item = TimeOff.objects.create(profile=profile, **serializer.validated_data)
        return Response(TimeOffSerializer(item).data, status=status.HTTP_201_CREATED)


class TimeOffDetailView(APIView):
    permission_classes = [IsPsychologist]

    def delete(self, request, pk):
        TimeOff.objects.filter(profile=request.user.psychologist_profile, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Публичное: свободные начала ─────────────────────────────────

class AvailableStartsView(APIView):
    """GET /psychologists/<id>/available-starts/?duration=90&from=YYYY-MM-DD&to=YYYY-MM-DD"""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        from apps.users.views import approved_psychologists

        profile = approved_psychologists().filter(pk=pk).first()
        if profile is None:
            return Response({"detail": "Специалист не найден."}, status=404)
        s = services.get_settings(profile)
        durations = services.allowed_durations(s)
        try:
            duration = int(request.query_params.get("duration") or durations[0])
            today = services.local_today(profile)
            first, last = _parse_range(request, today, s.horizon_days)
        except ValueError:
            return Response(
                {"detail": "Неверные параметры: duration — минуты, from и to — даты YYYY-MM-DD."}, status=400
            )
        if duration not in durations:
            return Response({
                "detail": f"Специалист проводит сессии длительностью {services.human_list(durations)} минут.",
            }, status=400)
        horizon_until = today + timedelta(days=s.horizon_days)
        starts = services.starts_for(profile, duration, max(first, today), min(last, horizon_until))
        return Response({
            "duration_minutes": duration,
            "price_rub": services.price_for(profile, duration),
            "durations": [{"minutes": d, "price_rub": services.price_for(profile, d)} for d in durations],
            "horizon_until": horizon_until.isoformat(),
            "starts": [_iso(x) for x in starts],
        })
