from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from .models import Credential


def annotate_credentials(qs):
    """credentials_verified — число подтверждённых пунктов (для значка «Проверено aprosop»)."""
    approved = (
        Credential.objects.filter(profile=OuterRef("pk"), status=Credential.Status.APPROVED)
        .order_by().values("profile").annotate(n=Count("id")).values("n")[:1]
    )
    return qs.annotate(credentials_verified=Coalesce(Subquery(approved, output_field=IntegerField()), 0))


def verified_count(profile) -> int:
    known = getattr(profile, "credentials_verified", None)
    if known is not None:
        return int(known)
    return Credential.objects.filter(profile=profile, status=Credential.Status.APPROVED).count()
