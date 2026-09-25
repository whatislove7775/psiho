from django.urls import path

from . import views as v
from . import views_staff as st

# /api/v1/billing/
urlpatterns = [
    path("summary/", v.SummaryView.as_view(), name="billing_summary"),
    path("history/", v.HistoryView.as_view(), name="billing_history"),
    path("topups/", v.TopUpCreateView.as_view(), name="billing_topup_create"),
    path("topups/<uuid:pk>/", v.TopUpDetailView.as_view(), name="billing_topup"),
    path("topups/<uuid:pk>/mock/", v.MockCheckoutView.as_view(), name="billing_topup_mock"),
    path("redeem/", v.RedeemView.as_view(), name="billing_redeem"),
    path("quote/", v.QuoteView.as_view(), name="billing_quote"),
    path("calls/<uuid:pk>/", v.CallView.as_view(), name="billing_call"),
    path("calls/<uuid:pk>/pay/", v.PayCallView.as_view(), name="billing_call_pay"),
    path("earnings/", v.EarningsView.as_view(), name="billing_earnings"),
    path("earnings/method/", v.PayoutMethodView.as_view(), name="billing_payout_method"),
    path("earnings/payouts/", v.PayoutCreateView.as_view(), name="billing_payout_create"),
    path("webhook/yookassa/", v.YooKassaWebhookView.as_view(), name="billing_webhook_yookassa"),
    # Персонал
    path("staff/overview/", st.OverviewView.as_view()),
    path("staff/balances/", st.BalancesView.as_view()),
    path("staff/holds/", st.HoldsView.as_view()),
    path("staff/holds/<uuid:pk>/settle/", st.HoldSettleView.as_view()),
    path("staff/payouts/", st.PayoutsView.as_view()),
    path("staff/payouts/<uuid:pk>/details/", st.PayoutDetailsView.as_view()),
    path("staff/payouts/<uuid:pk>/<str:action>/", st.PayoutActionView.as_view()),
    path("staff/topups/", st.TopUpsView.as_view()),
    path("staff/topups/<uuid:pk>/<str:action>/", st.TopUpActionView.as_view()),
    path("staff/adjust/", st.AdjustView.as_view()),
    path("staff/gifts/", st.GiftsView.as_view()),
    path("staff/gifts/<uuid:pk>/revoke/", st.GiftRevokeView.as_view()),
    path("staff/journal/", st.JournalView.as_view()),
    path("staff/reconcile/", st.ReconcileView.as_view()),
    path("staff/sweep/", st.SweepView.as_view()),
    path("staff/export/", st.ExportView.as_view()),
]
