from datetime import date

from rest_framework import serializers

from apps.chat.crypto import decrypt_text, encrypt_text

from .models import Credential, CredentialFile, CredentialNote

K = Credential.Kind
MAX_FILES_PER_ITEM = 6
MAX_ITEMS = 40


def mask_number(hint: str) -> str:
    return f"№ •••• {hint}" if hint else ""


class CredentialWriteSerializer(serializers.ModelSerializer):
    """Создание и изменение пункта специалистом. number — открытым текстом, хранится шифром."""

    number = serializers.CharField(max_length=60, required=False, allow_blank=True, write_only=True)
    year = serializers.IntegerField(min_value=1950, max_value=2100, required=False, allow_null=True)
    year_end = serializers.IntegerField(min_value=1950, max_value=2100, required=False, allow_null=True)
    hours = serializers.IntegerField(min_value=1, max_value=10000, required=False, allow_null=True)

    class Meta:
        model = Credential
        fields = ["kind", "title", "issuer", "year", "year_end", "supervisor", "hours", "url", "doi", "number"]
        extra_kwargs = {
            "issuer": {"required": False, "allow_blank": True},
            "supervisor": {"required": False, "allow_blank": True},
            "url": {"required": False, "allow_blank": True},
            "doi": {"required": False, "allow_blank": True},
        }

    def validate_title(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Название слишком короткое.")
        return value

    def validate_doi(self, value):
        value = (value or "").strip()
        for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
            if value.lower().startswith(prefix):
                value = value[len(prefix):]
        if value and not value.startswith("10."):
            raise serializers.ValidationError("DOI начинается с «10.», например 10.1037/0000-000.")
        return value

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        year = attrs.get("year", getattr(self.instance, "year", None))
        year_end = attrs.get("year_end", getattr(self.instance, "year_end", None))
        this_year = date.today().year
        if year and year > this_year + 1:
            raise serializers.ValidationError({"year": ["Год ещё не наступил."]})
        if year and year_end and year_end < year:
            raise serializers.ValidationError({"year_end": ["Конец периода раньше начала."]})
        issuer = attrs.get("issuer", getattr(self.instance, "issuer", ""))
        if kind in (K.DIPLOMA, K.RETRAINING, K.METHOD, K.MEMBERSHIP, K.COURSE) and not (issuer or "").strip():
            raise serializers.ValidationError({"issuer": ["Укажите организацию, выдавшую документ."]})
        if kind == K.SUPERVISION:
            supervisor = attrs.get("supervisor", getattr(self.instance, "supervisor", ""))
            if not (supervisor or "").strip():
                raise serializers.ValidationError({"supervisor": ["Укажите супервизора."]})
        if kind == K.PUBLICATION:
            if not (issuer or "").strip():
                raise serializers.ValidationError({"issuer": ["Укажите журнал или издательство."]})
        return attrs

    def _apply_number(self, instance, number):
        if number is None:
            return
        number = number.strip()
        instance.number_enc = encrypt_text(number)
        digits = "".join(ch for ch in number if ch.isalnum())
        instance.number_hint = digits[-4:] if len(digits) > 4 else ""

    def create(self, validated):
        number = validated.pop("number", None)
        instance = Credential(**validated)
        self._apply_number(instance, number)
        instance.save()
        return instance

    def update(self, instance, validated):
        number = validated.pop("number", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        self._apply_number(instance, number)
        instance.save()
        return instance


def file_row(f: CredentialFile, *, public: bool = False, profile_id: int | None = None) -> dict:
    row = {
        "id": str(f.id),
        "mime": f.mime,
        "size": f.size,
        "width": f.width,
        "height": f.height,
        "kind": "pdf" if f.mime == "application/pdf" else "image",
    }
    if public:
        row["url"] = f"/api/v1/psychologists/{profile_id}/credentials/files/{f.id}/"
    else:
        row.update({
            "name": decrypt_text(f.name_enc) or "document",
            "is_public": f.is_public,
            "url": f"/api/v1/credentials/files/{f.id}/",
            "created_at": f.created_at.isoformat(),
        })
    return row


def note_row(n: CredentialNote, *, for_staff: bool) -> dict:
    author = n.get_author_role_display()
    if for_staff and n.author_role == CredentialNote.Author.STAFF and n.author:
        author = n.author.alias
    return {"id": n.id, "author_role": n.author_role, "author": author, "text": n.text,
            "created_at": n.created_at.isoformat()}


def _base(c: Credential) -> dict:
    return {
        "id": str(c.id),
        "kind": c.kind,
        "kind_label": c.get_kind_display(),
        "title": c.title,
        "issuer": c.issuer,
        "year": c.year,
        "year_end": c.year_end,
        "supervisor": c.supervisor,
        "hours": c.hours,
        "url": c.url,
        "doi": c.doi,
    }


def credential_owner(c: Credential) -> dict:
    """Для самого специалиста: всё, включая номер и переписку."""
    return {
        **_base(c),
        "number": decrypt_text(c.number_enc),
        "status": c.status,
        "status_label": c.get_status_display(),
        "reject_reason": c.reject_reason,
        "was_approved": c.was_approved,
        "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        "submitted_at": c.submitted_at.isoformat(),
        "files": [file_row(f) for f in c.files.all()],
        "notes": [note_row(n, for_staff=False) for n in c.notes.all()],
    }


def credential_staff(c: Credential) -> dict:
    p = c.profile
    from apps.photos.utils import photo_url

    return {
        **credential_owner(c),
        "notes": [note_row(n, for_staff=True) for n in c.notes.all()],
        "reviewed_by": c.reviewed_by.alias if c.reviewed_by_id and c.reviewed_by else None,
        "specialist": {
            "id": p.id,
            "display_name": p.display_name,
            "photo_url": photo_url(p),
            "verification_status": p.verification_status,
            "experience_years": p.experience_years,
        },
    }


def credential_public(c: Credential) -> dict:
    return {
        **_base(c),
        "number_masked": mask_number(c.number_hint),
        "verified_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        "files": [file_row(f, public=True, profile_id=c.profile_id) for f in c.files.all() if f.is_public],
    }
