"""Fingerprints of every earlier version of the starter content.

`seed_content(..., upgrade=True)` replaces a seeded item with the current text only when the
row in the database still matches one of these fingerprints, i.e. nobody has edited it in the
CMS. Edited items are left alone. When the starter texts change again, append the fingerprints
of the version being replaced (see `fingerprint_article` / `fingerprint_practice` in seed.py).
"""

# v1 — starter texts (round 1, before evidence-based sources)
ARTICLE_FINGERPRINTS = {
    "trevoga-kak-ustroena": {"628b74a698703829"},
    "vygoranie": {"0a6e235dce6899e1"},
    "son-i-bessonnitsa": {"b07456ef833c3b34"},
    "otnosheniya-ssory": {"6400755997368eb4"},
    "gore-i-utrata": {"9e820b9f4cc5f107"},
    "samoocenka": {"809fe029e68dccae"},
    "kak-rabotaet-psihoterapiya": {"21790155f62c8472"},
    "kak-vybrat-psihologa": {"cd444eba0cb23efb"},
    "pervaya-sessiya": {"a6927354cce8c2b0"},
    "panicheskie-ataki": {"a0a3881ff9a4a928"},
    "lichnye-granitsy": {"e5d069b318348e9e"},
    "odinochestvo": {"7b26b8456dfbc25a"},
}

PRACTICE_FINGERPRINTS = {
    "dyhanie-4-6": {"51db357f9a12185b"},
    "kvadratnoe-dyhanie": {"bf946b1a5662aa63"},
    "zazemlenie-5-4-3-2-1": {"cbf95017cfafda7c"},
    "skanirovanie-tela": {"4d978f8fcfde30af"},
    "razgruzka-golovy": {"b0661984482fa0a0"},
    "voprosy-dlya-dnevnika": {"22fc8d6cbcb83e98"},
    "myshechnaya-relaksaciya": {"9683d30c26113c5c"},
    "tri-horoshih-veshchi": {"70ba0f6921ee151a"},
}
