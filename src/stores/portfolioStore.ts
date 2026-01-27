import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import {
  DailyPortfolio,
  PortfolioCategory,
  DEFAULT_PORTFOLIO_CATEGORIES,
} from '../models';

// ============================================
// Portfolio Store
// Manages daily reflection and portfolio tracking
// ============================================

interface PortfolioState {
  portfolios: Record<string, DailyPortfolio>; // Keyed by date (YYYY-MM-DD)

  // Actions
  getTodayPortfolio: () => DailyPortfolio;
  getPortfolioForDate: (date: Date) => DailyPortfolio | null;
  toggleCategory: (categoryId: string) => void;
  setGoodDayRating: (rating: number) => void;
  setNotes: (notes: string) => void;
  getRecentPortfolios: (days: number) => DailyPortfolio[];
  getCompletionStats: () => {
    totalDays: number;
    completedCategories: number;
    averageRating: number;
  };
  reset: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

const createDefaultPortfolio = (date: string): DailyPortfolio => ({
  date,
  categories: DEFAULT_PORTFOLIO_CATEGORIES.map((cat) => ({
    ...cat,
    id: generateId(),
    completed: false,
    inferred: false,
  })),
  goodDayRating: undefined,
  notes: undefined,
});

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      portfolios: {},

      getTodayPortfolio: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        const existing = get().portfolios[today];

        if (existing) return existing;

        // Create new portfolio for today
        const newPortfolio = createDefaultPortfolio(today);
        set((state) => ({
          portfolios: {
            ...state.portfolios,
            [today]: newPortfolio,
          },
        }));

        return newPortfolio;
      },

      getPortfolioForDate: (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return get().portfolios[dateStr] || null;
      },

      toggleCategory: (categoryId) => {
        const today = format(new Date(), 'yyyy-MM-dd');

        set((state) => {
          const portfolio = state.portfolios[today] || createDefaultPortfolio(today);

          return {
            portfolios: {
              ...state.portfolios,
              [today]: {
                ...portfolio,
                categories: portfolio.categories.map((cat) =>
                  cat.id === categoryId
                    ? { ...cat, completed: !cat.completed }
                    : cat
                ),
              },
            },
          };
        });
      },

      setGoodDayRating: (rating) => {
        const today = format(new Date(), 'yyyy-MM-dd');

        set((state) => {
          const portfolio = state.portfolios[today] || createDefaultPortfolio(today);

          return {
            portfolios: {
              ...state.portfolios,
              [today]: {
                ...portfolio,
                goodDayRating: rating,
              },
            },
          };
        });
      },

      setNotes: (notes) => {
        const today = format(new Date(), 'yyyy-MM-dd');

        set((state) => {
          const portfolio = state.portfolios[today] || createDefaultPortfolio(today);

          return {
            portfolios: {
              ...state.portfolios,
              [today]: {
                ...portfolio,
                notes,
              },
            },
          };
        });
      },

      getRecentPortfolios: (days) => {
        const portfolios: DailyPortfolio[] = [];
        const today = new Date();

        for (let i = 0; i < days; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = format(date, 'yyyy-MM-dd');
          const portfolio = get().portfolios[dateStr];

          if (portfolio) {
            portfolios.push(portfolio);
          }
        }

        return portfolios;
      },

      getCompletionStats: () => {
        const portfolios = Object.values(get().portfolios);

        if (portfolios.length === 0) {
          return {
            totalDays: 0,
            completedCategories: 0,
            averageRating: 0,
          };
        }

        const completedCategories = portfolios.reduce(
          (sum, p) => sum + p.categories.filter((c) => c.completed).length,
          0
        );

        const ratingsWithValue = portfolios.filter(
          (p) => p.goodDayRating !== undefined
        );
        const averageRating =
          ratingsWithValue.length > 0
            ? ratingsWithValue.reduce((sum, p) => sum + (p.goodDayRating || 0), 0) /
              ratingsWithValue.length
            : 0;

        return {
          totalDays: portfolios.length,
          completedCategories,
          averageRating,
        };
      },

      reset: () => {
        set({ portfolios: {} });
      },
    }),
    {
      name: 'dopamenu-portfolio-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default usePortfolioStore;
