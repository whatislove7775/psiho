from django.db import transaction
from django.db.models import Q


@transaction.atomic
def delete_user_completely(user) -> None:
    """Полное удаление аккаунта: сессии, платежи, выплаты, профиль психолога."""
    from apps.payments.models import Payment, Payout
    from apps.sessions.models import ConsultationSession

    from .models import PsychologistProfile

    profile = PsychologistProfile.objects.filter(user=user).first()

    session_filter = Q(client=user)
    if profile is not None:
        session_filter |= Q(psychologist_profile=profile)
    sessions = ConsultationSession.objects.filter(session_filter)

    payout_filter = Q(payment__session__in=sessions)
    if profile is not None:
        payout_filter |= Q(psychologist_profile=profile)
    Payout.objects.filter(payout_filter).delete()
    Payment.objects.filter(session__in=sessions).delete()
    # SessionEvent / SessionNote удаляются каскадом
    sessions.delete()
    if profile is not None:
        profile.delete()
    user.delete()


def blacklist_user_tokens(user) -> None:
    """Инвалидирует все refresh-токены пользователя (смена пароля/восстановление)."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
