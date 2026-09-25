from django.urls import path

from . import views as v

# /api/v1/lab/
urlpatterns = [
    path("rooms/", v.LabRoomsView.as_view(), name="lab_rooms"),
    path("rooms/<uuid:pk>/close/", v.LabRoomCloseView.as_view(), name="lab_room_close"),
    path("join/", v.LabJoinView.as_view(), name="lab_join"),
]
