import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.core.asgi import get_asgi_application  # noqa: E402

# Django должен быть инициализирован до импорта консьюмеров
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.urls import re_path  # noqa: E402

from apps.chat.consumers import ChatConsumer  # noqa: E402
from apps.signaling.consumers import SignalingConsumer  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Аутентификация — подписанный ws_token в query string (см. consumers)
        "websocket": URLRouter(
            [
                re_path(
                    r"^ws/signaling/(?P<room_id>[0-9a-f-]{36})/$",
                    SignalingConsumer.as_asgi(),
                ),
                re_path(r"^ws/chat/$", ChatConsumer.as_asgi()),
            ]
        ),
    }
)
