"""Фоновый разбор денег по созвонам (сервис scheduler, раз в несколько минут):

- неоплаченные записи старше BILLING_UNPAID_TTL_MINUTES освобождают время;
- «зависшие» созвоны рассчитываются (неявки, автозавершение);
- заработок специалистов «созревает» и становится доступен к выплате;
- `--verify` дополнительно проверяет инварианты журнала (сумма проводок = 0).
"""
import json

from django.core.management.base import BaseCommand

from apps.billing.ledger import verify
from apps.billing.services import sweep


class Command(BaseCommand):
    help = "Расчёт созвонов, созревание заработка, отмена неоплаченных записей"

    def add_arguments(self, parser):
        parser.add_argument("--verify", action="store_true")

    def handle(self, *args, **opts):
        result = sweep()
        if any(result.values()) or opts.get("verbosity", 1) > 1:
            self.stdout.write(f"billing_sweep: {json.dumps(result, ensure_ascii=False)}")
        if opts.get("verify"):
            check = verify()
            self.stdout.write(json.dumps(check, ensure_ascii=False))
            if not check["ok"]:
                raise SystemExit(1)
