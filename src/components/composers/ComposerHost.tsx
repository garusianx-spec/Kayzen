'use client';

import { BookReflectionComposer } from './BookReflectionComposer';
import { CountdownComposer } from './CountdownComposer';
import { FinancialBoxComposer } from './FinancialBoxComposer';
import { HabitComposer } from './HabitComposer';
import { NoteComposer } from './NoteComposer';
import { TaskComposer } from './TaskComposer';
import { useUiStore } from '@/stores/ui-store';

/**
 * Renders whichever composer the FAB sheet selected.
 *
 * Mounted once at the shell level rather than per screen, so a composer opened
 * from the Today tab survives navigation and no screen has to know the six
 * forms exist.
 */
export function ComposerHost() {
  const activeComposer = useUiStore((state) => state.activeComposer);
  const closeComposer = useUiStore((state) => state.closeComposer);

  return (
    <>
      <TaskComposer open={activeComposer === 'task'} onClose={closeComposer} />
      <HabitComposer open={activeComposer === 'habit'} onClose={closeComposer} />
      <CountdownComposer open={activeComposer === 'countdown'} onClose={closeComposer} />
      <NoteComposer open={activeComposer === 'note'} onClose={closeComposer} />
      <FinancialBoxComposer open={activeComposer === 'financial-box'} onClose={closeComposer} />
      <BookReflectionComposer open={activeComposer === 'book-reflection'} onClose={closeComposer} />
    </>
  );
}
