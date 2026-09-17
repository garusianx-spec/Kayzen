/**
 * The home screen's widget registry.
 *
 * Home is the only screen in the app that is a *composition* rather than a
 * view of one thing, which is why it is the only one that is configurable.
 * Everything here is a description; the components live in
 * `src/components/widgets/home/` and are resolved by id at render time, so this
 * module stays free of JSX and can be unit-tested.
 *
 * Adding a widget is: append an entry, add its component to the map, and — if
 * it should be on for everybody — put its id in `DEFAULT_LAYOUT`. Existing
 * accounts that have never customised their layout pick it up automatically,
 * because their stored value is `null` rather than a copy of the old default.
 */

export type HomeWidgetId =
  | 'summary'
  | 'jalali'
  | 'quote'
  | 'countdowns'
  | 'tasks'
  | 'habits'
  | 'finance'
  | 'book'
  | 'links';

export interface HomeWidgetMeta {
  id: HomeWidgetId;
  label: string;
  /** One line in the customisation sheet, saying what the widget is for. */
  description: string;
  /** Lucide icon name, resolved by the sheet. */
  icon: string;
}

export const HOME_WIDGETS: readonly HomeWidgetMeta[] = [
  {
    id: 'summary',
    label: 'خلاصهٔ امروز',
    description: 'پیشرفت کارها، امتیاز، دقیقهٔ تمرکز و عادت‌ها',
    icon: 'Sparkles',
  },
  {
    id: 'jalali',
    label: 'تقویم جلالی',
    description: 'روز، ماه و سال شمسی با تاریخ میلادی',
    icon: 'CalendarDays',
  },
  {
    id: 'quote',
    label: 'جملهٔ روز',
    description: 'هر روز یک جملهٔ کوتاه دربارهٔ یک‌درصد بهتر شدن',
    icon: 'Quote',
  },
  {
    id: 'countdowns',
    label: 'در راه است',
    description: 'نزدیک‌ترین رویدادها و شمارش معکوسشان',
    icon: 'CalendarClock',
  },
  {
    id: 'tasks',
    label: 'کارهای امروز',
    description: 'فهرست کارهای سررسیدِ امروز',
    icon: 'CheckSquare',
  },
  {
    id: 'habits',
    label: 'عادت‌های امروز',
    description: 'عادت‌هایی که امروز سررسید دارند',
    icon: 'Flame',
  },
  {
    id: 'finance',
    label: 'هدف مالی',
    description: 'پیشرفت نزدیک‌ترین صندوق و واریز سریع',
    icon: 'PiggyBank',
  },
  { id: 'book', label: 'کتاب امروز', description: 'خلاصهٔ امروز کتابخانهٔ ۳۶۵', icon: 'BookOpen' },
  { id: 'links', label: 'میان‌برها', description: 'یادداشت‌ها و شمارش معکوس', icon: 'LayoutGrid' },
] as const;

/**
 * What a new account sees.
 *
 * Deliberately not every widget. A home screen that opens with nine sections
 * teaches people to scroll past it; the ones left out are a tap away in the
 * sheet, which is a better introduction than a wall.
 */
export const DEFAULT_LAYOUT: readonly HomeWidgetId[] = [
  'summary',
  'jalali',
  'quote',
  'countdowns',
  'tasks',
  'habits',
  'links',
] as const;

const KNOWN = new Set<string>(HOME_WIDGETS.map((widget) => widget.id));

export function widgetMeta(id: HomeWidgetId): HomeWidgetMeta {
  const meta = HOME_WIDGETS.find((widget) => widget.id === id);
  if (!meta) throw new Error(`unknown home widget ${id}`);
  return meta;
}

/**
 * Reads a stored layout back into a list of ids.
 *
 * Tolerant on purpose, because this value survives schema changes: unknown ids
 * (a widget that was removed) are dropped, duplicates are collapsed, and
 * anything that is not the expected shape falls back to the default. A home
 * screen that refuses to render because a preference row is from last year is
 * worse than one that quietly returns to the default.
 */
export function parseLayout(stored: unknown): HomeWidgetId[] {
  if (stored === null || stored === undefined) return [...DEFAULT_LAYOUT];

  const visible =
    typeof stored === 'object' && stored !== null && 'visible' in stored
      ? (stored as { visible: unknown }).visible
      : null;

  if (!Array.isArray(visible)) return [...DEFAULT_LAYOUT];

  const seen = new Set<string>();
  const layout: HomeWidgetId[] = [];

  for (const entry of visible) {
    if (typeof entry !== 'string' || !KNOWN.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    layout.push(entry as HomeWidgetId);
  }

  return layout;
}

/** The shape written back to the column. */
export function serializeLayout(layout: readonly HomeWidgetId[]): { visible: HomeWidgetId[] } {
  return { visible: [...layout] };
}

/** Moves one widget up or down, returning a new list. */
export function reorder(
  layout: readonly HomeWidgetId[],
  id: HomeWidgetId,
  direction: -1 | 1,
): HomeWidgetId[] {
  const index = layout.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.length) return [...layout];

  const next = [...layout];
  [next[index], next[target]] = [next[target] as HomeWidgetId, next[index] as HomeWidgetId];
  return next;
}

/**
 * Turns a widget on or off.
 *
 * Enabling appends rather than restoring the old position, because the old
 * position is not knowable from a list of visible ids — and appending is the
 * behaviour a person can predict from watching it happen once.
 */
export function toggle(layout: readonly HomeWidgetId[], id: HomeWidgetId): HomeWidgetId[] {
  return layout.includes(id) ? layout.filter((entry) => entry !== id) : [...layout, id];
}
