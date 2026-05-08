import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { Chore, ChoreCadence } from '../models';

// ============================================
// Chores Store
// Off-phone tasks/chores. One-time + daily/weekly/custom recurring.
// Date keys are device-local (`format(date, 'yyyy-MM-dd')`) — same pattern
// portfolioStore uses, so a chore checked off at 11:55pm rolls into the
// correct day from the user's perspective.
// ============================================

const generateChoreId = () =>
  `chore-${Math.random().toString(36).substring(2, 11)}`;

// 1=Mon..7=Sun, mirrored across the codebase. Convert from JS getDay()
// (0=Sun..6=Sat) by ((dow + 6) % 7) + 1.
function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function todayDayOfWeek(): number {
  const dow = new Date().getDay();
  return ((dow + 6) % 7) + 1;
}

export interface ChoreInput {
  label: string;
  notes?: string;
  cadence: ChoreCadence;
  daysOfWeek?: number[];
}

interface ChoresState {
  chores: Chore[];

  addChore: (input: ChoreInput) => Chore;
  updateChore: (id: string, input: Partial<ChoreInput>) => void;
  removeChore: (id: string) => void;
  toggleChoreForToday: (id: string) => void;
  // Returns the subset of chores that should appear on today's list:
  //   - 'once'  — included until completed=true.
  //   - 'daily' — always.
  //   - 'weekly' / 'custom' — included if today's day-of-week is in daysOfWeek.
  getChoresForToday: () => Chore[];
  isCompletedToday: (id: string) => boolean;
  reset: () => void;
}

export const useChoresStore = create<ChoresState>()(
  persist(
    (set, get) => ({
      chores: [],

      addChore: (input) => {
        const chore: Chore = {
          id: generateChoreId(),
          label: input.label,
          notes: input.notes,
          cadence: input.cadence,
          daysOfWeek:
            input.cadence === 'weekly' || input.cadence === 'custom'
              ? input.daysOfWeek
              : undefined,
          completed: input.cadence === 'once' ? false : undefined,
          completionsByDate: {},
          createdAt: Date.now(),
        };
        set((state) => ({ chores: [...state.chores, chore] }));
        return chore;
      },

      updateChore: (id, input) => {
        set((state) => ({
          chores: state.chores.map((c) => {
            if (c.id !== id) return c;
            const next: Chore = { ...c };
            if (input.label !== undefined) next.label = input.label;
            if (input.notes !== undefined) next.notes = input.notes;
            if (input.cadence !== undefined) {
              next.cadence = input.cadence;
              // Cadence change can invalidate fields. Normalize so a switch
              // from 'once' → 'daily' doesn't leave a stray completed flag,
              // and a switch to 'daily' clears days-of-week noise.
              if (input.cadence === 'once') {
                next.daysOfWeek = undefined;
                if (next.completed === undefined) next.completed = false;
              } else if (input.cadence === 'daily') {
                next.daysOfWeek = undefined;
                next.completed = undefined;
              } else {
                next.completed = undefined;
              }
            }
            if (input.daysOfWeek !== undefined) {
              next.daysOfWeek = input.daysOfWeek;
            }
            return next;
          }),
        }));
      },

      removeChore: (id) => {
        set((state) => ({ chores: state.chores.filter((c) => c.id !== id) }));
      },

      toggleChoreForToday: (id) => {
        const today = todayIso();
        set((state) => ({
          chores: state.chores.map((c) => {
            if (c.id !== id) return c;
            if (c.cadence === 'once') {
              return { ...c, completed: !c.completed };
            }
            const current = !!c.completionsByDate[today];
            return {
              ...c,
              completionsByDate: { ...c.completionsByDate, [today]: !current },
            };
          }),
        }));
      },

      getChoresForToday: () => {
        const dow = todayDayOfWeek();
        return get().chores.filter((c) => {
          if (c.cadence === 'once') return !c.completed;
          if (c.cadence === 'daily') return true;
          if (!c.daysOfWeek || c.daysOfWeek.length === 0) return true;
          return c.daysOfWeek.includes(dow);
        });
      },

      isCompletedToday: (id) => {
        const c = get().chores.find((x) => x.id === id);
        if (!c) return false;
        if (c.cadence === 'once') return !!c.completed;
        return !!c.completionsByDate[todayIso()];
      },

      reset: () => {
        set({ chores: [] });
      },
    }),
    {
      name: 'dopamenu-chores-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export default useChoresStore;
