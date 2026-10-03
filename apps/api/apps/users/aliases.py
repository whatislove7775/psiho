"""
Генератор дружелюбных анонимных псевдонимов: `тихий-кит-4821`.

Все существительные мужского рода, прилагательные — в мужском роде,
поэтому любая пара согласована. Буква «ё» не используется, чтобы псевдоним
было легко набрать.
"""
import secrets

ADJECTIVES = [
    "тихий", "светлый", "добрый", "ясный", "мудрый", "смелый", "быстрый",
    "нежный", "спокойный", "яркий", "лунный", "солнечный", "лесной", "морской",
    "горный", "речной", "небесный", "снежный", "летний", "осенний", "весенний",
    "зимний", "утренний", "вечерний", "ночной", "серебряный", "золотой",
    "янтарный", "изумрудный", "синий", "рыжий", "белый", "бархатный",
    "хрустальный", "мягкий", "задумчивый", "внимательный", "честный", "верный",
    "гордый", "ловкий", "чуткий", "шустрый", "отважный", "уютный", "северный",
    "южный", "дальний", "вольный", "юный", "чистый", "свежий", "туманный",
    "лучистый", "звонкий", "сонный", "бодрый", "плавный", "кроткий", "пушистый",
    "степной", "полевой",
]

NOUNS = [
    "кит", "лис", "волк", "барсук", "бобр", "филин", "дельфин", "журавль",
    "лебедь", "сокол", "ястреб", "кот", "заяц", "олень", "лось", "медведь",
    "тюлень", "пингвин", "воробей", "снегирь", "соловей", "дрозд", "скворец",
    "аист", "пеликан", "енот", "хомяк", "суслик", "тигр", "лев", "леопард",
    "ягуар", "гепард", "барс", "жираф", "слон", "бегемот", "крот", "краб",
    "осьминог", "морж", "лемур", "ленивец", "шмель", "светлячок", "кузнечик",
    "дятел", "попугай", "павлин", "глухарь", "песец", "соболь", "горностай",
    "бурундук", "зубр", "як", "верблюд", "единорог", "кедр", "дуб", "ясень",
    "тополь", "рассвет", "закат", "туман", "ручей", "маяк", "парус", "остров",
]


# S2: для англоязычного интерфейса — английские псевдонимы («quiet-whale-4821»), чтобы их было легко набрать
EN_ADJECTIVES = [
    "quiet", "bright", "kind", "clear", "wise", "brave", "swift", "gentle", "calm", "sunny", "lunar",
    "forest", "ocean", "mountain", "river", "misty", "snowy", "summer", "autumn", "spring", "winter",
    "morning", "evening", "silver", "golden", "amber", "emerald", "blue", "red", "velvet", "crystal",
    "soft", "thoughtful", "honest", "loyal", "nimble", "cosy", "northern", "southern", "distant", "free",
    "young", "fresh", "radiant", "sleepy", "cheerful", "smooth", "fluffy", "meadow", "starry", "warm",
    "curious", "patient", "steady", "hidden", "little", "wild", "mellow", "tidal", "tender",
]
EN_NOUNS = [
    "whale", "fox", "wolf", "badger", "beaver", "owl", "dolphin", "crane", "swan", "falcon", "hawk",
    "cat", "hare", "deer", "moose", "bear", "seal", "penguin", "robin", "finch", "thrush", "stork",
    "pelican", "raccoon", "hamster", "tiger", "lion", "leopard", "jaguar", "lynx", "giraffe", "elephant",
    "otter", "crab", "octopus", "walrus", "lemur", "sloth", "bumblebee", "firefly", "woodpecker", "parrot",
    "peacock", "sable", "chipmunk", "bison", "yak", "camel", "unicorn", "cedar", "oak", "maple", "willow",
    "sunrise", "sunset", "mist", "brook", "lighthouse", "sail", "island", "comet", "harbor",
]


def random_alias(lang: str | None = None) -> str:
    if lang is None:
        from django.utils import translation

        lang = (translation.get_language() or "ru").split("-")[0]
    words = (EN_ADJECTIVES, EN_NOUNS) if lang == "en" else (ADJECTIVES, NOUNS)
    adjective = secrets.choice(words[0])
    noun = secrets.choice(words[1])
    number = 1000 + secrets.randbelow(9000)
    return f"{adjective}-{noun}-{number}"


def generate_unique_alias(max_attempts: int = 50) -> str:
    """Свободный псевдоним на языке запроса (английский для en, иначе русский)."""
    from .models import User

    for _ in range(max_attempts):
        alias = random_alias()
        if not User.objects.filter(alias=alias).exists():
            return alias
    # Практически недостижимо (≈ 37 млн комбинаций), но на всякий случай
    return f"{random_alias()}{secrets.randbelow(10)}"


def normalize_alias(value: str) -> str:
    """Нижний регистр, «ё»→«е», одиночные пробелы — так ники хранятся и сравниваются."""
    return " ".join((value or "").split()).lower().replace("ё", "е")
