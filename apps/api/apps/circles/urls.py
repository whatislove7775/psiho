from django.urls import path

from . import views as v

# /api/v1/circles/
urlpatterns = [
    path("", v.CircleListView.as_view(), name="circles"),
    path("mine/", v.MyCirclesView.as_view(), name="my_circles"),
    path("pro/", v.ProCirclesView.as_view(), name="pro_circles"),
    path("pro/<uuid:pk>/", v.ProCircleView.as_view(), name="pro_circle"),
    path("pro/<uuid:pk>/action/", v.ProCircleActionView.as_view(), name="pro_circle_action"),
    path("pro/<uuid:pk>/members/<str:handle>/", v.ProModerateView.as_view(), name="pro_circle_moderate"),
    path("pro/meetings/<uuid:mid>/end/", v.ProMeetingEndView.as_view(), name="pro_meeting_end"),
    path("meetings/<uuid:mid>/join/", v.MeetingJoinView.as_view(), name="circle_meeting_join"),
    path("<uuid:pk>/", v.CircleDetailView.as_view(), name="circle"),
    path("<uuid:pk>/join/", v.JoinView.as_view(), name="circle_join"),
    path("<uuid:pk>/leave/", v.LeaveView.as_view(), name="circle_leave"),
    path("<uuid:pk>/members/", v.MembersView.as_view(), name="circle_members"),
    path("<uuid:pk>/messages/", v.MessagesView.as_view(), name="circle_messages"),
    path("<uuid:pk>/messages/<uuid:mid>/delete/", v.MessageDeleteView.as_view(), name="circle_message_delete"),
]

# /api/v1/staff/circles/
urlpatterns_staff = [
    path("", v.StaffCircleListView.as_view(), name="staff_circles"),
    path("<uuid:pk>/", v.StaffCircleDetailView.as_view(), name="staff_circle"),
]
