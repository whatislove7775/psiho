"""
Документы специалистов.

Кабинет специалиста   /api/v1/psychologist/credentials/…
Файлы (авторизованно) /api/v1/credentials/files/<id>/          — владелец или сотрудник с specialists.verify
Публично              /api/v1/psychologists/<pk>/credentials/   — только подтверждённые пункты
                      /api/v1/psychologists/<pk>/credentials/files/<id>/ — только публичные файлы подтверждённых пунктов
Персонал              /api/v1/staff/credentials/…               — очередь проверки (specialists.verify)
"""
from urllib.parse import quote

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.chat.crypto import decrypt_bytes, decrypt_text, encrypt_bytes, encrypt_text
from apps.staff.audit import audit
from apps.staff.permissions import StaffPerm
from apps.staff.roles import has_staff_perm
from apps.staff.throttles import STAFF_THROTTLES
from apps.users.models import PsychologistProfile
from apps.users.permissions import IsPsychologist

from .files import FileError, process_upload
from .models import Credential, CredentialFile, CredentialNote
from .serializers import (
    MAX_FILES_PER_ITEM, MAX_ITEMS, CredentialWriteSerializer, credential_owner, credential_public,
    credential_staff, file_row,
)

C = Credential.Status
PAGE_SIZE = 20


class UploadThrottle(UserRateThrottle):
    scope = "credential_upload"
    rate = "60/hour"


def _with_related(qs):
    return qs.prefetch_related("files", Prefetch("notes", queryset=CredentialNote.objects.select_related("author")))


def resubmit(credential: Credential, reason: str | None = None) -> None:
    """Любое существенное изменение пункта отправляет его на (повторную) проверку."""
    if credential.status == C.APPROVED:
        credential.was_approved = True
    credential.status = C.PENDING
    credential.reject_reason = ""
    credential.submitted_at = timezone.now()
    credential.save(update_fields=["status", "reject_reason", "submitted_at", "was_approved", "updated_at"])
    if reason:
        CredentialNote.objects.create(credential=credential, author_role=CredentialNote.Author.SYSTEM, text=reason)


def _file_response(f: CredentialFile, *, cache: str) -> HttpResponse:
    data = decrypt_bytes(f.data_enc)
    name = decrypt_text(f.name_enc) or "document"
    resp = HttpResponse(data, content_type=f.mime)
    resp["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(name)}"
    resp["Cache-Control"] = cache
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Content-Security-Policy"] = "default-src 'none'; sandbox"
    resp["Cross-Origin-Resource-Policy"] = "same-origin"
    return resp


# ── Кабинет специалиста ───────────────────────────────────────────────

class MyCredentialsView(APIView):
    permission_classes = [IsPsychologist]

    def get(self, request):
        profile = request.user.psychologist_profile
        items = _with_related(Credential.objects.filter(profile=profile))
        return Response([credential_owner(c) for c in items])

    def post(self, request):
        profile = request.user.psychologist_profile
        if Credential.objects.filter(profile=profile).count() >= MAX_ITEMS:
            return Response({"detail": f"Можно добавить не больше {MAX_ITEMS} пунктов."}, status=400)
        ser = CredentialWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        credential = ser.save(profile=profile)
        return Response(credential_owner(credential), status=status.HTTP_201_CREATED)


def _own(request, pk) -> Credential:
    return get_object_or_404(
        _with_related(Credential.objects.all()), pk=pk, profile=request.user.psychologist_profile
    )


class MyCredentialDetailView(APIView):
    permission_classes = [IsPsychologist]

    def patch(self, request, pk):
        credential = _own(request, pk)
        before = {k: getattr(credential, k) for k in CredentialWriteSerializer.Meta.fields if k != "number"}
        before_number = decrypt_text(credential.number_enc)
        ser = CredentialWriteSerializer(credential, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        credential = ser.save()
        after = {k: getattr(credential, k) for k in before}
        changed = before != after or (
            "number" in request.data and (request.data.get("number") or "").strip() != before_number
        )
        if changed:
            resubmit(credential, "Специалист изменил данные — пункт снова на проверке."
                     if credential.was_approved or credential.status != C.PENDING else None)
        return Response(credential_owner(_own(request, pk)))

    def delete(self, request, pk):
        _own(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyCredentialFilesView(APIView):
    """POST multipart: file, is_public ("1"/"0")."""

    permission_classes = [IsPsychologist]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [UploadThrottle]

    def post(self, request, pk):
        credential = _own(request, pk)
        if credential.files.count() >= MAX_FILES_PER_ITEM:
            return Response({"detail": f"К одному пункту можно приложить не больше {MAX_FILES_PER_ITEM} файлов."},
                            status=400)
        try:
            info = process_upload(request.FILES.get("file"))
        except FileError as exc:
            return Response({"detail": str(exc)}, status=400)
        is_public = str(request.data.get("is_public", "")).lower() in ("1", "true", "yes", "on")
        with transaction.atomic():
            f = CredentialFile.objects.create(
                credential=credential, name_enc=encrypt_text(info["name"]), mime=info["mime"],
                size=len(info["data"]), width=info["width"], height=info["height"],
                data_enc=encrypt_bytes(info["data"]), is_public=is_public,
            )
            if credential.status != C.PENDING:
                resubmit(credential, "Добавлен новый файл — пункт снова на проверке.")
        return Response(file_row(f), status=status.HTTP_201_CREATED)


class MyCredentialFileView(APIView):
    """PATCH {is_public} · DELETE."""

    permission_classes = [IsPsychologist]

    def _get(self, request, fid) -> CredentialFile:
        return get_object_or_404(
            CredentialFile.objects.select_related("credential"),
            pk=fid, credential__profile=request.user.psychologist_profile,
        )

    def patch(self, request, fid):
        f = self._get(request, fid)
        raw = request.data.get("is_public")
        if raw is None:
            return Response({"is_public": ["Обязательное поле."]}, status=400)
        is_public = raw is True or str(raw).lower() in ("1", "true", "yes", "on")
        if is_public != f.is_public:
            f.is_public = is_public
            f.save(update_fields=["is_public"])
            # Открыть файл всем можно только после взгляда сотрудника
            if is_public and f.credential.status == C.APPROVED:
                resubmit(f.credential, "Файл стал публичным — сотрудник проверит, что в нём нет лишних данных.")
        return Response(file_row(f))

    def delete(self, request, fid):
        f = self._get(request, fid)
        # Убрать файл можно без повторной проверки: публичных данных становится только меньше
        f.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NoteSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=2000)

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Напишите сообщение.")
        return value


class MyCredentialNotesView(APIView):
    """Ответ специалиста на вопрос сотрудника: пункт снова уходит на проверку."""

    permission_classes = [IsPsychologist]

    def post(self, request, pk):
        credential = _own(request, pk)
        ser = NoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        CredentialNote.objects.create(
            credential=credential, author=request.user, author_role=CredentialNote.Author.SPECIALIST,
            text=ser.validated_data["text"],
        )
        if credential.status in (C.NEEDS_INFO, C.REJECTED):
            resubmit(credential)
        return Response(credential_owner(_own(request, pk)), status=status.HTTP_201_CREATED)


# ── Файл: владелец или сотрудник ─────────────────────────────────────

class CredentialFileContentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, fid):
        f = CredentialFile.objects.select_related("credential__profile").filter(pk=fid).first()
        if f is None:
            raise Http404
        owner = f.credential.profile.user_id == request.user.pk
        if not owner and not has_staff_perm(request.user, "specialists.verify"):
            raise Http404  # не раскрываем, что файл существует
        return _file_response(f, cache="private, no-store")


# ── Публично ─────────────────────────────────────────────────────────

def _public_profile(pk) -> PsychologistProfile:
    return get_object_or_404(
        PsychologistProfile, pk=pk, verification_status=PsychologistProfile.VerificationStatus.APPROVED,
        user__is_active=True,
    )


class PublicCredentialsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        profile = _public_profile(pk)
        items = Credential.objects.filter(profile=profile, status=C.APPROVED).prefetch_related("files")
        return Response([credential_public(c) for c in items])


class PublicCredentialFileView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk, fid):
        profile = _public_profile(pk)
        f = CredentialFile.objects.filter(
            pk=fid, is_public=True, credential__profile=profile, credential__status=C.APPROVED,
        ).first()
        if f is None:
            raise Http404
        return _file_response(f, cache="public, max-age=3600")


# ── Персонал: очередь проверки ───────────────────────────────────────

class StaffCredentialListView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm("specialists.verify")()]

    def get(self, request):
        qs = _with_related(Credential.objects.select_related("profile", "profile__photo", "reviewed_by"))
        st = request.query_params.get("status", "pending")
        if st in C.values:
            qs = qs.filter(status=st)
        spec = request.query_params.get("specialist")
        if spec and spec.isdigit():
            qs = qs.filter(profile_id=int(spec))
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(profile__display_name__icontains=q) | Q(title__icontains=q) | Q(issuer__icontains=q))
        qs = qs.order_by("submitted_at" if st in (C.PENDING, "") else "-reviewed_at", "id")
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        total = qs.count()
        pages = max(1, -(-total // PAGE_SIZE))
        page = min(page, pages)
        items = list(qs[(page - 1) * PAGE_SIZE: page * PAGE_SIZE])
        counts = dict(Credential.objects.values_list("status").annotate(n=Count("id")))
        return Response({
            "count": total, "page": page, "pages": pages,
            "results": [credential_staff(c) for c in items],
            "counts": {s: counts.get(s, 0) for s in C.values},
        })


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject", "request_info"])
    comment = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        attrs["comment"] = attrs["comment"].strip()
        if attrs["decision"] in ("reject", "request_info") and not attrs["comment"]:
            raise serializers.ValidationError({"comment": ["Напишите специалисту, что не так и что сделать."]})
        return attrs


class StaffCredentialDetailView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [StaffPerm("specialists.verify")()]

    def _get(self, pk):
        return get_object_or_404(
            _with_related(Credential.objects.select_related("profile", "profile__photo", "reviewed_by")), pk=pk
        )

    def get(self, request, pk):
        return Response(credential_staff(self._get(pk)))

    def post(self, request, pk):
        """Решение: approve · reject (comment = причина) · request_info (comment = вопрос)."""
        credential = self._get(pk)
        ser = DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        decision, comment = ser.validated_data["decision"], ser.validated_data["comment"]
        before = credential.status
        with transaction.atomic():
            if decision == "approve":
                credential.status = C.APPROVED
                credential.reject_reason = ""
                credential.was_approved = True
            elif decision == "reject":
                credential.status = C.REJECTED
                credential.reject_reason = comment[:500]
            else:
                credential.status = C.NEEDS_INFO
            credential.reviewed_by = request.user
            credential.reviewed_at = timezone.now()
            credential.save(update_fields=["status", "reject_reason", "was_approved", "reviewed_by",
                                           "reviewed_at", "updated_at"])
            if comment:
                CredentialNote.objects.create(credential=credential, author=request.user,
                                              author_role=CredentialNote.Author.STAFF, text=comment)
            audit(request, f"credential.{decision}",
                  target=("credential", credential.pk, f"{credential.profile.display_name}: {credential.title}"),
                  details={"from": before, "to": credential.status, "kind": credential.kind,
                           "specialist": credential.profile_id})
        return Response(credential_staff(self._get(pk)))
