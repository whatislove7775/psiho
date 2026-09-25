"""
Финансы для персонала: /api/v1/billing/staff/…  Права: finance.view (чтение), finance.manage (действия).
Клиенты видны только по псевдониму. Каждое действие пишется в журнал (apps.staff.audit).
"""
import csv
import io
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.staff.audit import audit
from apps.staff.permissions import StaffPerm
from apps.staff.throttles import STAFF_THROTTLES

from . import conf
from .ledger import account_for, verify
from .models import Account, Entry, GiftBatch, GiftCode, Hold, LedgerTransaction, PayoutMethod, PayoutRequest, TopUp, WebhookEvent
from .providers import ProviderError, available_providers, default_payout_rail, get_provider
from .services import (
    BillingError, adjust_client_balance, approve_payout, capture_for_call, generate_gift_batch, kind_total,
    mark_payout_paid, payout_details_for_staff, refund_captured_call, refund_topup_to_card, refresh_topup,
    reject_payout, release_for_call, revoke_gift_batch, sweep,
)
from .views import err, parse_rub, payout_payload

K = Account.Kind
View = StaffPerm("finance.view")
Manage = StaffPerm("finance.manage")


class StaffBase(APIView):
    permission_classes = [View]
    throttle_classes = STAFF_THROTTLES


class StaffAction(APIView):
    permission_classes = [Manage]
    throttle_classes = STAFF_THROTTLES


def _alias(user_id) -> str:
    if not user_id:
        return "Удалённый аккаунт"
    u = get_user_model().objects.filter(pk=user_id).only("alias").first()
    return u.alias if u else "Удалённый аккаунт"


class OverviewView(StaffBase):
    def get(self, request):
        now = timezone.now()
        month = now - timedelta(days=30)
        topups = TopUp.objects.filter(status=TopUp.Status.SUCCEEDED)
        live = topups.exclude(provider="mock")
        gifts_outstanding = GiftCode.objects.filter(status=GiftCode.Status.ACTIVE, batch__revoked=False).filter(
            Q(batch__expires_at__isnull=True) | Q(batch__expires_at__gt=now)
        ).aggregate(s=Sum("batch__amount_kopecks"))["s"] or 0
        check = verify()
        return Response({
            "clients_kopecks": kind_total(K.CLIENT),
            "holds_kopecks": kind_total(K.CLIENT_HOLD),
            "spec_pending_kopecks": kind_total(K.SPEC_PENDING),
            "spec_available_kopecks": kind_total(K.SPEC_AVAILABLE),
            "spec_payout_kopecks": kind_total(K.SPEC_PAYOUT),
            "platform_fee_kopecks": kind_total(K.PLATFORM_FEE),
            "payouts_sent_kopecks": kind_total(K.PAYOUTS_SENT),
            "topups_live_kopecks": live.aggregate(s=Sum("amount_kopecks"))["s"] or 0,
            "topups_test_kopecks": topups.filter(provider="mock").aggregate(s=Sum("amount_kopecks"))["s"] or 0,
            "topups_month_kopecks": live.filter(paid_at__gte=month).aggregate(s=Sum("amount_kopecks"))["s"] or 0,
            "fee_month_kopecks": Hold.objects.filter(settled_at__gte=month).aggregate(s=Sum("fee_kopecks"))["s"] or 0,
            "gifts_outstanding_kopecks": gifts_outstanding,
            "gifts_redeemed_kopecks": -(Account.objects.filter(kind=K.GIFT).aggregate(s=Sum("balance_kopecks"))["s"] or 0),
            "open_payouts": PayoutRequest.objects.filter(status__in=PayoutRequest.OPEN).count(),
            "active_holds": Hold.objects.filter(status=Hold.Status.ACTIVE).count(),
            "ledger_ok": check["ok"],
            "provider": {
                "available": available_providers(),
                "yookassa_live": conf.yookassa_live(),
                "mock_enabled": conf.mock_enabled(),
                "payout_rail": default_payout_rail(),
                "receipts_enabled": conf.receipts_enabled(),
                "fee_percent": float(conf.platform_fee_percent()),
                "free_cancel_hours": conf.free_cancel_hours(),
                "late_cancel_penalty_percent": conf.late_cancel_penalty_percent(),
                "earnings_hold_hours": conf.earnings_hold_hours(),
            },
        })


class BalancesView(StaffBase):
    """Клиенты с деньгами на балансе или в заморозке — только псевдоним."""

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        qs = Account.objects.filter(kind__in=(K.CLIENT, K.CLIENT_HOLD)).exclude(balance_kopecks=0)
        if q:
            qs = qs.filter(user__alias__icontains=q)
        rows: dict[str, dict] = {}
        for acc in qs.select_related("user").order_by("-balance_kopecks")[:400]:
            uid = acc.key.split(":", 1)[1]
            row = rows.setdefault(uid, {"user_id": uid, "alias": acc.user.alias if acc.user else "Удалённый аккаунт",
                                        "balance_kopecks": 0, "held_kopecks": 0})
            if acc.kind == K.CLIENT:
                row["balance_kopecks"] = acc.balance_kopecks
            else:
                row["held_kopecks"] = acc.balance_kopecks
        if q and not rows:
            for u in get_user_model().objects.filter(alias__icontains=q, role="client")[:20]:
                rows[str(u.pk)] = {"user_id": str(u.pk), "alias": u.alias, "balance_kopecks": 0, "held_kopecks": 0}
        items = sorted(rows.values(), key=lambda r: -(r["balance_kopecks"] + r["held_kopecks"]))[:200]
        return Response({"items": items})


def _hold_row(h: Hold) -> dict:
    return {
        "id": str(h.id),
        "session_id": str(h.session_ref),
        "status": h.status,
        "reason": h.reason,
        "amount_kopecks": h.amount_kopecks,
        "specialist_kopecks": h.specialist_kopecks,
        "fee_kopecks": h.fee_kopecks,
        "returned_kopecks": h.returned_kopecks,
        "scheduled_at": h.scheduled_at.isoformat() if h.scheduled_at else None,
        "duration_minutes": h.duration_minutes,
        "session_status": h.session.status if h.session else None,
        "client_alias": _alias(h.client_ref) if not h.client_id else h.client.alias,
        "specialist": (h.session.psychologist_profile.display_name if h.session else _alias(h.specialist_ref)),
        "matured": h.matured,
        "created_at": h.created_at.isoformat(),
        "settled_at": h.settled_at.isoformat() if h.settled_at else None,
    }


class HoldsView(StaffBase):
    def get(self, request):
        st = request.query_params.get("status") or "active"
        qs = Hold.objects.select_related("client", "session__psychologist_profile")
        if st != "all":
            qs = qs.filter(status=st)
        return Response({"items": [_hold_row(h) for h in qs.order_by("-created_at")[:200]]})


class HoldSettleView(StaffAction):
    """Ручное решение по созвону: capture | release | penalty {percent} | refund (после списания)."""

    def post(self, request, pk):
        hold = get_object_or_404(Hold, pk=pk)
        action = request.data.get("action")
        reason = str(request.data.get("reason") or "").strip()[:200]
        if not reason:
            return err("Укажите причину — она попадёт в журнал.")
        try:
            if action == "capture":
                capture_for_call(hold.session_ref, by=request.user, reason="staff_capture")
            elif action == "release":
                release_for_call(hold.session_ref, "staff_refund", by=request.user)
            elif action == "penalty":
                pct = int(request.data.get("percent", 0))
                release_for_call(hold.session_ref, "staff_penalty", penalty_percent=pct, by=request.user)
            elif action == "refund":
                refund_captured_call(hold, by=request.user)
            else:
                return err("Неизвестное действие.")
        except (BillingError, ValueError) as exc:
            return err(str(exc))
        hold.refresh_from_db()
        audit(request, f"finance.hold.{action}", target=("call", str(hold.session_ref), f"Созвон {str(hold.session_ref)[:8]}"),
              details={"amount_kopecks": hold.amount_kopecks, "status": hold.status, "reason": reason})
        return Response(_hold_row(hold))


def _payout_row(p: PayoutRequest, *, with_method: bool = False) -> dict:
    row = payout_payload(p)
    row.update({
        "specialist": _alias(p.specialist_ref),
        "specialist_name": getattr(getattr(p.specialist, "psychologist_profile", None), "display_name", "") if p.specialist else "",
        "note": p.note,
        "decided_at": p.decided_at.isoformat() if p.decided_at else None,
        "provider_payout_id": p.provider_payout_id or "",
    })
    if with_method:
        m = PayoutMethod.objects.filter(user_id=p.specialist_ref or None).first()
        row["tax_status"] = m.tax_status if m else ""
    return row


class PayoutsView(StaffBase):
    def get(self, request):
        st = request.query_params.get("status") or "open"
        qs = PayoutRequest.objects.select_related("specialist__psychologist_profile")
        if st == "open":
            qs = qs.filter(status__in=PayoutRequest.OPEN)
        elif st != "all":
            qs = qs.filter(status=st)
        return Response({"items": [_payout_row(p, with_method=True) for p in qs.order_by("-created_at")[:200]]})


class PayoutActionView(StaffAction):
    def post(self, request, pk, action):
        p = get_object_or_404(PayoutRequest, pk=pk)
        note = str(request.data.get("note") or "").strip()[:300]
        try:
            if action == "approve":
                p = approve_payout(p, by=request.user)
            elif action == "paid":
                p = mark_payout_paid(p, by=request.user, note=note)
            elif action == "reject":
                if not note:
                    return err("Напишите специалисту причину отказа.")
                p = reject_payout(p, by=request.user, note=note)
            else:
                return err("Неизвестное действие.")
        except BillingError as exc:
            return err(str(exc))
        audit(request, f"finance.payout.{action}", target=("payout", str(p.pk), f"Выплата {_alias(p.specialist_ref)}"),
              details={"amount_kopecks": p.amount_kopecks, "status": p.status, "rail": p.rail})
        return Response(_payout_row(p, with_method=True))


class PayoutDetailsView(StaffAction):
    """Полные реквизиты для ручного перевода. Показ каждый раз пишется в журнал."""

    def post(self, request, pk):
        p = get_object_or_404(PayoutRequest, pk=pk)
        if p.status not in PayoutRequest.OPEN:
            return err("Реквизиты показываются только для открытых выплат.")
        m = PayoutMethod.objects.filter(user_id=p.specialist_ref or None).first()
        if m is None:
            return err("Специалист удалил реквизиты.")
        details = payout_details_for_staff(m)
        audit(request, "finance.payout.details_view", target=("payout", str(p.pk), f"Выплата {_alias(p.specialist_ref)}"),
              details={"kind": m.kind})
        details.pop("token", None)
        return Response({"kind": m.kind, "tax_status": m.tax_status, "details": details})


class TopUpsView(StaffBase):
    def get(self, request):
        st = request.query_params.get("status") or "all"
        qs = TopUp.objects.select_related("user")
        if st != "all":
            qs = qs.filter(status=st)
        items = [{
            "id": str(t.id), "alias": t.user.alias if t.user else "Удалённый аккаунт", "provider": t.provider,
            "provider_payment_id": t.provider_payment_id or "", "amount_kopecks": t.amount_kopecks, "status": t.status,
            "method": t.method, "with_receipt": t.with_receipt, "created_at": t.created_at.isoformat(),
            "paid_at": t.paid_at.isoformat() if t.paid_at else None, "refunded_kopecks": t.refunded_kopecks,
        } for t in qs.order_by("-created_at")[:200]]
        return Response({"items": items})


class TopUpActionView(StaffAction):
    def post(self, request, pk, action):
        t = get_object_or_404(TopUp, pk=pk)
        try:
            if action == "refund":
                t = refund_topup_to_card(t, by=request.user)
            elif action == "sync":
                t = refresh_topup(t)
            else:
                return err("Неизвестное действие.")
        except BillingError as exc:
            return err(str(exc))
        audit(request, f"finance.topup.{action}", target=("topup", str(t.pk), f"Пополнение {t.amount_kopecks // 100} ₽"),
              details={"amount_kopecks": t.amount_kopecks, "status": t.status, "provider": t.provider})
        return Response({"id": str(t.id), "status": t.status})


class AdjustView(StaffAction):
    """Возврат/зачисление на баланс клиента (или списание — отрицательная сумма)."""

    def post(self, request):
        alias = str(request.data.get("alias") or "").strip()
        user = get_user_model().objects.filter(alias=alias, role="client").first()
        if user is None:
            return err("Клиент с таким псевдонимом не найден.")
        amount = parse_rub(request.data.get("amount_rub"))
        if amount is None:
            return err("Укажите сумму.")
        key = str(request.data.get("key") or "")[:64]
        if len(key) < 8:
            return err("Нет ключа идемпотентности.")
        reason = str(request.data.get("reason") or "")
        try:
            txn = adjust_client_balance(user, amount, reason=reason, key=key, by=request.user)
        except BillingError as exc:
            return err(str(exc))
        audit(request, "finance.adjust", target=user, details={"amount_kopecks": amount, "reason": reason[:200]})
        return Response({"id": str(txn.id), "balance_kopecks": account_for(user, K.CLIENT).balance_kopecks})


class GiftsView(APIView):
    throttle_classes = STAFF_THROTTLES

    def get_permissions(self):
        return [Manage()] if self.request.method == "POST" else [View()]

    def get(self, request):
        batches = GiftBatch.objects.annotate(
            redeemed=Count("codes", filter=Q(codes__status=GiftCode.Status.REDEEMED)),
        ).order_by("-created_at")[:100]
        return Response({"items": [{
            "id": str(b.id), "label": b.label, "amount_kopecks": b.amount_kopecks, "count": b.count,
            "redeemed": b.redeemed, "revoked": b.revoked, "expires_at": b.expires_at.isoformat() if b.expires_at else None,
            "created_at": b.created_at.isoformat(), "created_by": b.created_by.alias if b.created_by else "",
        } for b in batches]})

    def post(self, request):
        amount = parse_rub(request.data.get("amount_rub"))
        try:
            count = int(request.data.get("count") or 0)
        except ValueError:
            count = 0
        expires = request.data.get("expires_at")
        expires_at = parse_datetime(expires) if isinstance(expires, str) and expires else None
        if expires and expires_at is None:
            from django.utils.dateparse import parse_date

            d = parse_date(str(expires))
            if d is None:
                return err("Не понял дату окончания.")
            expires_at = timezone.make_aware(timezone.datetime(d.year, d.month, d.day, 23, 59, 59))
        try:
            batch, codes = generate_gift_batch(amount_kopecks=amount or 0, count=count,
                                               label=str(request.data.get("label") or ""), expires_at=expires_at,
                                               by=request.user)
        except BillingError as exc:
            return err(str(exc))
        audit(request, "finance.gifts.create", target=("gift_batch", str(batch.pk), batch.label or "Подарочные коды"),
              details={"amount_kopecks": batch.amount_kopecks, "count": batch.count})
        return Response({"id": str(batch.id), "codes": codes}, status=201)


class GiftRevokeView(StaffAction):
    def post(self, request, pk):
        batch = get_object_or_404(GiftBatch, pk=pk)
        n = revoke_gift_batch(batch)
        audit(request, "finance.gifts.revoke", target=("gift_batch", str(batch.pk), batch.label or "Подарочные коды"),
              details={"revoked_codes": n})
        return Response({"revoked": n})


class JournalView(StaffBase):
    def get(self, request):
        txns = LedgerTransaction.objects.prefetch_related("entries__account").order_by("-created_at")[:150]
        items = []
        for t in txns:
            items.append({
                "id": str(t.id), "kind": t.kind, "label": t.get_kind_display(), "memo": t.memo,
                "created_at": t.created_at.isoformat(), "session_id": str(t.session_id) if t.session_id else None,
                "entries": [{"account": e.account.get_kind_display(), "key": e.account.key.split(":")[0],
                             "amount_kopecks": e.amount_kopecks} for e in t.entries.all()],
            })
        return Response({"items": items})


class ReconcileView(StaffBase):
    """Сверка: инварианты журнала + наши пополнения против списка платежей ЮKassa за 7 дней."""

    def get(self, request):
        check = verify()
        since = timezone.now() - timedelta(days=7)
        ours = {t.provider_payment_id: t for t in TopUp.objects.filter(provider="yookassa", created_at__gte=since)}
        provider: dict = {"checked": False}
        mismatches = []
        if conf.yookassa_live():
            try:
                remote = get_provider("yookassa").list_payments(since.strftime("%Y-%m-%dT%H:%M:%S.000Z"))
                provider = {"checked": True, "count": len(remote)}
                for rp in remote:
                    t = ours.get(rp.id)
                    if t is None:
                        mismatches.append({"payment_id": rp.id, "problem": "Нет у нас", "provider_status": rp.status})
                    elif rp.status == "succeeded" and t.status not in ("succeeded", "refunded"):
                        mismatches.append({"payment_id": rp.id, "problem": "Оплачен, но не зачислен", "provider_status": rp.status,
                                           "our_status": t.status, "topup_id": str(t.id)})
                    elif rp.status != "succeeded" and t.status == "succeeded":
                        mismatches.append({"payment_id": rp.id, "problem": "Зачислен без оплаты", "provider_status": rp.status,
                                           "our_status": t.status, "topup_id": str(t.id)})
            except ProviderError as exc:
                provider = {"checked": False, "error": str(exc)}
        return Response({
            "ledger": check,
            "provider": provider,
            "mismatches": mismatches,
            "webhooks": [{"event": w.event, "object_id": w.object_id, "result": w.result,
                          "received_at": w.received_at.isoformat()} for w in WebhookEvent.objects.all()[:30]],
        })


class SweepView(StaffAction):
    def post(self, request):
        result = sweep()
        audit(request, "finance.sweep", details=result)
        return Response(result)


class ExportView(StaffBase):
    """CSV-выгрузка операций за период (для бухгалтера). Без псевдонимов — только виды счетов."""

    def get(self, request):
        days = max(1, min(int(request.query_params.get("days", 31) or 31), 366))
        since = timezone.now() - timedelta(days=days)
        out = io.StringIO()
        w = csv.writer(out, delimiter=";")
        w.writerow(["дата", "операция", "счёт", "сумма, ₽", "id операции"])
        for e in Entry.objects.filter(created_at__gte=since).select_related("transaction", "account").order_by("created_at"):
            w.writerow([e.created_at.isoformat(), e.transaction.get_kind_display(), e.account.get_kind_display(),
                        f"{e.amount_kopecks / 100:.2f}".replace(".", ","), str(e.transaction_id)])
        audit(request, "finance.export", details={"days": days})
        resp = HttpResponse("﻿" + out.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="aprosop-ledger-{days}d.csv"'
        return resp
