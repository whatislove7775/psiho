"""
API баланса для клиентов и специалистов + вебхук ЮKassa.  Префикс: /api/v1/billing/

Клиент
    GET  summary/                      баланс, заморожено, настройки пополнения
    GET  history/                      операции по балансу
    POST topups/                       {amount_rub, method, receipt_email?, receipt_phone?} → confirmation
    GET  topups/<id>/                  статус пополнения (перезапрашивается у провайдера)
    POST topups/<id>/mock/             {outcome: succeeded|canceled} — только тестовая касса
    POST redeem/                       {code} — подарочный код
    GET  quote/?psychologist=&minutes= цена созвона и хватает ли баланса
    GET  calls/<session_id>/           что нужно оплатить
    POST calls/<session_id>/pay/       оплатить с баланса (402 insufficient_funds)
Специалист
    GET  earnings/                     ожидает / доступно / выплачено, по созвонам, выплаты
    PUT  earnings/method/              реквизиты (шифруются)
    POST earnings/payouts/             {amount_rub?} запрос выплаты
Провайдер
    POST webhook/yookassa/             уведомления ЮKassa (IP allowlist + перезапрос объекта)
"""
import json
import logging
from decimal import Decimal, InvalidOperation

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.staff.audit import client_ip

from . import conf
from .ledger import InsufficientFunds, balance_of
from .models import Account, Entry, Hold, LedgerTransaction, PayoutMethod, PayoutRequest, TopUp
from .providers import METHOD_LABELS, ProviderError, available_providers, default_payout_rail, yookassa_ip_allowed
from .services import (
    BillingError, create_topup, handle_yookassa_webhook, hold_for_call, maybe_sweep, mock_checkout, quote_call,
    redeem_gift_code, refresh_topup, request_payout, set_payout_method,
)

logger = logging.getLogger(__name__)
K = Account.Kind
T = LedgerTransaction.Kind


class TopUpThrottle(UserRateThrottle):
    scope = "billing_topup"
    rate = "10/min"


class RedeemThrottle(UserRateThrottle):
    scope = "billing_redeem"
    rate = "5/min"


class PayThrottle(UserRateThrottle):
    scope = "billing_pay"
    rate = "30/min"


class PayoutThrottle(UserRateThrottle):
    scope = "billing_payout"
    rate = "10/min"


def err(message: str, code: str = "billing_error", http=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"detail": message, "code": code, **extra}, status=http)


def parse_rub(value) -> int | None:
    """Рубли (число или строка «1 000,50») → копейки."""
    if value is None or value == "":
        return None
    try:
        d = Decimal(str(value).replace(" ", "").replace(" ", "").replace(",", "."))
    except InvalidOperation:
        return None
    if d.is_nan() or d.is_infinite():
        return None
    return int((d * 100).quantize(Decimal("1")))


def only_role(request, role: str):
    if getattr(request.user, "role", None) != role:
        text = "Раздел доступен только клиентам." if role == "client" else "Раздел доступен только специалистам."
        return err(text, "forbidden", status.HTTP_403_FORBIDDEN)
    return None


def topup_payload(t: TopUp) -> dict:
    return {
        "id": str(t.id),
        "status": t.status,
        "amount_kopecks": t.amount_kopecks,
        "provider": t.provider,
        "test": t.is_test,
        "method": t.method,
        "created_at": t.created_at.isoformat(),
        "paid_at": t.paid_at.isoformat() if t.paid_at else None,
        "confirmation": {
            "type": t.confirmation_type,
            "url": t.confirmation_url or None,
            "token": t.confirmation_token or None,
        } if t.status == TopUp.Status.PENDING else None,
    }


def hold_payload(h: Hold) -> dict:
    from apps.photos.utils import photo_url

    session = h.session
    profile = session.psychologist_profile if session else None
    return {
        "id": str(h.id),
        "session_id": str(h.session_ref),
        "status": h.status,
        "amount_kopecks": h.amount_kopecks,
        "returned_kopecks": h.returned_kopecks,
        "reason": h.reason,
        "scheduled_at": h.scheduled_at.isoformat() if h.scheduled_at else None,
        "duration_minutes": h.duration_minutes,
        "specialist": {"name": profile.display_name, "photo_url": photo_url(profile)} if profile else None,
    }


class SummaryView(APIView):
    def get(self, request):
        maybe_sweep()
        user = request.user
        providers = available_providers()
        return Response({
            "balance_kopecks": balance_of(user, K.CLIENT),
            "held_kopecks": balance_of(user, K.CLIENT_HOLD),
            "topup": {
                "providers": providers,
                "test_mode": providers[:1] == ["mock"],
                "min_kopecks": conf.topup_min_kopecks(),
                "max_kopecks": conf.topup_max_kopecks(),
                "presets_rub": conf.topup_presets_rub(),
                "methods": [{"id": k, "label": v} for k, v in METHOD_LABELS.items()] if "yookassa" in providers
                else [{"id": "any", "label": METHOD_LABELS["any"]}],
                "receipts": {"enabled": conf.receipts_enabled() and "yookassa" in providers,
                             "required": conf.receipt_required()},
                "confirmation": conf.confirmation_type(),
            },
            "cancel_rules": {
                "free_cancel_hours": conf.free_cancel_hours(),
                "late_cancel_penalty_percent": conf.late_cancel_penalty_percent(),
            },
        })


HISTORY_LABELS = {
    T.TOPUP: "Пополнение",
    T.TOPUP_REFUND: "Возврат на карту",
    T.TOPUP_REFUND_REVERSAL: "Возврат на карту не прошёл",
    T.HOLD: "Оплата созвона",
    T.RELEASE: "Возврат за созвон",
    T.CAPTURE: "Возврат за созвон",
    T.CALL_REFUND: "Возврат за созвон",
    T.GIFT_REDEEM: "Подарочный код",
    T.ADJUSTMENT: "Корректировка от поддержки",
    T.COMPANY_TOPUP: "Пополнение бюджета компании",
}


def _circle_refs(refs) -> set:
    """Какие из заморозок — оплата «Кругов» (apps.circles), а не созвонов."""
    from django.apps import apps as django_apps

    if not refs or not django_apps.is_installed("apps.circles"):
        return set()
    from apps.circles.models import Charge

    return set(Charge.objects.filter(ref__in=refs).values_list("ref", flat=True))


class HistoryView(APIView):
    def get(self, request):
        user = request.user
        try:
            limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
        except ValueError:
            limit = 50
        entries = (
            Entry.objects.filter(account__key=f"{K.CLIENT}:{user.pk}")
            .select_related("transaction").order_by("-created_at", "-id")[:limit]
        )
        entries = list(entries)
        sids = {e.transaction.session_id for e in entries if e.transaction.session_id}
        holds = {
            h.session_ref: h
            for h in Hold.objects.filter(session_ref__in=sids).select_related("session__psychologist_profile__photo")
        }
        circle_refs = _circle_refs(sids)
        items = []
        for e in entries:
            txn = e.transaction
            hold = holds.get(txn.session_id) if txn.session_id else None
            item = {
                "id": str(txn.id),
                "kind": txn.kind,
                "label": HISTORY_LABELS.get(txn.kind, txn.get_kind_display()),
                "amount_kopecks": e.amount_kopecks,
                "created_at": txn.created_at.isoformat(),
                "test": (txn.metadata or {}).get("provider") == "mock",
                "call": hold_payload(hold) if hold else None,
            }
            if hold is not None and hold.session_ref in circle_refs:
                # Групповые «Круги» (apps.circles): заморозка без созвона
                item["label"] = "Оплата круга" if txn.kind == T.HOLD else "Возврат за круг"
            if txn.kind == T.ADJUSTMENT:
                item["note"] = txn.memo
            if txn.kind in (T.RELEASE, T.CAPTURE) and hold and hold.reason == "late_cancel":
                item["label"] = "Возврат за созвон (поздняя отмена)"
            items.append(item)
        active = Hold.objects.filter(client_ref=str(user.pk), status=Hold.Status.ACTIVE).select_related(
            "session__psychologist_profile__photo").order_by("scheduled_at")
        pending = TopUp.objects.filter(user=user, status=TopUp.Status.PENDING).order_by("-created_at")[:3]
        return Response({
            "items": items,
            "holds": [hold_payload(h) for h in active],
            "pending_topups": [topup_payload(t) for t in pending],
        })


class TopUpCreateView(APIView):
    throttle_classes = [TopUpThrottle]

    def post(self, request):
        denied = only_role(request, "client")
        if denied:
            return denied
        amount = parse_rub(request.data.get("amount_rub"))
        if amount is None:
            return err("Укажите сумму.")
        provider = request.data.get("provider") or None
        if provider == "mock":
            from apps.staff.roles import has_staff_perm

            # Тестовую кассу при живой ЮKassa разрешаем только для лаборатории
            if "mock" not in available_providers() and not has_staff_perm(request.user, "lab.use"):
                return err("Тестовая оплата выключена.")
        try:
            t = create_topup(
                request.user, amount, method=str(request.data.get("method") or "any"),
                receipt_email=str(request.data.get("receipt_email") or ""),
                receipt_phone=str(request.data.get("receipt_phone") or ""),
                provider=provider if provider in ("mock", "yookassa") else None,
                return_to=str(request.data.get("return_to") or ""),
            )
        except BillingError as exc:
            return err(str(exc))
        return Response(topup_payload(t), status=status.HTTP_201_CREATED)


class TopUpDetailView(APIView):
    def get(self, request, pk):
        t = get_object_or_404(TopUp, pk=pk, user=request.user)
        t = refresh_topup(t)
        return Response({**topup_payload(t), "balance_kopecks": balance_of(request.user, K.CLIENT)})


class MockCheckoutView(APIView):
    def post(self, request, pk):
        t = get_object_or_404(TopUp, pk=pk, user=request.user)
        outcome = request.data.get("outcome")
        if outcome not in ("succeeded", "canceled"):
            return err("Неизвестный результат.")
        try:
            t = mock_checkout(t, outcome)
        except BillingError as exc:
            return err(str(exc))
        return Response({**topup_payload(t), "balance_kopecks": balance_of(request.user, K.CLIENT)})


class RedeemView(APIView):
    throttle_classes = [RedeemThrottle]

    def post(self, request):
        denied = only_role(request, "client")
        if denied:
            return denied
        code = str(request.data.get("code") or "")[:40]
        if not code.strip():
            return err("Введите код.")
        try:
            amount = redeem_gift_code(request.user, code)
        except BillingError as exc:
            return err(str(exc))
        return Response({"amount_kopecks": amount, "balance_kopecks": balance_of(request.user, K.CLIENT)})


class QuoteView(APIView):
    def get(self, request):
        from apps.users.models import PsychologistProfile

        try:
            profile = PsychologistProfile.objects.get(pk=int(request.query_params.get("psychologist", 0)))
            minutes = int(request.query_params.get("minutes", 50))
        except (ValueError, PsychologistProfile.DoesNotExist):
            return err("Специалист не найден.", http=status.HTTP_404_NOT_FOUND)
        amount = int(quote_call(profile, minutes) * 100)
        balance = balance_of(request.user, K.CLIENT)
        company = _company_preview(request.user, amount)
        return Response({
            "amount_kopecks": amount, "balance_kopecks": balance, "enough": balance + company >= amount,
            "shortfall_kopecks": max(0, amount - company - balance), "company_kopecks": company,
        })


def _company_preview(user, amount: int) -> int:
    """Сколько из суммы оплатит программа компании (apps.business), если она есть."""
    from django.apps import apps as django_apps

    if amount <= 0 or not django_apps.is_installed("apps.business"):
        return 0
    from apps.business.funding import preview_call

    return preview_call(user, amount)


def _client_session(request, pk):
    from apps.sessions.models import ConsultationSession

    return ConsultationSession.objects.select_related("psychologist_profile__photo").filter(
        pk=pk, client=request.user).first()


def call_payload(request, session) -> dict:
    from apps.photos.utils import photo_url

    hold = Hold.objects.filter(session_ref=session.pk).first()
    balance = balance_of(request.user, K.CLIENT)
    company = _company_preview(request.user, session.amount_kopecks) if hold is None else 0
    profile = session.psychologist_profile
    return {
        "session_id": str(session.pk),
        "status": session.status,
        "scheduled_at": session.scheduled_at.isoformat(),
        "duration_minutes": session.duration_minutes,
        "amount_kopecks": session.amount_kopecks,
        "specialist": {"id": profile.id, "name": profile.display_name, "photo_url": photo_url(profile)},
        "hold": hold_payload(hold) if hold else None,
        "paid": bool(hold and hold.status in (Hold.Status.ACTIVE, Hold.Status.CAPTURED, Hold.Status.PARTIAL)),
        "payable": session.status == "awaiting_payment" and hold is None,
        "balance_kopecks": balance,
        "shortfall_kopecks": max(0, session.amount_kopecks - company - balance) if hold is None else 0,
        "company_kopecks": company,
    }


class CallView(APIView):
    def get(self, request, pk):
        session = _client_session(request, pk)
        if session is None:
            return err("Запись не найдена.", "not_found", status.HTTP_404_NOT_FOUND)
        return Response(call_payload(request, session))


class PayCallView(APIView):
    throttle_classes = [PayThrottle]

    def post(self, request, pk):
        session = _client_session(request, pk)
        if session is None:
            return err("Запись не найдена.", "not_found", status.HTTP_404_NOT_FOUND)
        try:
            hold_for_call(session)
        except InsufficientFunds as exc:
            return err(
                "На балансе не хватает денег. Пополните баланс — запись сохранится.", "insufficient_funds",
                status.HTTP_402_PAYMENT_REQUIRED, shortfall_kopecks=exc.shortfall_kopecks,
                balance_kopecks=exc.balance_kopecks,
            )
        except BillingError as exc:
            return err(str(exc))
        session.refresh_from_db()
        return Response(call_payload(request, session))


# ── Специалист ────────────────────────────────────────────────────

def payout_payload(p: PayoutRequest) -> dict:
    return {
        "id": str(p.id),
        "amount_kopecks": p.amount_kopecks,
        "status": p.status,
        "rail": p.rail,
        "destination": p.destination_masked,
        "note": p.note if p.status in ("rejected", "failed") else "",
        "created_at": p.created_at.isoformat(),
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
    }


class EarningsView(APIView):
    def get(self, request):
        denied = only_role(request, "psychologist")
        if denied:
            return denied
        maybe_sweep()
        user = request.user
        paid_total = PayoutRequest.objects.filter(specialist_ref=str(user.pk), status=PayoutRequest.Status.PAID).aggregate(
            s=Sum("amount_kopecks"))["s"] or 0
        holds = (
            Hold.objects.filter(specialist_ref=str(user.pk))
            .exclude(status=Hold.Status.RELEASED)
            .select_related("session__client").order_by("-scheduled_at")[:100]
        )
        calls = []
        for h in holds:
            calls.append({
                "id": str(h.id),
                "session_id": str(h.session_ref),
                "scheduled_at": h.scheduled_at.isoformat() if h.scheduled_at else None,
                "duration_minutes": h.duration_minutes,
                "client_alias": h.session.client.alias if h.session and h.session.client_id else (
                    "Участник круга" if not h.session_id and h.duration_minutes else "Удалённый аккаунт"),
                "status": h.status,
                "reason": h.reason,
                "gross_kopecks": h.amount_kopecks if h.status == Hold.Status.ACTIVE else h.specialist_kopecks + h.fee_kopecks,
                "fee_kopecks": h.fee_kopecks if h.status != Hold.Status.ACTIVE else _expected_fee(h.amount_kopecks),
                "net_kopecks": h.specialist_kopecks if h.status != Hold.Status.ACTIVE else h.amount_kopecks - _expected_fee(h.amount_kopecks),
                "available": h.matured,
                "available_at": h.available_at.isoformat() if h.available_at else None,
            })
        method = PayoutMethod.objects.filter(user=user).first()
        upcoming = sum(c["net_kopecks"] for c in calls if c["status"] == Hold.Status.ACTIVE)
        return Response({
            "pending_kopecks": balance_of(user, K.SPEC_PENDING),
            "available_kopecks": balance_of(user, K.SPEC_AVAILABLE),
            "in_payout_kopecks": balance_of(user, K.SPEC_PAYOUT),
            "paid_kopecks": paid_total,
            "upcoming_kopecks": upcoming,
            "fee_percent": float(conf.platform_fee_percent()),
            "hold_hours": conf.earnings_hold_hours(),
            "payout_min_kopecks": conf.payout_min_kopecks(),
            "payout_rail": default_payout_rail(),
            "method": {"kind": method.kind, "masked": method.masked, "tax_status": method.tax_status,
                       "updated_at": method.updated_at.isoformat()} if method else None,
            "calls": calls,
            "payouts": [payout_payload(p) for p in PayoutRequest.objects.filter(specialist_ref=str(user.pk))[:50]],
        })


def _expected_fee(amount: int) -> int:
    from .services import split_fee

    return split_fee(amount)[1]


class PayoutMethodView(APIView):
    throttle_classes = [PayoutThrottle]

    def put(self, request):
        denied = only_role(request, "psychologist")
        if denied:
            return denied
        data = request.data if isinstance(request.data, dict) else {}
        try:
            m = set_payout_method(
                request.user, kind=str(data.get("kind") or ""), tax_status=str(data.get("tax_status") or "self_employed"),
                details={k: str(data.get(k) or "") for k in (
                    "phone", "bank_name", "bank_id", "account", "bik", "recipient", "inn", "token", "last4")},
            )
        except BillingError as exc:
            return err(str(exc))
        return Response({"kind": m.kind, "masked": m.masked, "tax_status": m.tax_status,
                         "updated_at": m.updated_at.isoformat()})


class PayoutCreateView(APIView):
    throttle_classes = [PayoutThrottle]

    def post(self, request):
        denied = only_role(request, "psychologist")
        if denied:
            return denied
        raw = request.data.get("amount_rub")
        amount = parse_rub(raw) if raw not in (None, "") else None
        try:
            p = request_payout(request.user, amount)
        except BillingError as exc:
            return err(str(exc))
        return Response(payout_payload(p), status=status.HTTP_201_CREATED)


# ── Вебхук ────────────────────────────────────────────────────────

class YooKassaWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ip = client_ip(request)
        if conf.webhook_ip_check() and not yookassa_ip_allowed(ip):
            logger.warning("yookassa webhook from non-allowlisted ip")
            return Response(status=status.HTTP_403_FORBIDDEN)
        try:
            payload = json.loads(request.body or b"{}")
        except (ValueError, TypeError):
            return Response(status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(payload, dict):
            return Response(status=status.HTTP_400_BAD_REQUEST)
        try:
            result = handle_yookassa_webhook(payload, ip)
        except (ProviderError, BillingError):
            logger.exception("yookassa webhook: provider check failed")
            return Response(status=status.HTTP_502_BAD_GATEWAY)  # ЮKassa повторит
        return Response({"result": result})
