"""REST API диалогов (/api/v1/dialogues/). Содержимое сообщений и заметок не логируется."""
from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.availability import services as availability
from apps.chat import conf as chat_conf
from apps.chat import services as chat
from apps.chat.models import Conversation
from apps.users.models import PsychologistProfile, User

from . import policy, services
from .cards import proposal_brief


class CallInput(serializers.Serializer):
    scheduled_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=10, max_value=240, required=False)


class RescheduleInput(serializers.Serializer):
    scheduled_at = serializers.DateTimeField()


def _input(cls, data):
    ser = cls(data=data)
    ser.is_valid(raise_exception=True)
    return ser.validated_data


class DialogueListView(APIView):
    def get(self, request):
        return Response(services.dialogues_for(request.user))

    def post(self, request):
        """Начать диалог: клиент — {psychologist_id}; специалист — {client_alias} (только своему клиенту)."""
        user = request.user
        if user.role == "client":
            profile = PsychologistProfile.objects.filter(
                pk=request.data.get("psychologist_id"),
                verification_status=PsychologistProfile.VerificationStatus.APPROVED,
                user__is_active=True,
            ).first()
            if profile is None:
                raise ValidationError({"psychologist_id": "Специалист не найден."})
            existing = Conversation.objects.filter(kind=Conversation.Kind.SPECIALIST, client=user,
                                                   specialist=profile).first()
            if existing is None:
                if not policy.has_booking(user.id, profile.id):
                    if not chat_conf.allow_without_booking():
                        raise PermissionDenied("Написать специалисту можно после записи на созвон.")
                    policy.check_new_dialogue(user)
                conv = services.ensure_dialogue(user, profile)
                created = True
            else:
                conv, created = existing, False
        elif chat.is_specialist(user):
            client = User.objects.filter(alias=request.data.get("client_alias"), role=User.Role.CLIENT).first()
            if client is None or not policy.has_booking(client.id, user.psychologist_profile.id):
                raise ValidationError({"client_alias": "Начать диалог можно только со своим клиентом."})
            try:
                with transaction.atomic():
                    conv, created = Conversation.objects.get_or_create(
                        kind=Conversation.Kind.SPECIALIST, client=client, specialist=user.psychologist_profile)
            except IntegrityError:
                conv, created = Conversation.objects.get(
                    kind=Conversation.Kind.SPECIALIST, client=client, specialist=user.psychologist_profile), False
        else:
            raise PermissionDenied("Диалоги доступны клиентам и специалистам.")
        role = chat.my_role(user, conv)
        return Response(services.detail(conv, user, role),
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class BookWithSpecialistView(APIView):
    """Запись из профиля специалиста: диалог пары создаётся вместе с созвоном (без лимита новых диалогов)."""

    def post(self, request):
        if request.user.role != "client":
            raise PermissionDenied("Назначать созвоны могут только клиенты.")
        data = _input(CallInput, request.data)
        profile = PsychologistProfile.objects.filter(
            pk=request.data.get("psychologist_id"),
            verification_status=PsychologistProfile.VerificationStatus.APPROVED, user__is_active=True,
        ).first()
        if profile is None:
            raise ValidationError({"psychologist_id": "Специалист не найден."})
        with transaction.atomic():
            conv = services.ensure_dialogue(request.user, profile)
            session = services.book_call(conv, request.user, data["scheduled_at"], data.get("duration_minutes"))
        out = services.call_data(session, "client")
        out["dialogue_id"] = str(conv.id)
        return Response(out, status=status.HTTP_201_CREATED)


class DialogueDetailView(APIView):
    def get(self, request, pk):
        conv, role = services.get_dialogue(request.user, pk)
        return Response(services.detail(conv, request.user, role))


class DialogueStartsView(APIView):
    """Свободные начала специалиста этого диалога (для записи клиента и предложений специалиста)."""

    def get(self, request, pk):
        from datetime import timedelta

        conv, role = services.get_dialogue(request.user, pk)
        profile = conv.specialist
        s = availability.get_settings(profile)
        durations = availability.allowed_durations(s)
        try:
            duration = int(request.query_params.get("duration") or durations[0])
        except ValueError:
            raise ValidationError({"duration": "Длительность — число минут."})
        if not availability.accepts_duration(s, duration):
            raise ValidationError({"duration": f"Созвоны у специалиста длятся {availability.human_list(durations)} минут."})
        today = availability.local_today(profile)
        until = today + timedelta(days=s.horizon_days)
        starts = availability.starts_for(profile, duration, today, until)
        return Response({
            "duration_minutes": duration,
            "price_rub": availability.price_for(profile, duration),
            "durations": [{"minutes": d, "price_rub": availability.price_for(profile, d)} for d in durations],
            "horizon_until": until.isoformat(),
            "starts": [x.isoformat().replace("+00:00", "Z") for x in starts],
            "intro": availability.intro_info(profile, conv.client),
        })


class DialogueCallsView(APIView):
    def post(self, request, pk):
        conv, role = services.get_dialogue(request.user, pk)
        if role != "client":
            raise PermissionDenied("Специалист предлагает время, а назначает созвон клиент.")
        data = _input(CallInput, request.data)
        session = services.book_call(conv, request.user, data["scheduled_at"], data.get("duration_minutes"))
        return Response(services.call_data(session, role), status=status.HTTP_201_CREATED)


class DialogueCallRescheduleView(APIView):
    def post(self, request, pk, sid):
        conv, role = services.get_dialogue(request.user, pk)
        session = services.get_call(conv, sid)
        data = _input(RescheduleInput, request.data)
        session = services.reschedule_call(conv, session, role, data["scheduled_at"])
        return Response(services.call_data(session, role))


class DialogueCallCancelView(APIView):
    def post(self, request, pk, sid):
        conv, role = services.get_dialogue(request.user, pk)
        session = services.get_call(conv, sid)
        return Response(services.cancel_call(conv, session, role))


class DialogueProposalsView(APIView):
    def post(self, request, pk):
        conv, role = services.get_dialogue(request.user, pk)
        if role != "specialist":
            raise PermissionDenied("Предлагать время может только специалист.")
        data = _input(CallInput, request.data)
        p = services.propose(conv, data["scheduled_at"], data.get("duration_minutes"))
        return Response(proposal_brief(p), status=status.HTTP_201_CREATED)


class DialogueProposalAcceptView(APIView):
    def post(self, request, pk, pid):
        conv, role = services.get_dialogue(request.user, pk)
        if role != "client":
            raise PermissionDenied("Принять предложение может только клиент.")
        p = services.get_proposal(conv, pid)
        session = services.accept_proposal(conv, p, request.user)
        return Response(services.call_data(session, role), status=status.HTTP_201_CREATED)


class DialogueProposalCloseView(APIView):
    """Клиент отклоняет, специалист отзывает."""

    def post(self, request, pk, pid):
        conv, role = services.get_dialogue(request.user, pk)
        p = services.get_proposal(conv, pid)
        return Response(proposal_brief(services.close_proposal(conv, p, role)))


class DialogueNoteView(APIView):
    """Личные заметки специалиста о клиенте — только для специалиста этого диалога."""

    def _conv(self, request, pk):
        conv, role = services.get_dialogue(request.user, pk)
        if role != "specialist":
            raise PermissionDenied("Заметки доступны только специалисту.")
        return conv

    def get(self, request, pk):
        return Response(services.note_of(self._conv(request, pk)))

    def put(self, request, pk):
        conv = self._conv(request, pk)
        text = request.data.get("text", "")
        if not isinstance(text, str):
            raise ValidationError({"text": "Текст заметки — строка."})
        if len(text) > services.MAX_NOTE:
            raise ValidationError({"text": f"Не больше {services.MAX_NOTE} символов."})
        return Response(services.save_note(conv, text))
