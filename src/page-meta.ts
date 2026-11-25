import { buttonClass } from './components/ui';
import { challengeBySlug, CHALLENGES } from './challenges';
import { lessonsFor, messagesFor, type Locale } from './i18n';
import { localeHomePath, type Route } from './router';

const BRAND = 'Lean Init IDE';
const EN_TITLE_MIN = 30;
const EN_TITLE_MAX = 60;
const ZH_TITLE_MIN = 15;
const ZH_TITLE_MAX = 30;
const EN_DESCRIPTION_MIN = 110;
const EN_DESCRIPTION_MAX = 155;
const ZH_DESCRIPTION_MIN = 55;
const ZH_DESCRIPTION_MAX = 85;

const HAN = /\p{Script=Han}/u;

/** 中文标题按「汉字」计数；英文标题与描述按字符计数，和 Bing 站长工具的口径一致。 */
const hanCount = (value: string): number =>
  Array.from(value).filter((char) => HAN.test(char)).length;

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** 截断后去掉悬挂的冠词/介词，避免标题以 “the” 或 “in” 之类收尾。 */
const TRAILING_STOPWORD =
  /\s+(?:a|an|the|and|or|of|to|in|on|at|by|for|from|with|why|how|is|are|does|do|as|into|than|then|that|this)$/i;

const truncateWords = (value: string, max: number): string => {
  const cut = value.slice(0, max);
  const wordEnd = cut.lastIndexOf(' ');
  let result = (wordEnd > 0 ? cut.slice(0, wordEnd) : cut).replace(/[\s,;:·–—-]+$/u, '').trim();
  while (TRAILING_STOPWORD.test(result)) result = result.replace(TRAILING_STOPWORD, '').trim();
  return result;
};

const truncateHan = (value: string, max: number): string => {
  let count = 0;
  let output = '';
  for (const char of value) {
    if (HAN.test(char)) {
      if (count >= max) break;
      count += 1;
    }
    output += char;
  }
  return output.replace(/[\s,;:，；：、·–—-]+$/u, '').trim();
};

/** 英文描述优先在句末截断，避免把句子切在半截。 */
const truncateEnglishDescription = (value: string, max: number): string => {
  const cut = value.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sentenceEnd >= EN_DESCRIPTION_MIN) return cut.slice(0, sentenceEnd + 1).trim();
  return truncateWords(cut, max);
};

const EN_DESCRIPTION_CLAUSES = [
  ' Lean 4.36.0 runs as WebAssembly inside a Web Worker.',
  ' Init is built in, while Std and Batteries load on demand.',
  ' There is no backend, no install, and your code never leaves the browser.',
];

const EN_DESCRIPTION_FILLERS = [
  ' Lean 4 in your browser.',
  ' Runs entirely on the client.',
  ' No backend required.',
];

const ZH_DESCRIPTION_CLAUSES = [
  'Lean 4.36.0 在浏览器内以 WebAssembly 运行，代码不会上传到服务器。',
  'Init 已内置，Std 与 Batteries 可按需加载，无需安装工具链或后端。',
  '站点提供双语课程、速查表与在线编辑器，并在 GitHub 开源。',
];

const fitEnglishTitle = (base: string): string => {
  let title = clean(base);
  if (title.length < EN_TITLE_MIN) {
    title = title.includes(BRAND) ? `${title} · Lean 4` : `${title} · ${BRAND}`;
  }
  if (title.length > EN_TITLE_MAX) title = truncateWords(title, EN_TITLE_MAX);
  if (title.length < EN_TITLE_MIN) title = `${title} · Lean 4`;
  return title;
};

const fitChineseTitle = (base: string): string => {
  let title = clean(base);
  // 短标题补一层中文语义，保证至少 15 个汉字；品牌后缀不计入汉字数。
  if (hanCount(title) < ZH_TITLE_MIN) title = `${title} · Lean 4 浏览器定理证明实践`;
  if (hanCount(title) > ZH_TITLE_MAX) title = truncateHan(title, ZH_TITLE_MAX);
  return title.includes(BRAND) ? title : `${title} · ${BRAND}`;
};

const fitEnglishDescription = (base: string): string => {
  let description = clean(base);
  if (description.length > EN_DESCRIPTION_MAX) {
    description = truncateEnglishDescription(description, EN_DESCRIPTION_MAX);
  }
  for (const clause of EN_DESCRIPTION_CLAUSES) {
    if (description.length >= EN_DESCRIPTION_MIN) break;
    if (description.length + clause.length <= EN_DESCRIPTION_MAX) description += clause;
  }
  for (const filler of EN_DESCRIPTION_FILLERS) {
    if (description.length >= EN_DESCRIPTION_MIN) break;
    if (description.length + filler.length <= EN_DESCRIPTION_MAX) description += filler;
  }
  return description;
};

const fitChineseDescription = (base: string): string => {
  let description = clean(base);
  for (const clause of ZH_DESCRIPTION_CLAUSES) {
    if (hanCount(description) >= ZH_DESCRIPTION_MIN) break;
    description += clause;
  }
  if (hanCount(description) > ZH_DESCRIPTION_MAX) {
    description = truncateHan(description, ZH_DESCRIPTION_MAX);
  }
  return description;
};

const baseTitle = (route: Route): string => {
  const t = messagesFor(route.locale);
  if (route.locale === 'zh') {
    switch (route.page) {
      case 'home':
        return '在浏览器里在线运行 Lean 4 定理证明器：内置 Init、Std 与 Batteries';
      case 'playground':
        return 'Lean 4 在线 Playground：浏览器内的实时定理证明编辑器';
      case 'reference':
        return 'Lean 4 策略与符号速查表：证明常用命令一览';
      case 'privacy':
        return '隐私说明：Lean 4 在线环境收集哪些匿名数据';
      case 'challenges':
        return 'Lean 4 趣味挑战：在证明游乐场里亲手通关经典数学题与未解猜想';
      case 'lesson': {
        const lessons = lessonsFor(route.locale);
        return (
          (lessons.find((item) => item.slug === route.slug) ?? lessons[0])?.title ??
          t.lesson.tocTitle
        );
      }
      case 'challenge': {
        const challenge = challengeBySlug(route.slug) ?? CHALLENGES[0]!;
        return challenge.title.zh;
      }
      default:
        return t.notFound.title;
    }
  }

  switch (route.page) {
    case 'home':
      return 'Lean Init IDE · Run Lean 4 in your browser';
    case 'playground':
      return 'Lean 4 Playground · WebAssembly in your browser';
    case 'reference':
      return `Lean 4 tactics and symbols reference · ${BRAND}`;
    case 'privacy':
      return `Privacy notice · ${BRAND}`;
    case 'challenges':
      return `Lean 4 math challenges for beginners · ${BRAND}`;
    case 'lesson': {
      const lessons = lessonsFor(route.locale);
      return (
        (lessons.find((item) => item.slug === route.slug) ?? lessons[0])?.title ?? t.lesson.tocTitle
      );
    }
    case 'challenge': {
      const challenge = challengeBySlug(route.slug) ?? CHALLENGES[0]!;
      return challenge.title.en;
    }
    default:
      return t.notFound.title;
  }
};

const baseDescription = (route: Route): string => {
  const t = messagesFor(route.locale);
  switch (route.page) {
    case 'home':
      return t.home.seoDescription;
    case 'playground':
      return t.playground.seoDescription;
    case 'lesson': {
      const lessons = lessonsFor(route.locale);
      const lesson = lessons.find((item) => item.slug === route.slug) ?? lessons[0];
      return lesson?.lead ?? t.home.lead;
    }
    case 'privacy':
      return t.privacy.intro;
    case 'reference':
      return t.reference.lead;
    case 'challenges':
      return t.challenges.lead;
    case 'challenge': {
      const challenge = challengeBySlug(route.slug) ?? CHALLENGES[0]!;
      return challenge.summary[route.locale];
    }
    default:
      return t.home.lead;
  }
};

export const renderNotFound = (locale: Locale): string => {
  const t = messagesFor(locale).notFound;
  return `
    <section class="max-w-[560px] py-12">
      <h1 class="mt-0 mb-3">${t.title}</h1>
      <p class="mt-0 mb-5 text-muted">${t.body}</p>
      <a class="${buttonClass}" href="${localeHomePath(locale)}">${t.cta}</a>
    </section>
  `;
};

export const pageTitle = (route: Route): string => {
  const base = baseTitle(route);
  return route.locale === 'zh' ? fitChineseTitle(base) : fitEnglishTitle(base);
};

export const pageDescription = (route: Route): string => {
  const base = baseDescription(route);
  return route.locale === 'zh' ? fitChineseDescription(base) : fitEnglishDescription(base);
};
