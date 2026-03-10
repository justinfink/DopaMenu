import { InstalledApp, UserAppConfig, CatalogApp, AppCategory, AppDesignation } from '../models';
import { APP_CATALOG, searchCatalog, getCommonTimewasters } from '../constants/appCatalog';

// ============================================
// App Catalog Service
// Provides searchable access to the curated
// app catalog and helps match installed apps
// to catalog entries.
// ============================================

const generateId = () => Math.random().toString(36).substring(2, 11);

class AppCatalogService {
  // Search the catalog by name or category
  search(query: string): CatalogApp[] {
    return searchCatalog(query);
  }

  // Get all common timewaster apps
  getTimewasters(): CatalogApp[] {
    return getCommonTimewasters();
  }

  // Get apps by category
  getByCategory(category: AppCategory): CatalogApp[] {
    return APP_CATALOG.filter(app => app.category === category);
  }

  // Get all categories
  getCategories(): AppCategory[] {
    const categories = new Set(APP_CATALOG.map(app => app.category));
    return Array.from(categories).sort() as AppCategory[];
  }

  // Get full catalog
  getAll(): CatalogApp[] {
    return [...APP_CATALOG];
  }

  // Match an installed app (by package name) to a catalog entry
  matchToCatalog(packageName: string): CatalogApp | null {
    return APP_CATALOG.find(app => app.packageName === packageName) || null;
  }

  // Create an InstalledApp from a catalog entry
  catalogToInstalledApp(catalogApp: CatalogApp): InstalledApp {
    return {
      id: generateId(),
      packageName: catalogApp.packageName,
      displayName: catalogApp.name,
      icon: catalogApp.icon,
      category: catalogApp.category,
      source: 'curated_catalog',
    };
  }

  // Create default UserAppConfig from a catalog entry
  createDefaultConfig(appId: string, catalogApp: CatalogApp): UserAppConfig {
    return {
      appId,
      priority: catalogApp.isCommonTimewaster ? 'none' : 'medium',
      identityGoals: [],
      designation: catalogApp.defaultDesignation,
      redirectBehavior: catalogApp.isCommonTimewaster ? 'full_overlay' : 'none',
      dailyTimeLimitMinutes: undefined,
      notes: undefined,
    };
  }

  // Match a list of installed app package names to catalog entries
  matchInstalledApps(packageNames: string[]): { matched: CatalogApp[]; unmatched: string[] } {
    const matched: CatalogApp[] = [];
    const unmatched: string[] = [];

    for (const pkg of packageNames) {
      const catalogApp = this.matchToCatalog(pkg);
      if (catalogApp) {
        matched.push(catalogApp);
      } else {
        unmatched.push(pkg);
      }
    }

    return { matched, unmatched };
  }

  // Get suggested identity tags for a given app category
  getSuggestedIdentityTags(category: AppCategory): string[] {
    const apps = this.getByCategory(category);
    const tags = new Set<string>();
    apps.forEach(app => app.suggestedIdentityTags.forEach(tag => tags.add(tag)));
    return Array.from(tags);
  }

  // Get category display name
  getCategoryDisplayName(category: AppCategory): string {
    const names: Record<AppCategory, string> = {
      social_media: 'Social Media',
      entertainment: 'Entertainment',
      productivity: 'Productivity',
      communication: 'Communication',
      news: 'News',
      games: 'Games',
      fitness: 'Fitness',
      education: 'Education',
      finance: 'Finance',
      health: 'Health & Wellness',
      utilities: 'Utilities',
      shopping: 'Shopping',
      travel: 'Travel',
      food: 'Food & Delivery',
      music: 'Music & Audio',
      photo_video: 'Photo & Video',
      other: 'Other',
    };
    return names[category] || category;
  }
}

export const appCatalogService = new AppCatalogService();
export default appCatalogService;
