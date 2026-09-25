from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied

from apps.dialogs.services import ensure_dialogue as dialogs_ensure
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.availability.services import allowed_durations, get_settings
from apps.payments.services import PaymentProviderError, create_session, initiate_payment
from apps.signaling.tokens import make_ws_token
from apps.users.models import PsychologistProfile

from .models import ConsultationSession, SessionEvent
from .scheduling import check_bookable
from .serializers import BookSessionSerializer, SessionSerializer, can_join

S = ConsultationSession.Status


def sessions_for(user):
    qs = ConsultationSession.objects.select_related(
        "client", "psychologist_profile__user", "psychologist_profile__photo", "payment"
    ).exclude(status=S.DRAFT)
    if user.role == "client":
        return qs.filter(client=user)
    if user.role == "psychologist":
        return qs.filter(psychologist_profile__user=user)
    return qs.none()


def participant_role(session, user) -> str | None:
    if session.client_id == user.id:
        return "client"
    if session.psychologist_profile.user_id == user.id:
        return "psychologist"
    return None


class SessionListView(generics.ListAPIView):
    serializer_class = SessionSerializer

    def get_queryset(self):
        return sessions_for(self.request.user).order_by("-scheduled_at")


class SessionDetailView(generics.RetrieveAPIView):
    serializer_class = SessionSerializer

    def get_queryset(self):
        return sessions_for(self.request.user)


class BookSessionView(APIView):
    def post(self, request):
        if request.user.role != "client":
            return Response(
                {"detail": "Назначать созвоны могут только клиенты."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = BookSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        scheduled_at = data["scheduled_at"]
        duration = data.get("duration_minutes")

        try:
            with transaction.atomic():
                # Блокировка профиля сериализует параллельные записи к одному специалисту
                profile = (
                    PsychologistProfile.objects.select_for_update()
                    .filter(
                        pk=data["psychologist_id"],
                        verification_status=PsychologistProfile.VerificationStatus.APPROVED,
                        user__is_active=True,
                    )
                    .first()
                )
                if profile is None:
                    return Response({"detail": "Специалист не найден."}, status=status.HTTP_404_NOT_FOUND)
                if duration is None:
                    duration = allowed_durations(get_settings(profile))[0]
                error = check_bookable(profile, scheduled_at, duration, client=request.user)
                if error:
                    return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)
                session = create_session(request.user, profile, scheduled_at, duration)
                initiate_payment(session)
        except IntegrityError:
            # Уникальный индекс (специалист, начало) среди активных сессий: параллельная запись
            return Response(
                {"detail": "Это время только что заняли. Выберите другое."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except PaymentProviderError:
            return Response(
                {"detail": "Не удалось создать платёж. Попробуйте позже."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        from apps.dialogs.services import on_call_booked  # карточка «созвон назначен» в диалоге пары

        on_call_booked(session)
        session = sessions_for(request.user).get(pk=session.pk)
        return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionActionView(APIView):
    def get_session(self, request, pk):
        session = sessions_for(request.user).filter(pk=pk).first()
        if session is None:
            return None, Response({"detail": "Сессия не найдена."}, status=status.HTTP_404_NOT_FOUND)
        return session, None


class CancelSessionView(SessionActionView):
    def post(self, request, pk):
        session, error = self.get_session(request, pk)
        if error:
            return error
        # Единые правила отмены и возврата — в apps.dialogs (созвон живёт внутри диалога пары)
        from apps.dialogs import services as dialogs

        role = "client" if participant_role(session, request.user) == "client" else "specialist"
        try:
            dialogs.cancel_call(dialogs.ensure_dialogue(session.client, session.psychologist_profile), session, role)
        except PermissionDenied:
            return Response(
                {"detail": "Этот созвон уже нельзя отменить."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.refresh_from_db()
        return Response(SessionSerializer(session).data)


class JoinSessionView(SessionActionView):
    def post(self, request, pk):
        session, error = self.get_session(request, pk)
        if error:
            return error
        if not can_join(session):
            return Response(
                {"detail": "Подключиться можно за 10 минут до начала оплаченного созвона."},
                status=status.HTTP_403_FORBIDDEN,
            )
        role = participant_role(session, request.user)
        if session.status == S.PAID:
            session.status = S.IN_PROGRESS
            session.save(update_fields=["status", "updated_at"])
            SessionEvent.objects.create(
                session=session, event_type=SessionEvent.EventType.ROOM_OPENED, metadata={}
            )
            from apps.dialogs.services import on_call_started  # карточка «созвон начался» с кнопкой входа

            on_call_started(session)
        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.PARTICIPANT_JOINED,
            metadata={"participant_role": role},
        )
        if role == "client":
            profile = session.psychologist_profile
            from apps.photos.utils import photo_url

            peer = {
                "name": profile.display_name,
                "avatar_config": profile.user.avatar_config,
                "photo_url": photo_url(profile),
            }
        else:
            peer = {"name": session.client.alias, "avatar_config": session.client.avatar_config}
        return Response({
            "room_id": str(session.webrtc_room_id),
            "ws_token": make_ws_token(request.user.id, session.webrtc_room_id, role),
            "role": role,
            "peer": peer,
            # Чат диалога пары для панели чата в звонке (id диалога = id разговора)
            "conversation_id": str(dialogs_ensure(session.client, session.psychologist_profile).id),
            "dialogue_id": str(dialogs_ensure(session.client, session.psychologist_profile).id),
        })


class CompleteSessionView(SessionActionView):
    def post(self, request, pk):
        session, error = self.get_session(request, pk)
        if error:
            return error
        if session.status != S.IN_PROGRESS:
            return Response(
                {"detail": "Завершить можно только идущий созвон."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.status = S.COMPLETED
        session.completed_at = timezone.now()
        session.save(update_fields=["status", "completed_at", "updated_at"])
        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.SESSION_ENDED,
            metadata={"completed_by": participant_role(session, request.user)},
        )
        from apps.dialogs.services import on_call_ended  # карточка «созвон завершён, N мин»

        on_call_ended(session)
        return Response(SessionSerializer(session).data)
