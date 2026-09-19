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
  GoogleLinkDto,
  HabitDto,
  NoteDto,
  ReadingLogDto,
  ReadingPlanDto,
  ReadingRhythmDto,
  SessionUserDto,
  LanguageCourseDto,
  NotificationDto,
  NotificationPreferenceDto,
  TaskCategoryDto,
  VocabularyVaultGroup,
  TaskDto,
  TodaySnapshotDto,
  UserBookDto,
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
  taskCategories: ['tasks', 'categories'] as const,
  vocabulary: ['vocabulary'] as const,
  notifications: (filter: string) => ['notifications', filter] as const,
  notificationPreferences: ['notifications', 'preferences'] as const,
  vocabularyVault: (filters: string) => ['vocabulary', 'vault', filters] as const,
  habits: ['habits'] as const,
  financeBoxes: ['finance', 'boxes'] as const,
  financeTransactions: (boxId?: string) => ['finance', 'transactions', boxId ?? 'all'] as const,
  countdowns: ['countdowns'] as const,
  notes: (search: string = '') => ['notes', search] as const,
  libraryToday: ['library', 'today'] as const,
  readingHub: ['library', 'hub'] as const,
  googleLink: ['integrations', 'google'] as const,
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
  categoryId?: string | null;
  /** Toman, whole units. `null` clears an existing value on an edit. */
  costAmount?: number | null;
  location?: string | null;
  remindAt?: string | null;
  checklist?: Array<{ id?: string; title: string; completed: boolean }>;
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
/**
 * The user's task labels.
 *
 * Long `staleTime`: a person edits these a handful of times a year, and the
 * composer opens often enough that refetching the list on every open would be
 * a request per tap for data that has not moved.
 */
export function useTaskCategories() {
  return useQuery({
    queryKey: queryKeys.taskCategories,
    queryFn: async () => {
      const result = await api.get<{ categories: TaskCategoryDto[] }>('/tasks/categories');
      return result.categories;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateTaskCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { title: string; colorToken?: string }) =>
      api.post<{ category: TaskCategoryDto }>('/tasks/categories', variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskCategories });
    },
  });
}

/**
 * Edits an existing task.
 *
 * Distinct from `useToggleTask`, which is the optimistic single-field path the
 * list uses; this one is the composer saving a whole form and is happy to wait
 * for the server, because the form is still on screen to show an error.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<CreateTaskVariables>) =>
      api.patch<{ task: TaskDto } | QueuedResult>(`/tasks/${id}`, patch, {
        queueWhenOffline: { label: 'ویرایش کار', invalidate: ['today', 'tasks'] },
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/** Today's words, per active language. */
export function useVocabulary() {
  return useQuery({
    queryKey: queryKeys.vocabulary,
    queryFn: async () => {
      const result = await api.get<{ courses: LanguageCourseDto[] }>('/vocabulary');
      return result.courses;
    },
  });
}

export function useVocabularyVault(filters: {
  language?: string;
  search?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  if (filters.language) query.set('language', filters.language);
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  const key = query.toString();

  return useQuery({
    queryKey: queryKeys.vocabularyVault(key),
    queryFn: async () => {
      const result = await api.get<{ groups: VocabularyVaultGroup[]; total: number }>(
        `/vocabulary/vault${key ? `?${key}` : ''}`,
      );
      return result;
    },
  });
}

export function useReviewWord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { wordId: string; correct: boolean }) =>
      api.post<{ status: string; correctRuns: number; remaining: number; justMastered: boolean }>(
        '/vocabulary/review',
        variables,
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vocabulary });
      void queryClient.invalidateQueries({ queryKey: ['vocabulary', 'vault'] });
    },
  });
}

export function useAddLanguageCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { language: string; level: string }) =>
      api.post<{ id: string }>('/vocabulary/courses', variables),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vocabulary });
    },
  });
}

export function useUpdateLanguageCourse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; level?: string; archived?: boolean }) =>
      api.patch<{ id: string }>(`/vocabulary/courses/${id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vocabulary });
    },
  });
}

export function useNotifications(filter: 'all' | 'unread' = 'all') {
  return useQuery({
    queryKey: queryKeys.notifications(filter),
    queryFn: async () => {
      const result = await api.get<{ notifications: NotificationDto[]; unread: number }>(
        `/notifications?filter=${filter}`,
      );
      return result;
    },
    // The bell badge is on screen constantly; a short window keeps it honest
    // without turning the header into a poller.
    staleTime: 60 * 1000,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: async () => {
      const result = await api.get<{ preferences: NotificationPreferenceDto[] }>(
        '/notifications/preferences',
      );
      return result.preferences;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetNotificationPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { category: string; enabled: boolean }) =>
      api.patch<{ category: string; enabled: boolean }>('/notifications/preferences', variables),
    // Optimistic: a switch that waits for a round trip before moving feels
    // broken, and the cost of being wrong here is one flipped toggle.
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationPreferences });
      const previous = queryClient.getQueryData<NotificationPreferenceDto[]>(
        queryKeys.notificationPreferences,
      );

      queryClient.setQueryData<NotificationPreferenceDto[]>(
        queryKeys.notificationPreferences,
        (current) =>
          current?.map((preference) =>
            preference.category === variables.category
              ? { ...preference, enabled: variables.enabled }
              : preference,
          ),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notificationPreferences, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences });
    },
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids?: string[]) =>
      api.post<{ marked: number; unread: number }>('/notifications/read', ids ? { ids } : {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Account preferences, written through the session cache.
 *
 * Optimistic: theme, haptics and the home layout all take effect locally the
 * moment they are chosen, and a setting that waits for a round trip before it
 * moves feels broken on a slow connection. If the write fails the cache is put
 * back and the next refetch settles it.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Record<string, unknown>) =>
      api.patch<{ user: SessionUserDto }>('/preferences', variables),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.session });
      const previous = queryClient.getQueryData<SessionUserDto>(queryKeys.session);

      queryClient.setQueryData<SessionUserDto>(queryKeys.session, (current) =>
        current ? { ...current, ...variables } : current,
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.session, context.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.session, result.user);
    },
  });
}

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

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...variables }: { id: string } & Record<string, unknown>) =>
      api.patch<{ note: NoteDto } | QueuedResult>(`/notes/${id}`, variables, {
        queueWhenOffline: { label: 'ویرایش یادداشت', invalidate: ['notes'] },
      }),

    onMutate: async ({ id, ...variables }) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const snapshots = queryClient.getQueriesData<NoteDto[]>({ queryKey: ['notes'] });

      // Pinning is the common case and has to feel instant: the row jumps to the
      // top before the request leaves the device.
      for (const [key] of snapshots) {
        queryClient.setQueryData<NoteDto[]>(key, (notes) =>
          notes
            ?.map((note) => (note.id === id ? { ...note, ...variables } : note))
            .sort((left, right) => Number(right.isPinned) - Number(left.isPinned)),
        );
      }

      return { snapshots };
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },

    onSettled: (data) => {
      if (isQueued(data)) return;
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/notes/${id}`),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const snapshots = queryClient.getQueriesData<NoteDto[]>({ queryKey: ['notes'] });

      for (const [key] of snapshots) {
        queryClient.setQueryData<NoteDto[]>(key, (notes) =>
          notes?.filter((note) => note.id !== id),
        );
      }

      return { snapshots };
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}

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

export function useDeleteCountdown() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/countdowns/${id}`),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.countdowns });
      const previous = queryClient.getQueryData<CountdownDto[]>(queryKeys.countdowns);

      queryClient.setQueryData<CountdownDto[]>(queryKeys.countdowns, (events) =>
        events?.filter((event) => event.id !== id),
      );

      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.countdowns, context.previous);
    },

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

/**
 * The Reading Hub's one query.
 *
 * Plan, rhythm and shelf arrive together because they are drawn together;
 * every mutation below writes its fresh copy straight into this cache rather
 * than invalidating, so the ring moves on the same frame as the button that
 * moved it.
 */
export function useReadingHub(): UseQueryResult<ReadingHubSnapshot> {
  return useQuery({
    queryKey: queryKeys.readingHub,
    queryFn: () => api.get<ReadingHubSnapshot>('/library/hub'),
    staleTime: 60 * 1000,
  });
}

export interface ReadingHubSnapshot {
  plan: ReadingPlanDto;
  rhythm: ReadingRhythmDto;
  books: UserBookDto[];
}

/**
 * Switching mode or duration, optimistically.
 *
 * Both are one-tap segmented controls, and a segmented control that waits for
 * a round trip before moving reads as broken rather than as slow. The cost of
 * being wrong is one chip in the wrong place until the next refetch.
 */
export function useUpdateReadingPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Partial<ReadingPlanDto>) =>
      api.patch<{ plan: ReadingPlanDto }>('/library/plan', variables),

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.readingHub });
      const previous = queryClient.getQueryData<ReadingHubSnapshot>(queryKeys.readingHub);

      if (previous) {
        queryClient.setQueryData<ReadingHubSnapshot>(queryKeys.readingHub, {
          ...previous,
          plan: { ...previous.plan, ...variables },
        });
      }

      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.readingHub, context.previous);
      }
    },

    // The goal ring and every `metGoal` flag are computed against the
    // duration, so changing it invalidates more than the chip that changed.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.readingHub }),
  });
}

export function useAddBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      title: string;
      author?: string;
      totalPages: number;
      currentPage?: number;
      colorToken?: string;
    }) => api.post<{ book: UserBookDto }>('/library/books', variables),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.readingHub }),
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: { id: string } & Partial<UserBookDto> & { finished?: boolean }) =>
      api.patch<{ book: UserBookDto }>(`/library/books/${id}`, patch),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.readingHub }),
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/library/books/${id}`),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.readingHub });
      const previous = queryClient.getQueryData<ReadingHubSnapshot>(queryKeys.readingHub);

      if (previous) {
        queryClient.setQueryData<ReadingHubSnapshot>(queryKeys.readingHub, {
          ...previous,
          books: previous.books.filter((book) => book.id !== id),
        });
      }

      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.readingHub, context.previous);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.readingHub }),
  });
}

/**
 * Logging a sitting.
 *
 * The response already carries the recomputed rhythm and the advanced book, so
 * it is written straight into the cache — no refetch, and the ring, the streak
 * and the page count all move together.
 */
export function useLogReadingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { minutes: number; bookId?: string; toPage?: number }) =>
      api.post<{ rhythm: ReadingRhythmDto; book: UserBookDto | null }>(
        '/library/sessions',
        variables,
      ),

    onSuccess: (result) => {
      const previous = queryClient.getQueryData<ReadingHubSnapshot>(queryKeys.readingHub);
      if (!previous) return;

      queryClient.setQueryData<ReadingHubSnapshot>(queryKeys.readingHub, {
        ...previous,
        rhythm: result.rhythm,
        books: result.book
          ? previous.books.map((book) => (book.id === result.book?.id ? result.book : book))
          : previous.books,
      });
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
}

/**
 * The Google link's status.
 *
 * Polled while there is work outstanding and left alone when there is not: the
 * queue drains itself after every mutation, so the only reason to ask again is
 * to watch a backlog shrink. A fixed interval would be a request a minute,
 * forever, to learn nothing.
 */
export function useGoogleLink(): UseQueryResult<GoogleLinkDto> {
  return useQuery({
    queryKey: queryKeys.googleLink,
    queryFn: async () => {
      const result = await api.get<{ link: GoogleLinkDto }>('/integrations/google');
      return result.link;
    },
    staleTime: 30 * 1000,
    refetchInterval: (query) => ((query.state.data?.pending ?? 0) > 0 ? 5_000 : false),
  });
}

export function useForceGoogleSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ link: GoogleLinkDto }>('/integrations/google/sync', {}),
    onSuccess: (result) => queryClient.setQueryData(queryKeys.googleLink, result.link),
  });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete<{ link: GoogleLinkDto }>('/integrations/google'),
    onSuccess: (result) => queryClient.setQueryData(queryKeys.googleLink, result.link),
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
