"""
API программ для компаний.  Префикс: /api/v1/business/

Публично
    POST leads/                           заявка «Рассчитать для компании» (лендинг /business)
Клиент (анонимный аккаунт сотрудника)
    GET  me/                              мои программы компаний и остаток на период
    POST redeem/                          {code} — активировать код сотрудника
    POST me/<id>/leave/                   отключиться от программы
HR компании (роль business) — ТОЛЬКО агрегаты, см. stats.py
    GET  portal/me/                       компания, HR, нужно ли сменить пароль
    POST portal/me/password/              {old_password, new_password}
    GET  portal/dashboard/                бюджет, коды, помесячно, темы, оценка (k ≥ 5)
    GET  portal/codes/                    партии кодов;  POST {count, label} → коды (один раз в ответе)
    GET  portal/codes/<id>/export/        CSV кодов партии (без статусов)
    POST portal/codes/<id>/revoke/        отозвать неиспользованные коды партии
    POST portal/codes/revoke/             {code} — код (или участие по нему) больше не действует
    GET/PATCH portal/program/             настройки программы
    GET  portal/documents/                договор (заглушка), счета, акты;  POST portal/documents/invoices/ {amount_rub}
    GET  portal/documents/acts.csv        акты помесячно (CSV)
Персонал (business.view / business.manage, всё в журнал действий)
    GET/POST staff/companies/  GET/PATCH staff/companies/<id>/  POST …/admins/  PATCH …/admins/<admin_id>/
    POST …/programs/  PATCH staff/programs/<id>/  POST …/codes/  POST …/invoices/  POST staff/invoices/<id>/<paid|cancel>/
    POST …/adjust/  GET staff/leads/  PATCH staff/leads/<id>/
"""
from __future__ import annotations

import csv
import io

from django.db import IntegrityError
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.billing.views import parse_rub
from apps.staff.audit import audit
from apps.staff.views import StaffView

from . import services as svc
from . import stats
from .core import k_threshold
from .funding import allowances_for, budget_balance
from .models import CodeBatch, Company, CompanyAdmin, Invoice, Lead, Program


def err(message: str, code: str = "business_error", http=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message, "code": code}, status=http)


# ── Сериализация (никаких данных сотрудников) ────────────────────

def program_payload(p: Program | None) -> dict | None:
    if p is None:
        return None
    return {
        "id": str(p.id), "name": p.name, "amount_kopecks": p.amount_kopecks, "calls_limit": p.calls_limit,
        "period": p.period, "services": p.services or [], "starts_on": p.starts_on.isoformat() if p.starts_on else None,
        "expires_on": p.expires_on.isoformat() if p.expires_on else None, "is_active": p.is_active,
    }


def company_payload(c: Company, *, full: bool = False) -> dict:
    data = {
        "id": str(c.id), "name": c.name, "legal_name": c.legal_name, "inn": c.inn, "plan": c.plan,
        "plan_label": c.get_plan_display(), "status": c.status, "status_label": c.get_status_display(),
        "contract_number": c.contract_number, "created_at": c.created_at.isoformat(),
    }
    if full:
        data.update(contact_name=c.contact_name, contact_email=c.contact_email, contact_phone=c.contact_phone, note=c.note)
    return data


def batch_payload(b: CodeBatch) -> dict:
    return {
        "id": str(b.id), "label": b.label, "count": b.count, "revoked": b.revoked, "program": b.program.name,
        "created_month": b.created_at.date().replace(day=1).isoformat(),
    }


def invoice_payload(i: Invoice) -> dict:
    return {
        "id": str(i.id), "number": i.number, "amount_kopecks": i.amount_kopecks, "status": i.status,
        "status_label": i.get_status_display(), "created_at": i.created_at.date().isoformat(),
        "paid_at": i.paid_at.date().isoformat() if i.paid_at else None, "requested_by_company": i.requested_by_company,
    }


def admin_payload(a: CompanyAdmin) -> dict:
    return {"id": a.pk, "login": a.user.alias, "full_name": a.full_name, "is_active": a.is_active,
            "must_change_password": a.must_change_password, "created_at": a.created_at.date().isoformat()}


# ── Публичная заявка ─────────────────────────────────────────────

class LeadThrottle(AnonRateThrottle):
    scope = "business_lead"
    rate = "5/hour"


class LeadCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [LeadThrottle]

    def post(self, request):
        d = request.data
        name = str(d.get("company_name") or "").strip()[:160]
        contact = str(d.get("contact") or "").strip()[:160]
        if str(d.get("website") or ""):  # поле-ловушка для ботов
            return Response({"ok": True}, status=status.HTTP_201_CREATED)
        if len(name) < 2:
            return err("Укажите название компании.")
        if len(contact) < 5 or not ("@" in contact or sum(ch.isdigit() for ch in contact) >= 10):
            return err("Оставьте рабочий email или телефон — мы пришлём расчёт.")
        try:
            employees = int(d.get("employees")) if d.get("employees") not in (None, "") else None
        except (TypeError, ValueError):
            employees = None
        if employees is not None and not (1 <= employees <= 1_000_000):
            employees = None
        Lead.objects.create(company_name=name, contact_name=str(d.get("contact_name") or "").strip()[:120],
                            contact=contact, employees=employees, message=str(d.get("message") or "").strip()[:2000])
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


# ── Клиент ───────────────────────────────────────────────────────

class RedeemThrottle(UserRateThrottle):
    scope = "business_redeem"
    rate = "5/min"


def _client_only(request):
    if getattr(request.user, "role", None) != "client":
        return err("Код компании активируется в анонимном аккаунте клиента.", "forbidden", status.HTTP_403_FORBIDDEN)
    return None


class MyProgramsView(APIView):
    def get(self, request):
        if getattr(request.user, "role", None) != "client":
            return Response({"programs": []})
        return Response({"programs": allowances_for(request.user)})


class RedeemView(APIView):
    throttle_classes = [RedeemThrottle]

    def post(self, request):
        denied = _client_only(request)
        if denied:
            return denied
        code = str(request.data.get("code") or "")[:40]
        if not code.strip():
            return err("Введите код.")
        try:
            svc.redeem(request.user, code)
        except svc.BusinessError as exc:
            return err(str(exc))
        return Response({"programs": allowances_for(request.user)}, status=status.HTTP_201_CREATED)


class LeaveView(APIView):
    def post(self, request, pk):
        denied = _client_only(request)
        if denied:
            return denied
        svc.leave(request.user, pk)
        return Response({"programs": allowances_for(request.user)})


# ── Портал HR ────────────────────────────────────────────────────

def company_admin_of(user) -> CompanyAdmin | None:
    if getattr(user, "role", None) != "business" or not getattr(user, "is_active", False):
        return None
    admin = CompanyAdmin.objects.filter(user=user, is_active=True).select_related("company").first()
    if admin is None or admin.company.status == Company.Status.CLOSED:
        return None
    return admin


class IsCompanyAdmin(BasePermission):
    message = "Раздел доступен только HR-администраторам компании."

    def has_permission(self, request, view):
        admin = company_admin_of(request.user)
        if admin is None:
            return False
        request.company_admin = admin
        if admin.must_change_password and not getattr(view, "allow_password_setup", False):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied({"detail": "Сначала смените одноразовый пароль.", "code": "password_change_required"})
        return True


class PortalThrottle(UserRateThrottle):
    scope = "business_portal"
    rate = "240/min"


class PortalView(APIView):
    permission_classes = [IsAuthenticated, IsCompanyAdmin]
    throttle_classes = [PortalThrottle]

    @property
    def admin(self) -> CompanyAdmin:
        return self.request.company_admin

    @property
    def company(self) -> Company:
        return self.admin.company


SUPPORT = {"email": "b2b@aprosop.ru", "hours": "Пн–Пт, 10:00–19:00 по Москве", "manager": "Персональный менеджер aprosop"}


class PortalMeView(PortalView):
    allow_password_setup = True

    def get(self, request):
        return Response({
            "company": company_payload(self.company),
            "admin": {"login": request.user.alias, "full_name": self.admin.full_name},
            "must_change_password": self.admin.must_change_password,
            "support": SUPPORT,
            "k_min": k_threshold(),
        })


class PortalPasswordView(PortalView):
    allow_password_setup = True

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError

        old = str(request.data.get("old_password") or "")
        new = str(request.data.get("new_password") or "")
        if not request.user.check_password(old):
            return err("Текущий пароль указан неверно.")
        if len(new) < 10:
            return err("Новый пароль — не короче 10 символов.")
        try:
            validate_password(new, request.user)
        except ValidationError as exc:
            return err(" ".join(exc.messages))
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        self.admin.must_change_password = False
        self.admin.save(update_fields=["must_change_password"])
        audit(request, "business.hr.password", target=("company", self.company.pk, self.company.name))
        return Response({"ok": True})


class PortalDashboardView(PortalView):
    def get(self, request):
        return Response({"company": company_payload(self.company), "program": program_payload(svc.current_program(self.company)),
                         **stats.dashboard(self.company)})


class PortalCodesView(PortalView):
    def get(self, request):
        batches = CodeBatch.objects.filter(company=self.company).select_related("program")
        return Response({"batches": [batch_payload(b) for b in batches], "codes": stats.codes_view(self.company),
                         "k_min": k_threshold()})

    def post(self, request):
        program = svc.current_program(self.company)
        if program is None:
            return err("Сначала менеджер aprosop настроит программу.")
        try:
            batch, codes = svc.generate_codes(self.company, program, count=request.data.get("count"),
                                              label=str(request.data.get("label") or ""), by=request.user)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.codes.generate", target=("company", self.company.pk, self.company.name),
              details={"count": batch.count, "by": "hr"})
        return Response({"batch": batch_payload(batch), "codes": codes}, status=status.HTTP_201_CREATED)


def codes_csv(batch: CodeBatch, codes: list[str]) -> HttpResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Код", "Как активировать"])
    for c in codes:
        w.writerow([c, "aprosop.ru → Баланс → Программа компании"])
    resp = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="aprosop-codes-{str(batch.id)[:8]}.csv"'
    return resp


class PortalCodesExportView(PortalView):
    def get(self, request, pk):
        batch = get_object_or_404(CodeBatch, pk=pk, company=self.company)
        audit(request, "business.codes.export", target=("company", self.company.pk, self.company.name), details={"batch": str(batch.id)})
        return codes_csv(batch, svc.batch_codes(batch))


class PortalBatchRevokeView(PortalView):
    def post(self, request, pk):
        batch = get_object_or_404(CodeBatch, pk=pk, company=self.company)
        svc.revoke_batch(batch)
        audit(request, "business.codes.revoke_batch", target=("company", self.company.pk, self.company.name),
              details={"batch": str(batch.id)})
        return Response({"batch": batch_payload(batch)})


class PortalCodeRevokeView(PortalView):
    def post(self, request):
        try:
            svc.revoke_code(self.company, str(request.data.get("code") or ""))
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.codes.revoke_code", target=("company", self.company.pk, self.company.name))
        return Response({"ok": True, "detail": "Код больше не действует."})


class PortalProgramView(PortalView):
    def get(self, request):
        return Response({"program": program_payload(svc.current_program(self.company)),
                         "service_labels": Program.SERVICE_LABELS, "period_labels": dict(Program.Period.choices)})

    def patch(self, request):
        program = svc.current_program(self.company)
        if program is None:
            return err("Программа ещё не настроена — напишите менеджеру.")
        allowed = {k: v for k, v in request.data.items() if k in ("name", "amount_rub", "calls_limit", "period", "services", "expires_on")}
        try:
            svc.update_program(program, allowed)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.program.update", target=("company", self.company.pk, self.company.name),
              details={"fields": sorted(allowed)})
        return Response({"program": program_payload(program)})


class PortalDocumentsView(PortalView):
    def get(self, request):
        c = self.company
        return Response({
            "company": company_payload(c),
            "contract": {"number": c.contract_number or None, "status": "placeholder",
                         "note": "Договор оферты для юрлиц готовится. Сейчас работаем по договору, подписанному с менеджером."},
            "invoices": [invoice_payload(i) for i in c.invoices.all()[:50]],
            "acts": stats.acts(c),
            "k_min": k_threshold(),
            "requisites": {"name": "ООО «Апросоп» (реквизиты уточняются)", "inn": "0000000000", "note": "Заглушка"},
        })


class PortalInvoiceRequestView(PortalView):
    def post(self, request):
        amount = parse_rub(request.data.get("amount_rub"))
        if amount is None:
            return err("Укажите сумму.")
        try:
            inv = svc.issue_invoice(self.company, amount, requested_by_company=True)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.invoice.request", target=("company", self.company.pk, self.company.name),
              details={"number": inv.number, "amount_kopecks": inv.amount_kopecks})
        return Response({"invoice": invoice_payload(inv)}, status=status.HTTP_201_CREATED)


def acts_csv(company: Company) -> HttpResponse:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Месяц", "Услуга", "Сумма, ₽", "Созвонов"])
    for a in stats.acts(company):
        w.writerow([a["label"], "Психологическая поддержка сотрудников", f"{a['amount_kopecks'] / 100:.2f}".replace(".", ","),
                    a["calls"] if a["calls"] is not None else f"менее {k_threshold()} чел."])
    resp = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = 'attachment; filename="aprosop-acts.csv"'
    return resp


class PortalActsCsvView(PortalView):
    def get(self, request):
        return acts_csv(self.company)


# ── Персонал ─────────────────────────────────────────────────────

class BizStaffView(StaffView):
    staff_perms = {"GET": "business.view", "*": "business.manage"}


def _company(pk) -> Company:
    return get_object_or_404(Company, pk=pk)


COMPANY_FIELDS = ("name", "legal_name", "inn", "contact_name", "contact_email", "contact_phone", "plan", "status",
                  "contract_number", "note")


def _apply_company(c: Company, data) -> str | None:
    for f in COMPANY_FIELDS:
        if f not in data:
            continue
        v = str(data.get(f) or "").strip()
        if f == "plan" and v not in Company.Plan.values:
            return "Неизвестный тариф."
        if f == "status" and v not in Company.Status.values:
            return "Неизвестный статус."
        if f == "inn" and v and (not v.isdigit() or len(v) not in (10, 12)):
            return "ИНН — 10 или 12 цифр."
        setattr(c, f, v[: Company._meta.get_field(f).max_length])
    if not c.name:
        return "Укажите название компании."
    return None


def staff_company_detail(c: Company) -> dict:
    return {
        "company": company_payload(c, full=True),
        "budget_kopecks": budget_balance(c),
        "programs": [program_payload(p) for p in c.programs.all()],
        "admins": [admin_payload(a) for a in c.admins.select_related("user")],
        "batches": [batch_payload(b) for b in c.batches.select_related("program")],
        "invoices": [invoice_payload(i) for i in c.invoices.all()[:100]],
        "stats": stats.dashboard(c),
    }


class StaffCompaniesView(BizStaffView):
    def get(self, request):
        q = str(request.query_params.get("q") or "").strip()
        qs = Company.objects.all().annotate(n_admins=Count("admins", distinct=True))
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(inn__icontains=q))
        rows = []
        for c in qs[:300]:
            rows.append({**company_payload(c), "budget_kopecks": budget_balance(c), "admins": c.n_admins,
                         "open_invoices": c.invoices.filter(status=Invoice.Status.ISSUED).count()})
        return Response({"results": rows, "new_leads": Lead.objects.filter(status=Lead.Status.NEW).count()})

    def post(self, request):
        c = Company(created_by=request.user)
        problem = _apply_company(c, request.data)
        if problem:
            return err(problem)
        c.save()
        program_data = request.data.get("program")
        if isinstance(program_data, dict):
            try:
                svc.create_program(c, program_data)
            except svc.BusinessError as exc:
                c.delete()
                return err(str(exc))
        lead_id = request.data.get("lead_id")
        if lead_id:
            Lead.objects.filter(pk=lead_id).update(company=c, status=Lead.Status.DONE)
        audit(request, "business.company.create", target=("company", c.pk, c.name), details={"plan": c.plan})
        return Response(staff_company_detail(c), status=status.HTTP_201_CREATED)


class StaffCompanyView(BizStaffView):
    def get(self, request, pk):
        return Response(staff_company_detail(_company(pk)))

    def patch(self, request, pk):
        c = _company(pk)
        problem = _apply_company(c, request.data)
        if problem:
            return err(problem)
        c.save()
        audit(request, "business.company.update", target=("company", c.pk, c.name),
              details={"fields": sorted(k for k in request.data if k in COMPANY_FIELDS)})
        return Response(staff_company_detail(c))


class StaffAdminsView(BizStaffView):
    def post(self, request, pk):
        from apps.staff.serializers import LOGIN_RE
        from apps.users.aliases import normalize_alias
        from apps.users.models import User

        c = _company(pk)
        login = normalize_alias(str(request.data.get("login") or ""))
        if not LOGIN_RE.match(login):
            return err("Логин: от 3 до 40 символов, строчные буквы, цифры, точка, дефис или подчёркивание.")
        if User.objects.filter(alias=login).exists():
            return err("Этот логин уже занят.")
        try:
            admin, password = svc.invite_admin(c, login=login, full_name=str(request.data.get("full_name") or ""), by=request.user)
        except IntegrityError:
            return err("Этот логин уже занят.")
        audit(request, "business.hr.invite", target=("company", c.pk, c.name), details={"login": login})
        return Response({"admin": admin_payload(admin), "one_time_password": password}, status=status.HTTP_201_CREATED)


class StaffAdminView(BizStaffView):
    def patch(self, request, pk, admin_id):
        from apps.users.services import blacklist_user_tokens

        c = _company(pk)
        admin = get_object_or_404(CompanyAdmin.objects.select_related("user"), pk=admin_id, company=c)
        extra = {}
        if "is_active" in request.data:
            admin.is_active = bool(request.data["is_active"])
            admin.save(update_fields=["is_active"])
            if not admin.is_active:
                blacklist_user_tokens(admin.user)
        if request.data.get("reset_password"):
            extra["one_time_password"] = svc.reset_admin_password(admin)
        audit(request, "business.hr.update", target=("company", c.pk, c.name),
              details={"login": admin.user.alias, "is_active": admin.is_active, "reset": bool(extra)})
        return Response({"admin": admin_payload(admin), **extra})


class StaffProgramsView(BizStaffView):
    def post(self, request, pk):
        c = _company(pk)
        try:
            p = svc.create_program(c, request.data)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.program.create", target=("company", c.pk, c.name), details={"program": str(p.id)})
        return Response({"program": program_payload(p)}, status=status.HTTP_201_CREATED)


class StaffProgramView(BizStaffView):
    def patch(self, request, pk):
        p = get_object_or_404(Program.objects.select_related("company"), pk=pk)
        try:
            svc.update_program(p, request.data)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.program.update", target=("company", p.company_id, p.company.name),
              details={"program": str(p.id), "fields": sorted(request.data)})
        return Response({"program": program_payload(p)})


class StaffCodesView(BizStaffView):
    def post(self, request, pk):
        c = _company(pk)
        program = None
        if request.data.get("program"):
            program = Program.objects.filter(pk=request.data["program"], company=c).first()
        program = program or svc.current_program(c)
        if program is None:
            return err("Сначала создайте программу.")
        try:
            batch, codes = svc.generate_codes(c, program, count=request.data.get("count"),
                                              label=str(request.data.get("label") or ""), by=request.user)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.codes.generate", target=("company", c.pk, c.name), details={"count": batch.count, "by": "staff"})
        return Response({"batch": batch_payload(batch), "codes": codes}, status=status.HTTP_201_CREATED)


class StaffCodesExportView(BizStaffView):
    staff_perms = {"GET": "business.manage"}

    def get(self, request, pk):
        batch = get_object_or_404(CodeBatch, pk=pk)
        audit(request, "business.codes.export", target=("company", batch.company_id, ""), details={"batch": str(batch.id)})
        return codes_csv(batch, svc.batch_codes(batch))


class StaffInvoicesView(BizStaffView):
    def post(self, request, pk):
        c = _company(pk)
        amount = parse_rub(request.data.get("amount_rub"))
        if amount is None:
            return err("Укажите сумму.")
        try:
            inv = svc.issue_invoice(c, amount, note=str(request.data.get("note") or ""))
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.invoice.issue", target=("company", c.pk, c.name),
              details={"number": inv.number, "amount_kopecks": inv.amount_kopecks})
        return Response({"invoice": invoice_payload(inv)}, status=status.HTTP_201_CREATED)


class StaffInvoiceActionView(BizStaffView):
    def post(self, request, pk, action):
        inv = get_object_or_404(Invoice.objects.select_related("company"), pk=pk)
        try:
            if action == "paid":
                inv = svc.mark_invoice_paid(inv, by=request.user)
            elif action == "cancel":
                inv = svc.cancel_invoice(inv, by=request.user)
            else:
                return err("Неизвестное действие.", http=status.HTTP_404_NOT_FOUND)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, f"business.invoice.{action}", target=("company", inv.company_id, inv.company.name),
              details={"number": inv.number, "amount_kopecks": inv.amount_kopecks})
        return Response({"invoice": invoice_payload(inv), "budget_kopecks": budget_balance(inv.company)})


class StaffAdjustView(BizStaffView):
    def post(self, request, pk):
        c = _company(pk)
        amount = parse_rub(request.data.get("amount_rub"))
        key = str(request.data.get("idempotency_key") or "")[:60]
        if amount is None or not key:
            return err("Укажите сумму.")
        try:
            svc.adjust_budget(c, amount, reason=str(request.data.get("reason") or ""), key=key, by=request.user)
        except svc.BusinessError as exc:
            return err(str(exc))
        audit(request, "business.budget.adjust", target=("company", c.pk, c.name), details={"amount_kopecks": amount})
        return Response({"budget_kopecks": budget_balance(c)})


def lead_payload(x: Lead) -> dict:
    return {"id": str(x.id), "company_name": x.company_name, "contact_name": x.contact_name, "contact": x.contact,
            "employees": x.employees, "message": x.message, "status": x.status, "status_label": x.get_status_display(),
            "company_id": str(x.company_id) if x.company_id else None, "created_at": x.created_at.isoformat()}


class StaffLeadsView(BizStaffView):
    def get(self, request):
        qs = Lead.objects.all()
        st = request.query_params.get("status")
        if st in Lead.Status.values:
            qs = qs.filter(status=st)
        return Response({"results": [lead_payload(x) for x in qs[:300]]})


class StaffLeadView(BizStaffView):
    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        st = request.data.get("status")
        if st not in Lead.Status.values:
            return err("Неизвестный статус.")
        lead.status = st
        lead.save(update_fields=["status"])
        audit(request, "business.lead.update", target=("lead", lead.pk, lead.company_name), details={"status": st})
        return Response({"lead": lead_payload(lead)})

