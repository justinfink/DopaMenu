import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ============================================
// Storage Service
// Wrapper for AsyncStorage and SecureStore
// ============================================

const STORAGE_KEYS = {
  USER: 'dopamenu-user',
  INTERVENTIONS: 'dopamenu-interventions',
  PORTFOLIO: 'dopamenu-portfolio',
  SETTINGS: 'dopamenu-settings',
} as const;

// Standard storage (non-sensitive data)
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Storage get error:', error);
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  },

  async remove(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  },

  async clear(): Promise<boolean> {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  },
};

// Secure storage (sensitive data - not used in MVP but available)
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Secure storage get error:', error);
      return null;
    }
  },

  async set(key: string, value: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(key, value);
      return true;
    } catch (error) {
      console.error('Secure storage set error:', error);
      return false;
    }
  },

  async remove(key: string): Promise<boolean> {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (error) {
      console.error('Secure storage remove error:', error);
      return false;
    }
  },
};

export { STORAGE_KEYS };
export default storage;
