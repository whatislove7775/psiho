from rest_framework.permissions import SAFE_METHODS
from rest_framework.throttling import UserRateThrottle


class StaffReadThrottle(UserRateThrottle):
    scope = "staff_read"
    rate = "300/min"

    def allow_request(self, request, view):
        if request.method not in SAFE_METHODS:
            return True
        return super().allow_request(request, view)


class StaffWriteThrottle(UserRateThrottle):
    scope = "staff_write"
    rate = "60/min"

    def allow_request(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().allow_request(request, view)


class TotpThrottle(UserRateThrottle):
    """Попытки ввода TOTP-кода в кабинете (включение/выключение)."""
    scope = "staff_totp"
    rate = "10/min"


class ReportThrottle(UserRateThrottle):
    scope = "reports"
    rate = "20/hour"

    def allow_request(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().allow_request(request, view)


STAFF_THROTTLES = [StaffReadThrottle, StaffWriteThrottle]
