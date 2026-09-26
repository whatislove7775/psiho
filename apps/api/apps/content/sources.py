"""Verified sources for the starter content.

Every entry was checked on 2026-09-25: the URL points to the official record (PubMed, the
publisher's DOI, WHO or NICE) and the title/authors/year match it. Never add a source here
without opening its link; if a link can't be verified, leave the claim without a citation
or remove the claim.

Shape: {"title", "authors", "year", "publisher", "url", "doi"?, "kind"}.
kind: guideline | review | study | org
"""

WHO_ANXIETY = {
    "title": "Anxiety disorders (fact sheet)",
    "authors": "World Health Organization",
    "year": 2025,
    "publisher": "WHO",
    "url": "https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders",
    "kind": "org",
}

NICE_CG113 = {
    "title": "Generalised anxiety disorder and panic disorder in adults: management (CG113)",
    "authors": "National Institute for Health and Care Excellence",
    "year": 2011,
    "publisher": "NICE, обновлено в 2020",
    "url": "https://www.nice.org.uk/guidance/cg113",
    "kind": "guideline",
}

NICE_NG222 = {
    "title": "Depression in adults: treatment and management (NG222)",
    "authors": "National Institute for Health and Care Excellence",
    "year": 2022,
    "publisher": "NICE",
    "url": "https://www.nice.org.uk/guidance/ng222",
    "kind": "guideline",
}

HOFMANN_2012 = {
    "title": "The Efficacy of Cognitive Behavioral Therapy: A Review of Meta-analyses",
    "authors": "Hofmann S. G., Asnaani A. и др.",
    "year": 2012,
    "publisher": "Cognitive Therapy and Research, 36(5), 427–440",
    "url": "https://pubmed.ncbi.nlm.nih.gov/23459093/",
    "doi": "10.1007/s10608-012-9476-1",
    "kind": "review",
}

BORKOVEC_1983 = {
    "title": "Stimulus control applications to the treatment of worry",
    "authors": "Borkovec T. D., Wilkinson L., Folensbee R., Lerman C.",
    "year": 1983,
    "publisher": "Behaviour Research and Therapy, 21(3), 247–251",
    "url": "https://pubmed.ncbi.nlm.nih.gov/6615390/",
    "kind": "study",
}

ZACCARO_2018 = {
    "title": "How Breath-Control Can Change Your Life: A Systematic Review on Psycho-Physiological Correlates of Slow Breathing",
    "authors": "Zaccaro A., Piarulli A., Laurino M., Garbella E., Menicucci D., Neri B., Gemignani A.",
    "year": 2018,
    "publisher": "Frontiers in Human Neuroscience, 12, 353",
    "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6137615/",
    "doi": "10.3389/fnhum.2018.00353",
    "kind": "review",
}

FINCHAM_2023 = {
    "title": "Effect of breathwork on stress and mental health: A meta-analysis of randomised-controlled trials",
    "authors": "Fincham G. W., Strauss C., Montero-Marin J., Cavanagh K.",
    "year": 2023,
    "publisher": "Scientific Reports, 13, 432",
    "url": "https://pubmed.ncbi.nlm.nih.gov/36624160/",
    "kind": "review",
}

BALBAN_2023 = {
    "title": "Brief structured respiration practices enhance mood and reduce physiological arousal",
    "authors": "Balban M. Y., Neri E., Kogon M. M., Weed L., Nouriani B., Jo B. и др.",
    "year": 2023,
    "publisher": "Cell Reports Medicine, 4(1), 100895",
    "url": "https://doi.org/10.1016/j.xcrm.2022.100895",
    "doi": "10.1016/j.xcrm.2022.100895",
    "kind": "study",
}

WHO_BURNOUT = {
    "title": "Burn-out an “occupational phenomenon”: International Classification of Diseases",
    "authors": "World Health Organization",
    "year": 2019,
    "publisher": "WHO",
    "url": "https://www.who.int/news/item/28-05-2019-burn-out-an-occupational-phenomenon-international-classification-of-diseases",
    "kind": "org",
}

MASLACH_2016 = {
    "title": "Understanding the burnout experience: recent research and its implications for psychiatry",
    "authors": "Maslach C., Leiter M. P.",
    "year": 2016,
    "publisher": "World Psychiatry, 15(2), 103–111",
    "url": "https://doi.org/10.1002/wps.20311",
    "doi": "10.1002/wps.20311",
    "kind": "review",
}

EDINGER_2021 = {
    "title": "Behavioral and psychological treatments for chronic insomnia disorder in adults: an American Academy of Sleep Medicine clinical practice guideline",
    "authors": "Edinger J. D., Arnedt J. T., Bertisch S. M. и др.",
    "year": 2021,
    "publisher": "Journal of Clinical Sleep Medicine, 17(2), 255–262",
    "url": "https://pubmed.ncbi.nlm.nih.gov/33164742/",
    "kind": "guideline",
}

TRAUER_2015 = {
    "title": "Cognitive Behavioral Therapy for Chronic Insomnia: A Systematic Review and Meta-analysis",
    "authors": "Trauer J. M., Qian M. Y., Doyle J. S., Rajaratnam S. M. W., Cunnington D.",
    "year": 2015,
    "publisher": "Annals of Internal Medicine, 163(3), 191–204",
    "url": "https://pubmed.ncbi.nlm.nih.gov/26054060/",
    "kind": "review",
}

GOTTMAN_2000 = {
    "title": "The Timing of Divorce: Predicting When a Couple Will Divorce Over a 14-Year Period",
    "authors": "Gottman J. M., Levenson R. W.",
    "year": 2000,
    "publisher": "Journal of Marriage and Family, 62, 737–745",
    "url": "https://doi.org/10.1111/j.1741-3737.2000.00737.x",
    "doi": "10.1111/j.1741-3737.2000.00737.x",
    "kind": "study",
}

STROEBE_SCHUT_1999 = {
    "title": "The dual process model of coping with bereavement: rationale and description",
    "authors": "Stroebe M., Schut H.",
    "year": 1999,
    "publisher": "Death Studies, 23(3), 197–224",
    "url": "https://pubmed.ncbi.nlm.nih.gov/10848151/",
    "kind": "study",
}

BONANNO_2004 = {
    "title": "Loss, trauma, and human resilience: have we underestimated the human capacity to thrive after extremely aversive events?",
    "authors": "Bonanno G. A.",
    "year": 2004,
    "publisher": "American Psychologist, 59(1), 20–28",
    "url": "https://pubmed.ncbi.nlm.nih.gov/14736317/",
    "kind": "review",
}

KILLIKELLY_2018 = {
    "title": "Prolonged grief disorder for ICD-11: the primacy of clinical utility and international applicability",
    "authors": "Killikelly C., Maercker A.",
    "year": 2018,
    "publisher": "European Journal of Psychotraumatology",
    "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5990943/",
    "doi": "10.1080/20008198.2018.1476441",
    "kind": "review",
}

NEFF_2003 = {
    "title": "Self-Compassion: An Alternative Conceptualization of a Healthy Attitude Toward Oneself",
    "authors": "Neff K. D.",
    "year": 2003,
    "publisher": "Self and Identity, 2(2), 85–101",
    "url": "https://doi.org/10.1080/15298860309032",
    "doi": "10.1080/15298860309032",
    "kind": "study",
}

MACBETH_2012 = {
    "title": "Exploring compassion: a meta-analysis of the association between self-compassion and psychopathology",
    "authors": "MacBeth A., Gumley A.",
    "year": 2012,
    "publisher": "Clinical Psychology Review, 32(6), 545–552",
    "url": "https://pubmed.ncbi.nlm.nih.gov/22796446/",
    "kind": "review",
}

ORTH_ROBINS_2014 = {
    "title": "The Development of Self-Esteem",
    "authors": "Orth U., Robins R. W.",
    "year": 2014,
    "publisher": "Current Directions in Psychological Science, 23(5), 381–387",
    "url": "https://doi.org/10.1177/0963721414547414",
    "doi": "10.1177/0963721414547414",
    "kind": "review",
}

WAMPOLD_2015 = {
    "title": "How important are the common factors in psychotherapy? An update",
    "authors": "Wampold B. E.",
    "year": 2015,
    "publisher": "World Psychiatry, 14(3), 270–277",
    "url": "https://pubmed.ncbi.nlm.nih.gov/26407772/",
    "doi": "10.1002/wps.20238",
    "kind": "review",
}

FLUCKIGER_2018 = {
    "title": "The alliance in adult psychotherapy: A meta-analytic synthesis",
    "authors": "Flückiger C., Del Re A. C., Wampold B. E., Horvath A. O.",
    "year": 2018,
    "publisher": "Psychotherapy, 55(4), 316–340",
    "url": "https://pubmed.ncbi.nlm.nih.gov/29792475/",
    "kind": "review",
}

SWIFT_2012 = {
    "title": "Premature discontinuation in adult psychotherapy: a meta-analysis",
    "authors": "Swift J. K., Greenberg R. P.",
    "year": 2012,
    "publisher": "Journal of Consulting and Clinical Psychology, 80(4), 547–559",
    "url": "https://pubmed.ncbi.nlm.nih.gov/22506792/",
    "doi": "10.1037/a0028226",
    "kind": "review",
}

CLARK_1986 = {
    "title": "A cognitive approach to panic",
    "authors": "Clark D. M.",
    "year": 1986,
    "publisher": "Behaviour Research and Therapy, 24(4), 461–470",
    "url": "https://pubmed.ncbi.nlm.nih.gov/3741311/",
    "kind": "study",
}

SPEED_2018 = {
    "title": "Assertiveness Training: A Forgotten Evidence-Based Treatment",
    "authors": "Speed B. C., Goldstein B. L., Goldfried M. R.",
    "year": 2018,
    "publisher": "Clinical Psychology: Science and Practice, 25, e12216",
    "url": "https://doi.org/10.1111/cpsp.12216",
    "doi": "10.1111/cpsp.12216",
    "kind": "review",
}

WHO_SOCIAL_CONNECTION_2025 = {
    "title": "Social connection linked to improved health and reduced risk of early death",
    "authors": "World Health Organization, Commission on Social Connection",
    "year": 2025,
    "publisher": "WHO",
    "url": "https://www.who.int/news/item/30-06-2025-social-connection-linked-to-improved-heath-and-reduced-risk-of-early-death",
    "kind": "org",
}

HOLT_LUNSTAD_2010 = {
    "title": "Social relationships and mortality risk: a meta-analytic review",
    "authors": "Holt-Lunstad J., Smith T. B., Layton J. B.",
    "year": 2010,
    "publisher": "PLoS Medicine, 7(7), e1000316",
    "url": "https://pubmed.ncbi.nlm.nih.gov/20668659/",
    "doi": "10.1371/journal.pmed.1000316",
    "kind": "review",
}

MASI_2011 = {
    "title": "A meta-analysis of interventions to reduce loneliness",
    "authors": "Masi C. M., Chen H.-Y., Hawkley L. C., Cacioppo J. T.",
    "year": 2011,
    "publisher": "Personality and Social Psychology Review, 15, 219–266",
    "url": "https://pubmed.ncbi.nlm.nih.gov/20716644/",
    "kind": "review",
}

MANZONI_2008 = {
    "title": "Relaxation training for anxiety: a ten-years systematic review with meta-analysis",
    "authors": "Manzoni G. M., Pagnini F., Castelnuovo G., Molinari E.",
    "year": 2008,
    "publisher": "BMC Psychiatry, 8, 41",
    "url": "https://pubmed.ncbi.nlm.nih.gov/18518981/",
    "kind": "review",
}

GAN_2022 = {
    "title": "The effects of body scan meditation: A systematic review and meta-analysis",
    "authors": "Gan R. и др.",
    "year": 2022,
    "publisher": "Applied Psychology: Health and Well-Being, 14(3), 1062–1080",
    "url": "https://pubmed.ncbi.nlm.nih.gov/35538557/",
    "kind": "review",
}

KHOURY_2015 = {
    "title": "Mindfulness-based stress reduction for healthy individuals: A meta-analysis",
    "authors": "Khoury B., Sharma M., Rush S. E., Fournier C.",
    "year": 2015,
    "publisher": "Journal of Psychosomatic Research, 78, 519–528",
    "url": "https://doi.org/10.1016/j.jpsychores.2015.03.009",
    "doi": "10.1016/j.jpsychores.2015.03.009",
    "kind": "review",
}

SMYTH_1998 = {
    "title": "Written emotional expression: effect sizes, outcome types, and moderating variables",
    "authors": "Smyth J. M.",
    "year": 1998,
    "publisher": "Journal of Consulting and Clinical Psychology, 66(1)",
    "url": "https://pubmed.ncbi.nlm.nih.gov/9489272/",
    "kind": "review",
}

FRATTAROLI_2006 = {
    "title": "Experimental disclosure and its moderators: a meta-analysis",
    "authors": "Frattaroli J.",
    "year": 2006,
    "publisher": "Psychological Bulletin, 132(6), 823–865",
    "url": "https://pubmed.ncbi.nlm.nih.gov/17073523/",
    "kind": "review",
}

SELIGMAN_2005 = {
    "title": "Positive psychology progress: empirical validation of interventions",
    "authors": "Seligman M. E. P., Steen T. A., Park N., Peterson C.",
    "year": 2005,
    "publisher": "American Psychologist, 60(5), 410–421",
    "url": "https://pubmed.ncbi.nlm.nih.gov/16045394/",
    "kind": "study",
}

WHITE_2019 = {
    "title": "Meta-analyses of positive psychology interventions: The effects are much smaller than previously reported",
    "authors": "White C. A., Uttl B., Holder M. D.",
    "year": 2019,
    "publisher": "PLoS ONE, 14(5), e0216588",
    "url": "https://pubmed.ncbi.nlm.nih.gov/31141537/",
    "doi": "10.1371/journal.pone.0216588",
    "kind": "review",
}
