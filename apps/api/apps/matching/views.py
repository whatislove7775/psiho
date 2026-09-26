"""
POST /api/v1/matching/ — подбор специалиста по анкете (без входа).

Ответы не сохраняются и не логируются: считаем оценку и сразу отдаём результат.
"""
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import scoring

MAX_RESULTS = 12


class AnswersSerializer(serializers.Serializer):
    topics = serializers.ListField(
        child=serializers.ChoiceField(choices=list(scoring.TOPICS)), required=False, max_length=len(scoring.TOPICS),
    )
    duration = serializers.ChoiceField(choices=list(scoring.DURATIONS), required=False, allow_blank=True)
    intensity = serializers.ChoiceField(choices=list(scoring.INTENSITY), required=False, allow_blank=True)
    safety = serializers.ChoiceField(choices=list(scoring.SAFETY), required=False, default="no")
    style = serializers.ChoiceField(choices=list(scoring.STYLES), required=False, allow_blank=True)
    gender = serializers.ChoiceField(choices=list(scoring.GENDERS), required=False, allow_blank=True)
    min_experience = serializers.ChoiceField(choices=list(scoring.EXPERIENCE), required=False, default=0)
    budget = serializers.IntegerField(min_value=500, max_value=100_000, required=False, allow_null=True)
    times = serializers.ListField(
        child=serializers.ChoiceField(choices=list(scoring.TIMES)), required=False, max_length=len(scoring.TIMES),
    )
    tz = serializers.CharField(max_length=64, required=False, allow_blank=True)

    def to_answers(self) -> scoring.Answers:
        d = self.validated_data
        tz = None
        if d.get("tz"):
            try:
                tz = ZoneInfo(d["tz"])
            except (ZoneInfoNotFoundError, ValueError):
                tz = None
        return scoring.Answers(
            topics=list(dict.fromkeys(d.get("topics") or [])),
            duration=d.get("duration") or "",
            intensity=d.get("intensity") or "",
            safety=d.get("safety") or "no",
            style=d.get("style") or "",
            gender=d.get("gender") or "",
            min_experience=int(d.get("min_experience") or 0),
            budget=d.get("budget"),
            times=list(dict.fromkeys(d.get("times") or [])),
            tz=tz,
        )


class MatchOptionsView(APIView):
    """Варианты ответов и веса оценки — чтобы интерфейс мог честно показать, как считаем."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(scoring.options())


class MatchView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "search"

    def post(self, request):
        from apps.users.serializers import PsychologistPublicSerializer
        from apps.users.views import approved_psychologists

        ser = AnswersSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        answers = ser.to_answers()
        now = timezone.now()
        matches = scoring.rank(approved_psychologists(), answers, now)[:MAX_RESULTS]
        context = {"request": request, "next_starts": {m.profile.id: m.next_start for m in matches}}
        cards = PsychologistPublicSerializer([m.profile for m in matches], many=True, context=context).data
        level = scoring.crisis_level(answers)
        return Response({
            "crisis": {"level": level, "help": scoring.CRISIS_HELP if level != "none" else []},
            "weights": scoring.WEIGHTS,
            "stored": False,  # ответы анкеты нигде не сохраняются
            "count": len(matches),
            "results": [
                {
                    "psychologist": card,
                    "score": m.score,
                    "fits": m.fits,
                    "summary": m.summary,
                    "price_hour_rub": m.price_hour,
                    "reasons": [r.as_dict() for r in m.reasons if r.text],
                }
                for m, card in zip(matches, cards)
            ],
        })
