import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAYOUT,
  HOME_WIDGETS,
  parseLayout,
  reorder,
  serializeLayout,
  toggle,
  widgetMeta,
} from '@/lib/domain/home-widgets';

/**
 * The home layout.
 *
 * Stored as JSON that outlives the code that wrote it, so most of what matters
 * here is what happens when the stored value is from a previous version of the
 * app — a widget that no longer exists, a duplicate, a value of the wrong shape
 * entirely. A home screen that refuses to render because a preference is a year
 * old is worse than one that returns to the default.
 */

describe('parseLayout', () => {
  it('treats an absent value as the default layout, not as an empty one', () => {
    // The distinction the column exists to keep: never-customised follows the
    // default as it changes; deliberately-empty stays empty.
    expect(parseLayout(null)).toEqual([...DEFAULT_LAYOUT]);
    expect(parseLayout(undefined)).toEqual([...DEFAULT_LAYOUT]);
    expect(parseLayout({ visible: [] })).toEqual([]);
  });

  it('keeps the stored order', () => {
    expect(parseLayout({ visible: ['tasks', 'quote', 'summary'] })).toEqual([
      'tasks',
      'quote',
      'summary',
    ]);
  });

  it('drops ids this version does not know about', () => {
    // A widget removed in a later release must not break the screen for people
    // who still have it in their saved layout.
    expect(parseLayout({ visible: ['tasks', 'weather-from-2027', 'quote'] })).toEqual([
      'tasks',
      'quote',
    ]);
  });

  it('collapses duplicates', () => {
    expect(parseLayout({ visible: ['tasks', 'tasks', 'quote'] })).toEqual(['tasks', 'quote']);
  });

  it('falls back when the shape is wrong entirely', () => {
    for (const rubbish of ['[]', 42, { visible: 'tasks' }, { widgets: ['tasks'] }, []]) {
      expect(parseLayout(rubbish)).toEqual([...DEFAULT_LAYOUT]);
    }
  });

  it('round-trips through the stored shape', () => {
    const layout = parseLayout({ visible: ['quote', 'tasks'] });
    expect(parseLayout(serializeLayout(layout))).toEqual(layout);
  });
});

describe('reorder', () => {
  it('swaps with the neighbour and refuses to fall off either end', () => {
    const layout = ['summary', 'tasks', 'quote'] as const;

    expect(reorder(layout, 'tasks', -1)).toEqual(['tasks', 'summary', 'quote']);
    expect(reorder(layout, 'tasks', 1)).toEqual(['summary', 'quote', 'tasks']);
    expect(reorder(layout, 'summary', -1)).toEqual([...layout]);
    expect(reorder(layout, 'quote', 1)).toEqual([...layout]);
  });

  it('does not mutate the layout it was given', () => {
    const layout = ['summary', 'tasks'] as const;
    reorder(layout, 'tasks', -1);
    expect(layout).toEqual(['summary', 'tasks']);
  });
});

describe('toggle', () => {
  it('removes a visible widget and appends a hidden one', () => {
    expect(toggle(['summary', 'tasks'], 'summary')).toEqual(['tasks']);
    // Appends rather than restoring an old position, because the old position
    // is not knowable from a list of visible ids.
    expect(toggle(['summary', 'tasks'], 'quote')).toEqual(['summary', 'tasks', 'quote']);
  });
});

describe('the registry', () => {
  it('describes every widget the default layout names', () => {
    for (const id of DEFAULT_LAYOUT) expect(() => widgetMeta(id)).not.toThrow();
  });

  it('gives every widget a label, a reason and an icon', () => {
    for (const widget of HOME_WIDGETS) {
      expect(widget.label).toBeTruthy();
      expect(widget.description).toBeTruthy();
      expect(widget.icon).toMatch(/^[A-Z]/);
    }

    expect(new Set(HOME_WIDGETS.map((w) => w.id)).size).toBe(HOME_WIDGETS.length);
  });

  it('leaves something out of the default, on purpose', () => {
    // A home screen that opens with every section teaches people to scroll past
    // it. If this ever equalises, the sheet has stopped having a job.
    expect(DEFAULT_LAYOUT.length).toBeLessThan(HOME_WIDGETS.length);
  });
});
