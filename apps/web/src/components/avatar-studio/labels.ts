/**
 * Russian names for every option value in the AvatarConfig catalogues.
 * Typed as Record<Union, string> so a new schema value fails type-checking
 * until it gets a label here.
 */
import type {
  AgeLook,
  BrowStyle,
  ChinShape,
  EarSize,
  EarringStyle,
  EyeShape,
  Eyewear,
  FacialHair,
  Freckles,
  HairStyle,
  HeadShape,
  Headwear,
  LashStyle,
  Mole,
  MouthShape,
  NosePiercing,
  NoseShape,
  Outfit,
  TeethStyle,
} from "@/lib/avatar/schema";

export const HEAD_SHAPE_RU: Record<HeadShape, string> = {
  round: "Круглая",
  oval: "Овальная",
  square: "Квадратная",
  heart: "Сердечком",
  long: "Вытянутая",
  wide: "Широкая",
};

export const CHIN_RU: Record<ChinShape, string> = {
  soft: "Мягкий",
  pointed: "Острый",
  square: "Квадратный",
  cleft: "С ямочкой",
};

export const AGE_RU: Record<AgeLook, string> = {
  young: "Молодой",
  adult: "Взрослый",
  mature: "Зрелый",
  senior: "Пожилой",
};

export const FRECKLES_RU: Record<Freckles, string> = {
  none: "Нет",
  light: "Немного",
  medium: "Средне",
  heavy: "Много",
};

export const MOLE_RU: Record<Mole, string> = {
  none: "Нет",
  cheek: "На щеке",
  lip: "Над губой",
  eye: "У глаза",
};

export const HAIR_RU: Record<HairStyle, string> = {
  bald: "Без волос",
  buzz: "Под машинку",
  crew: "Короткая",
  "side-part": "Боковой пробор",
  quiff: "Квифф",
  pompadour: "Помпадур",
  "slick-back": "Зачёс назад",
  undercut: "Андеркат",
  messy: "Небрежная",
  mohawk: "Ирокез",
  "curly-short": "Короткие кудри",
  "fade-curls": "Кудри с фейдом",
  afro: "Афро",
  pixie: "Пикси",
  bob: "Каре",
  lob: "Длинное каре",
  shag: "Шэг",
  "bangs-long": "Длинные с чёлкой",
  "long-straight": "Длинные прямые",
  "long-wavy": "Длинные волны",
  "long-curly": "Длинные кудри",
  "side-swept": "Косой пробор",
  ponytail: "Хвост",
  "high-ponytail": "Высокий хвост",
  bun: "Пучок",
  "double-buns": "Два пучка",
  "man-bun": "Пучок на макушке",
  braids: "Косички",
  "box-braids": "Брейды",
  dreads: "Дреды",
  cornrows: "Корнроу",
  mullet: "Маллет",
};

export const BROW_RU: Record<BrowStyle, string> = {
  natural: "Естественные",
  thin: "Тонкие",
  thick: "Густые",
  arched: "Дугой",
  straight: "Прямые",
  bushy: "Кустистые",
  angled: "С изломом",
  none: "Без бровей",
};

export const EYE_SHAPE_RU: Record<EyeShape, string> = {
  round: "Круглые",
  almond: "Миндалевидные",
  hooded: "С нависшим веком",
  upturned: "Приподнятые",
  downturned: "Опущенные",
  monolid: "Без складки",
};

export const LASH_RU: Record<LashStyle, string> = {
  none: "Нет",
  natural: "Естественные",
  long: "Длинные",
  dramatic: "Выразительные",
  winged: "Стрелки",
};

export const NOSE_RU: Record<NoseShape, string> = {
  button: "Кнопочкой",
  straight: "Прямой",
  wide: "Широкий",
  pointed: "Острый",
  round: "Круглый",
  long: "Длинный",
  hooked: "С горбинкой",
};

export const PIERCING_RU: Record<NosePiercing, string> = {
  none: "Нет",
  stud: "Гвоздик",
  ring: "Колечко",
  septum: "Септум",
};

export const MOUTH_RU: Record<MouthShape, string> = {
  full: "Пухлые",
  thin: "Тонкие",
  wide: "Широкие",
  heart: "Сердечком",
  small: "Маленькие",
  bow: "Бантиком",
};

export const TEETH_RU: Record<TeethStyle, string> = {
  normal: "Обычные",
  gap: "Щербинка",
  braces: "Брекеты",
};

export const EAR_RU: Record<EarSize, string> = {
  small: "Маленькие",
  medium: "Средние",
  large: "Большие",
};

export const EARRING_RU: Record<EarringStyle, string> = {
  none: "Нет",
  studs: "Гвоздики",
  hoops: "Кольца",
  "small-hoops": "Маленькие кольца",
  drops: "Подвески",
  pearls: "Жемчуг",
  cuff: "Каффы",
};

export const FACIAL_HAIR_RU: Record<FacialHair, string> = {
  none: "Нет",
  stubble: "Щетина",
  mustache: "Усы",
  handlebar: "Усы-руль",
  goatee: "Эспаньолка",
  chinstrap: "Шкиперская",
  "short-beard": "Короткая борода",
  "full-beard": "Густая борода",
  "long-beard": "Длинная борода",
};

export const EYEWEAR_RU: Record<Eyewear, string> = {
  none: "Без очков",
  round: "Круглые",
  square: "Квадратные",
  aviator: "Авиаторы",
  "cat-eye": "Кошачий глаз",
  oversized: "Большие",
  rimless: "Без оправы",
  sport: "Спортивные",
};

export const HEADWEAR_RU: Record<Headwear, string> = {
  none: "Нет",
  beanie: "Шапка",
  cap: "Кепка",
  bucket: "Панама",
  fedora: "Федора",
  beret: "Берет",
  headband: "Повязка",
  bandana: "Бандана",
  turban: "Тюрбан",
  hijab: "Хиджаб",
  headphones: "Наушники",
};

export const OUTFIT_RU: Record<Outfit, string> = {
  crew: "Футболка",
  vneck: "V-вырез",
  hoodie: "Худи",
  collar: "Рубашка",
  turtleneck: "Водолазка",
  sweater: "Свитер",
};
