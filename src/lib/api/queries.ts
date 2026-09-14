'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, isQueued, type QueuedResult } from './client';
import type {
  CountdownDto,
  FinancialBoxDto,
  FinancialTransactionDto,
  HabitDto,
  NoteDto,
  ReadingLogDto,
  SessionUserDto,
  TaskDto,
  TodaySnapshotDto,
} from '@/types/domain';

/**
 * Query keys and the hooks that use them.
 *
 * Every mutation here is optimistic and every optimistic mutation follows the
 * same three-step contract React Query expects: snapshot in `onMutate`, restore
 * in `onError`, reconcile in `onSettled`. Skipping the snapshot is what produces
 * the classic "the task un-ticks itself a second later" bug on a slow link.
 *
 * Mutations that the user must not lose — completing a task, logging a habit —
 * pass `queueWhenOffline`, so a write attempted with no connection lands in the
 * IndexedDB outbox and replays later. The optimistic cache update stays on
 * screen in the meantime, which is the entire point of an offline-first app.
 */

export const queryKeys = {
  session: ['session'] as const,
  today: ['today'] as const,
  tasks: (scope: string = 'all') => ['tasks', scope] as const,
  habits: ['habits'] as const,
  financeBoxes: ['finance', 'boxes'] as const,
  financeTransactions: (boxId?: string) => ['finance', 'transactions', boxId ?? 'all'] as const,
  countdowns: ['countdowns'] as const,
  notes: (search: string = '') => ['notes', search] as const,
  libraryToday: ['library', 'today'] as const,
} as const;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export function useSession(): UseQueryResult<SessionUserDto | null> {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => {
      const result = await api.get<{ user: SessionUserDto }>('/auth/session');
      return result.user;
    },
    // The session is the gate every screen waits on; a stale-while-revalidate
    // window of five minutes keeps navigation instant without going stale.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSignOut(): UseMutationResult<{ ok: true }, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export function useTodaySnapshot(): UseQueryResult<TodaySnapshotDto> {
  return useQuery({
    queryKey: queryKeys.today,
    queryFn: () => api.get<TodaySnapshotDto>('/today'),
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function useTasks(scope: 'today' | 'upcoming' | 'overdue' | 'all' = 'all') {
  return useQuery({
    queryKey: queryKeys.tasks(scope),
    queryFn: async () => {
      const result = await api.get<{ tasks: TaskDto[] }>(`/tasks?scope=${scope}`);
      return result.tasks;
    },
  });
}

export interface CreateTaskVariables {
  title: string;
  description?: string;
  dueAt?: string;
  priority?: number;
  difficulty?: string;
  tags?: string[];
  estimatedPomodoros?: number;
  recurrence?: string;
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: CreateTaskVariables) =>
      api.post<{ task: TaskDto } | QueuedResult>('/tasks', variables, {
        queueWhenOffline: { label: 'کار جدید', invalidate: ['today', 'tasks'] },
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Toggles completion, optimistically, across both the Today snapshot and lists. */
export function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      completed
        ? api.post<unknown>(`/tasks/${id}/complete`, undefined, {
            queueWhenOffline: { label: 'تکمیل کار', invalidate: ['today', 'tasks'] },
          })
        : api.delete<unknown>(`/tasks/${id}/complete`, undefined, {
            queueWhenOffline: { label: 'بازگردانی کار', invalidate: ['today', 'tasks'] },
          }),

    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.today });
      const previous = queryClient.getQueryData<TodaySnapshotDto>(queryKeys.today);

      queryClient.setQueryData<TodaySnapshotDto>(queryKeys.today, (snapshot) => {
        if (!snapshot) return snapshot;

        const tasks = snapshot.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                status: completed ? ('COMPLETED' as const) : ('PENDING' as const),
                completedAt: completed ? new Date().toISOString() : null,
              }
            : task,
        );

        return {
          ...snapshot,
          tasks,
          stats: {
            ...snapshot.stats,
            tasksCompleted: tasks.filter((task) => task.status === 'COMPLETED').length,
          },
        };
      });

      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.today, context.previous);
    },

    onSettled: (data) => {
      // A queued write has no server truth to reconcile against yet; refetching
      // now would overwrite the optimistic state with the pre-mutation row.
      if (isQueued(data)) return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/tasks/${id}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export function useHabits() {
  return useQuery({
    queryKey: queryKeys.habits,
    queryFn: async () => {
      const result = await api.get<{ habits: HabitDto[] }>('/habits');
      return result.habits;
    },
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Record<string, unknown>) =>
      api.post<{ habit: HabitDto } | QueuedResult>('/habits', variables, {
        queueWhenOffline: { label: 'عادت جدید', invalidate: ['habits', 'today'] },
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.habits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
}

/** Checks a habit off for today, or undoes it. */
export function useLogHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, undo }: { id: string; undo?: boolean }) =>
      undo
        ? api.delete<unknown>(`/habits/${id}/log`, undefined, {
            queueWhenOffline: { label: 'بازگردانی عادت', invalidate: ['habits', 'today'] },
          })
        : api.post<unknown>(
            `/habits/${id}/log`,
            { count: 1 },
            {
              queueWhenOffline: { label: 'ثبت عادت', invalidate: ['habits', 'today'] },
            },
          ),

    onMutate: async ({ id, undo }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.habits });
      await queryClient.cancelQueries({ queryKey: queryKeys.today });

      const previousHabits = queryClient.getQueryData<HabitDto[]>(queryKeys.habits);
      const previousToday = queryClient.getQueryData<TodaySnapshotDto>(queryKeys.today);

      const apply = (habit: HabitDto): HabitDto => {
        if (habit.id !== id) return habit;

        const todayCount = undo ? 0 : habit.todayCount + 1;
        const isCompletedToday = todayCount >= habit.targetPerDay;
        const crossed = !habit.isCompletedToday && isCompletedToday;
        const uncrossed = habit.isCompletedToday && !isCompletedToday;

        return {
          ...habit,
          todayCount,
          isCompletedToday,
          currentStreak: Math.max(0, habit.currentStreak + (crossed ? 1 : 0) - (uncrossed ? 1 : 0)),
        };
      };

      queryClient.setQueryData<HabitDto[]>(queryKeys.habits, (habits) => habits?.map(apply));
      queryClient.setQueryData<TodaySnapshotDto>(queryKeys.today, (snapshot) =>
        snapshot ? { ...snapshot, habits: snapshot.habits.map(apply) } : snapshot,
      );

      return { previousHabits, previousToday };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousHabits) {
        queryClient.setQueryData(queryKeys.habits, context.previousHabits);
      }
      if (context?.previousToday) {
        queryClient.setQueryData(queryKeys.today, context.previousToday);
      }
    },

    onSettled: (data) => {
      if (isQueued(data)) return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.habits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export function useFinancialBoxes() {
  return useQuery({
    queryKey: queryKeys.financeBoxes,
    queryFn: async () => {
      const result = await api.get<{ boxes: FinancialBoxDto[] }>('/finance/boxes');
      return result.boxes;
    },
  });
}

export function useCreateFinancialBox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Record<string, unknown>) =>
      api.post<{ box: FinancialBoxDto } | QueuedResult>('/finance/boxes', variables, {
        queueWhenOffline: { label: 'صندوق جدید', invalidate: ['finance'] },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.financeBoxes }),
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      boxId: string;
      amount: number | string;
      type: 'DEPOSIT' | 'WITHDRAWAL';
      note?: string;
    }) =>
      api.post<{ transaction: FinancialTransactionDto; box: FinancialBoxDto } | QueuedResult>(
        '/finance/transactions',
        variables,
        { queueWhenOffline: { label: 'تراکنش', invalidate: ['finance'] } },
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Countdowns, notes, library
// ---------------------------------------------------------------------------

export function useCountdowns() {
  return useQuery({
    queryKey: queryKeys.countdowns,
    queryFn: async () => {
      const result = await api.get<{ countdowns: CountdownDto[] }>('/countdowns');
      return result.countdowns;
    },
  });
}

export function useCreateCountdown() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Record<string, unknown>) =>
      api.post<{ countdown: CountdownDto } | QueuedResult>('/countdowns', variables, {
        queueWhenOffline: { label: 'شمارش معکوس', invalidate: ['countdowns', 'today'] },
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.countdowns });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
}

export function useNotes(search = '') {
  return useQuery({
    queryKey: queryKeys.notes(search),
    queryFn: async () => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const result = await api.get<{ notes: NoteDto[] }>(`/notes${query}`);
      return result.notes;
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Record<string, unknown>) =>
      api.post<{ note: NoteDto } | QueuedResult>('/notes', variables, {
        queueWhenOffline: { label: 'یادداشت', invalidate: ['notes'] },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useSaveReadingLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dayNumber,
      ...variables
    }: {
      dayNumber: number;
      reflection?: string;
      rating?: number;
      markRead?: boolean;
      highlights?: string[];
    }) =>
      api.put<{ readingLog: ReadingLogDto } | QueuedResult>(
        `/library/${dayNumber}/log`,
        variables,
        { queueWhenOffline: { label: 'یادداشت کتاب', invalidate: ['library', 'today'] } },
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
}

export function useRecordPomodoro() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      taskId?: string;
      mode: 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
      durationSeconds: number;
      startedAt: string;
      completed: boolean;
      ambientTrack?: string;
    }) =>
      api.post<unknown>('/pomodoro', variables, {
        queueWhenOffline: { label: 'جلسهٔ تمرکز', invalidate: ['today'] },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.today }),
  });
}
