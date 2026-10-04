/** Friendly anonymous aliases for demos (same word lists as the backend generator, apps/users/aliases.py). */
const RU_ADJ = ['тихий', 'светлый', 'добрый', 'ясный', 'мудрый', 'смелый', 'быстрый', 'нежный', 'спокойный', 'яркий', 'лунный', 'солнечный', 'лесной', 'морской', 'горный', 'речной', 'небесный', 'снежный', 'летний', 'осенний', 'весенний', 'зимний', 'утренний', 'вечерний', 'ночной', 'серебряный', 'золотой', 'янтарный', 'изумрудный', 'синий', 'рыжий', 'белый', 'бархатный', 'хрустальный', 'мягкий', 'задумчивый', 'внимательный', 'честный', 'верный', 'гордый', 'ловкий', 'чуткий', 'шустрый', 'отважный', 'уютный', 'северный', 'южный', 'дальний', 'вольный', 'юный', 'чистый', 'свежий', 'туманный', 'лучистый', 'звонкий', 'сонный', 'бодрый', 'плавный', 'кроткий', 'пушистый', 'степной', 'полевой'];
const RU_NOUN = ['кит', 'лис', 'волк', 'барсук', 'бобр', 'филин', 'дельфин', 'журавль', 'лебедь', 'сокол', 'ястреб', 'кот', 'заяц', 'олень', 'лось', 'медведь', 'тюлень', 'пингвин', 'воробей', 'снегирь', 'соловей', 'дрозд', 'скворец', 'аист', 'пеликан', 'енот', 'хомяк', 'суслик', 'тигр', 'лев', 'леопард', 'ягуар', 'гепард', 'барс', 'жираф', 'слон', 'бегемот', 'крот', 'краб', 'осьминог', 'морж', 'лемур', 'ленивец', 'шмель', 'светлячок', 'кузнечик', 'дятел', 'попугай', 'павлин', 'глухарь', 'песец', 'соболь', 'горностай', 'бурундук', 'зубр', 'як', 'верблюд', 'единорог', 'кедр', 'дуб', 'ясень', 'тополь', 'рассвет', 'закат', 'туман', 'ручей', 'маяк', 'парус', 'остров'];
const EN_ADJ = ['quiet', 'bright', 'kind', 'clear', 'wise', 'brave', 'swift', 'gentle', 'calm', 'sunny', 'lunar', 'forest', 'ocean', 'mountain', 'river', 'misty', 'snowy', 'summer', 'autumn', 'spring', 'winter', 'morning', 'evening', 'silver', 'golden', 'amber', 'emerald', 'blue', 'red', 'velvet', 'crystal', 'soft', 'thoughtful', 'honest', 'loyal', 'nimble', 'cosy', 'northern', 'southern', 'distant', 'free', 'young', 'fresh', 'radiant', 'sleepy', 'cheerful', 'smooth', 'fluffy', 'meadow', 'starry', 'warm', 'curious', 'patient', 'steady', 'hidden', 'little', 'wild', 'mellow', 'tidal', 'tender'];
const EN_NOUN = ['whale', 'fox', 'wolf', 'badger', 'beaver', 'owl', 'dolphin', 'crane', 'swan', 'falcon', 'hawk', 'cat', 'hare', 'deer', 'moose', 'bear', 'seal', 'penguin', 'robin', 'finch', 'thrush', 'stork', 'pelican', 'raccoon', 'hamster', 'tiger', 'lion', 'leopard', 'jaguar', 'lynx', 'giraffe', 'elephant', 'otter', 'crab', 'octopus', 'walrus', 'lemur', 'sloth', 'bumblebee', 'firefly', 'woodpecker', 'parrot', 'peacock', 'sable', 'chipmunk', 'bison', 'yak', 'camel', 'unicorn', 'cedar', 'oak', 'maple', 'willow', 'sunrise', 'sunset', 'mist', 'brook', 'lighthouse', 'sail', 'island', 'comet', 'harbor'];

/** Uniform random integer in [0, n) from the browser's crypto source (falls back to Math.random). */
export function randomInt(n: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n; // rejection sampling: no modulo bias
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

/** A fresh unpredictable seed for randomAvatar(). */
export function randomSeed(): string {
  return `r-${randomInt(0x7fffffff).toString(36)}-${randomInt(0x7fffffff).toString(36)}`;
}

/** «тихий-кит-4821» / «quiet-whale-4821» */
export function randomAlias(locale: string): string {
  const [adj, noun] = locale === "en" ? [EN_ADJ, EN_NOUN] : [RU_ADJ, RU_NOUN];
  const num = String(1000 + randomInt(9000));
  return `${adj[randomInt(adj.length)]}-${noun[randomInt(noun.length)]}-${num}`;
}
