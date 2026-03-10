// Expo Config Plugin for Android App Usage Detection
// This plugin adds UsageStatsManager support to detect app launches

const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Add PACKAGE_USAGE_STATS permission and service to AndroidManifest.xml
function withAppUsageManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Add uses-permission for PACKAGE_USAGE_STATS
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const hasPermission = manifest['uses-permission'].some(
      (perm) => perm.$['android:name'] === 'android.permission.PACKAGE_USAGE_STATS'
    );

    if (!hasPermission) {
      manifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.PACKAGE_USAGE_STATS',
          'tools:ignore': 'ProtectedPermissions',
        },
      });
    }

    // Add FOREGROUND_SERVICE permission
    const hasForegroundPerm = manifest['uses-permission'].some(
      (perm) => perm.$['android:name'] === 'android.permission.FOREGROUND_SERVICE'
    );

    if (!hasForegroundPerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE' },
      });
    }

    // Note: SYSTEM_ALERT_WINDOW is NOT needed — redirect works by bringing
    // DopaMenu's own Activity to the foreground, not by drawing a system overlay.

    // Add QUERY_ALL_PACKAGES permission (for listing installed apps)
    const hasQueryPerm = manifest['uses-permission'].some(
      (perm) => perm.$['android:name'] === 'android.permission.QUERY_ALL_PACKAGES'
    );

    if (!hasQueryPerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.QUERY_ALL_PACKAGES' },
      });
    }

    // Add foreground service type permission (Android 14+)
    const hasForegroundTypePerm = manifest['uses-permission'].some(
      (perm) => perm.$['android:name'] === 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE'
    );

    if (!hasForegroundTypePerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE' },
      });
    }

    // Add the monitoring service (UsageStatsManager fallback)
    const application = manifest.application[0];
    if (!application.service) {
      application.service = [];
    }

    const hasService = application.service.some(
      (svc) => svc.$['android:name'] === '.AppUsageMonitorService'
    );

    if (!hasService) {
      application.service.push({
        $: {
          'android:name': '.AppUsageMonitorService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        'property': [{
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': 'App usage monitoring for digital wellbeing',
          },
        }],
      });
    }

    // Add the AccessibilityService (PRIMARY detection mechanism)
    const hasAccessibilityService = application.service.some(
      (svc) => svc.$['android:name'] === '.DopaMenuAccessibilityService'
    );

    if (!hasAccessibilityService) {
      application.service.push({
        $: {
          'android:name': '.DopaMenuAccessibilityService',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:label': 'DopaMenu App Detection',
          'android:exported': 'false',
        },
        'intent-filter': [{
          action: [{
            $: { 'android:name': 'android.accessibilityservice.AccessibilityService' },
          }],
        }],
        'meta-data': [{
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/accessibility_service_config',
          },
        }],
      });
    }

    // Add tools namespace if not present
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
}

// Add native module files
function withAppUsageNativeCode(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.dopamenu.app';
      const packagePath = packageName.replace(/\./g, '/');

      // Path to android/app/src/main/java/[package]/
      const javaDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath
      );

      // Create directory if it doesn't exist
      if (!fs.existsSync(javaDir)) {
        fs.mkdirSync(javaDir, { recursive: true });
      }

      // Write the native module
      const moduleCode = getModuleCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'DopaMenuAppUsageModule.kt'), moduleCode);

      // Write the package
      const packageCode = getPackageCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'DopaMenuAppUsagePackage.kt'), packageCode);

      // Write the service (UsageStatsManager fallback)
      const serviceCode = getServiceCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'AppUsageMonitorService.kt'), serviceCode);

      // Write the AccessibilityService (PRIMARY detection)
      const accessibilityServiceCode = getAccessibilityServiceCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'DopaMenuAccessibilityService.kt'), accessibilityServiceCode);

      // Write accessibility service XML config
      const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }
      fs.writeFileSync(path.join(xmlDir, 'accessibility_service_config.xml'), getAccessibilityServiceXml());

      // Write/update strings.xml with accessibility service description
      const valuesDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'values');
      if (!fs.existsSync(valuesDir)) {
        fs.mkdirSync(valuesDir, { recursive: true });
      }
      const stringsPath = path.join(valuesDir, 'dopamenu_strings.xml');
      fs.writeFileSync(stringsPath, getAccessibilityStringsXml());

      return config;
    },
  ]);
}

function getModuleCode(packageName) {
  return `package ${packageName}

import android.app.AppOpsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.content.ComponentName
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.text.TextUtils
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream

class DopaMenuAppUsageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DopaMenuAppUsage"
        private var monitoringPackages: List<String> = emptyList()
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun checkPermission(promise: Promise) {
        try {
            val granted = hasUsageStatsPermission()
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getRecentApps(minutes: Int, promise: Promise) {
        try {
            if (!hasUsageStatsPermission()) {
                promise.resolve(Arguments.createArray())
                return
            }

            val usageStatsManager = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val endTime = System.currentTimeMillis()
            val startTime = endTime - (minutes * 60 * 1000)

            val stats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_BEST,
                startTime,
                endTime
            )

            val recentApps = Arguments.createArray()
            stats?.filter { it.lastTimeUsed > startTime }
                ?.sortedByDescending { it.lastTimeUsed }
                ?.forEach { stat ->
                    recentApps.pushString(stat.packageName)
                }

            promise.resolve(recentApps)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun startMonitoring(packageNames: ReadableArray, promise: Promise) {
        try {
            monitoringPackages = (0 until packageNames.size()).map { packageNames.getString(it) ?: "" }

            val intent = Intent(reactApplicationContext, AppUsageMonitorService::class.java)
            intent.putStringArrayListExtra("packages", ArrayList(monitoringPackages))

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, AppUsageMonitorService::class.java)
            reactApplicationContext.stopService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    private fun hasUsageStatsPermission(): Boolean {
        val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactApplicationContext.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactApplicationContext.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    @ReactMethod
    fun hasUsagePermission(promise: Promise) {
        promise.resolve(hasUsageStatsPermission())
    }

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val result = Arguments.createArray()

            for (app in apps) {
                // Skip system apps without a launcher icon
                val launchIntent = pm.getLaunchIntentForPackage(app.packageName)
                if (launchIntent == null && (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0) {
                    continue
                }

                val appInfo = Arguments.createMap()
                appInfo.putString("packageName", app.packageName)
                appInfo.putString("name", pm.getApplicationLabel(app).toString())

                // Get category if available (API 26+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    appInfo.putInt("category", app.category)
                }

                result.pushMap(appInfo)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        try {
            val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(reactApplicationContext)
            } else {
                true
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + reactApplicationContext.packageName)
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun bringToForeground(promise: Promise) {
        try {
            val intent = reactApplicationContext.packageManager
                .getLaunchIntentForPackage(reactApplicationContext.packageName)
            intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun openUsageAccessSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getAppUsageStats(days: Int, promise: Promise) {
        try {
            if (!hasUsageStatsPermission()) {
                promise.resolve(Arguments.createArray())
                return
            }

            val usageStatsManager = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val endTime = System.currentTimeMillis()
            val startTime = endTime - (days.toLong() * 24 * 60 * 60 * 1000)

            val stats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                startTime,
                endTime
            )

            val result = Arguments.createArray()
            stats?.filter { it.totalTimeInForeground > 0 }
                ?.sortedByDescending { it.totalTimeInForeground }
                ?.forEach { stat ->
                    val item = Arguments.createMap()
                    item.putString("packageName", stat.packageName)
                    item.putDouble("totalTimeMs", stat.totalTimeInForeground.toDouble())
                    item.putDouble("lastUsed", stat.lastTimeUsed.toDouble())
                    result.pushMap(item)
                }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    fun emitAppLaunched(packageName: String, label: String) {
        val params = Arguments.createMap().apply {
            putString("packageName", packageName)
            putString("label", label)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onAppLaunched", params)
    }

    @ReactMethod
    fun getPendingRedirect(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                AppUsageMonitorService.PREFS_NAME, Context.MODE_PRIVATE
            )
            val pendingApp = prefs.getString(AppUsageMonitorService.KEY_PENDING_APP, null)
            val pendingTimestamp = prefs.getLong(AppUsageMonitorService.KEY_PENDING_TIMESTAMP, 0)

            if (pendingApp != null && pendingTimestamp > 0) {
                // Only return if it's recent (within last 30 seconds)
                val age = System.currentTimeMillis() - pendingTimestamp
                if (age < 30000) {
                    val result = Arguments.createMap().apply {
                        putString("packageName", pendingApp)
                        putDouble("timestamp", pendingTimestamp.toDouble())
                    }
                    promise.resolve(result)
                    return
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun clearPendingRedirect(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                AppUsageMonitorService.PREFS_NAME, Context.MODE_PRIVATE
            )
            prefs.edit().clear().apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        try {
            val componentName = ComponentName(
                reactApplicationContext,
                DopaMenuAccessibilityService::class.java
            )
            val enabledServices = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""

            val splitter = TextUtils.SimpleStringSplitter(':')
            splitter.setString(enabledServices)
            while (splitter.hasNext()) {
                val enabled = ComponentName.unflattenFromString(splitter.next())
                if (enabled == componentName) {
                    promise.resolve(true)
                    return
                }
            }
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateTrackedApps(packageNames: ReadableArray, promise: Promise) {
        try {
            val apps = (0 until packageNames.size()).map { packageNames.getString(it) ?: "" }
            val prefs = reactApplicationContext.getSharedPreferences(
                DopaMenuAccessibilityService.TRACKED_APPS_PREFS,
                Context.MODE_PRIVATE
            )
            prefs.edit()
                .putStringSet(DopaMenuAccessibilityService.KEY_TRACKED_APPS, apps.toSet())
                .apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun checkPermissionsStatus(promise: Promise) {
        try {
            val result = Arguments.createMap()
            result.putBoolean("usageAccess", hasUsageStatsPermission())
            result.putBoolean("overlay", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(reactApplicationContext)
            } else {
                true
            })

            // Check accessibility service status
            val componentName = ComponentName(
                reactApplicationContext,
                DopaMenuAccessibilityService::class.java
            )
            val enabledServices = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            var accessibilityEnabled = false
            val splitter = TextUtils.SimpleStringSplitter(':')
            splitter.setString(enabledServices)
            while (splitter.hasNext()) {
                val enabled = ComponentName.unflattenFromString(splitter.next())
                if (enabled == componentName) {
                    accessibilityEnabled = true
                    break
                }
            }
            result.putBoolean("accessibilityService", accessibilityEnabled)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
`;
}

function getAccessibilityServiceCode(packageName) {
  return `package ${packageName}

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.view.accessibility.AccessibilityEvent

class DopaMenuAccessibilityService : AccessibilityService() {

    companion object {
        const val TRACKED_APPS_PREFS = "dopamenu_tracked_apps"
        const val KEY_TRACKED_APPS = "tracked_package_names"
        private const val REDIRECT_PREFS = "dopamenu_redirect"
        private const val KEY_PENDING_APP = "pending_redirect_app"
        private const val KEY_PENDING_TIMESTAMP = "pending_redirect_timestamp"
        private const val DETECTION_COOLDOWN = 30000L // 30 second cooldown

        // Common system packages to ignore
        private val IGNORED_PACKAGES = setOf(
            "com.android.systemui",
            "com.android.launcher",
            "com.android.launcher3",
            "com.google.android.apps.nexuslauncher",
            "com.google.android.packageinstaller",
            "com.android.settings",
            "com.android.vending",
            "com.sec.android.app.launcher",
            "com.miui.home",
            "com.huawei.android.launcher",
            "com.oppo.launcher",
            "com.oneplus.launcher",
        )
    }

    private var lastDetectedApp: String? = null
    private var lastDetectionTime: Long = 0L
    private var trackedAppsCache: Set<String> = emptySet()
    private var cacheTimestamp: Long = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val eventPackage = event.packageName?.toString() ?: return

        // Quick-reject: ignore our own app and common system packages
        if (eventPackage == applicationContext.packageName) return
        if (IGNORED_PACKAGES.contains(eventPackage)) return

        // Load tracked apps (cached, refreshed every 5 seconds)
        val trackedApps = getTrackedApps()
        if (trackedApps.isEmpty()) return
        if (!trackedApps.contains(eventPackage)) return

        // Cooldown: don't re-trigger for the same app within 30s
        val now = System.currentTimeMillis()
        if (eventPackage == lastDetectedApp && now - lastDetectionTime < DETECTION_COOLDOWN) return

        lastDetectedApp = eventPackage
        lastDetectionTime = now

        // Store pending redirect in SharedPreferences (same as AppUsageMonitorService)
        storePendingRedirect(eventPackage)

        // Bring DopaMenu to the foreground
        bringAppToForeground(eventPackage)
    }

    override fun onInterrupt() {
        // Required override - nothing to clean up
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        // Pre-load tracked apps on service start
        trackedAppsCache = loadTrackedAppsFromPrefs()
        cacheTimestamp = System.currentTimeMillis()
    }

    private fun getTrackedApps(): Set<String> {
        val now = System.currentTimeMillis()
        // Refresh cache every 5 seconds to pick up changes from JS layer
        if (now - cacheTimestamp > 5000) {
            trackedAppsCache = loadTrackedAppsFromPrefs()
            cacheTimestamp = now
        }
        return trackedAppsCache
    }

    private fun loadTrackedAppsFromPrefs(): Set<String> {
        val prefs = applicationContext.getSharedPreferences(TRACKED_APPS_PREFS, Context.MODE_PRIVATE)
        return prefs.getStringSet(KEY_TRACKED_APPS, emptySet()) ?: emptySet()
    }

    private fun storePendingRedirect(packageName: String) {
        val prefs = applicationContext.getSharedPreferences(REDIRECT_PREFS, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_PENDING_APP, packageName)
            putLong(KEY_PENDING_TIMESTAMP, System.currentTimeMillis())
            apply()
        }
    }

    private fun bringAppToForeground(sourcePackage: String) {
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(applicationContext.packageName)
            launchIntent?.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
            launchIntent?.putExtra("redirect_source_app", sourcePackage)
            launchIntent?.putExtra("redirect_triggered", true)
            startActivity(launchIntent)
        } catch (e: Exception) {
            // If we can't bring the app to foreground, the pending redirect
            // will be picked up when the user returns to DopaMenu
        }
    }
}
`;
}

function getAccessibilityServiceXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="100"
    android:canRetrieveWindowContent="false"
    android:description="@string/accessibility_service_description" />
`;
}

function getAccessibilityStringsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="accessibility_service_description">DopaMenu uses this service to detect when you open apps you want to use mindfully. When you open a tracked app, DopaMenu shows a brief pause screen with healthier alternatives. No personal data is collected — all processing happens on your device.</string>
</resources>
`;
}

function getPackageCode(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DopaMenuAppUsagePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(DopaMenuAppUsageModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
}

function getServiceCode(packageName) {
  return `package ${packageName}

import android.app.*
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class AppUsageMonitorService : Service() {

    private var handler: Handler? = null
    private var runnable: Runnable? = null
    private var monitoringPackages: List<String> = emptyList()
    private var lastForegroundApp: String? = null
    private var lastDetectionTime: Long = 0L
    private var prefs: SharedPreferences? = null

    companion object {
        private const val CHANNEL_ID = "app_monitoring"
        private const val NOTIFICATION_ID = 1001
        private const val CHECK_INTERVAL = 1000L // Check every 1 second for faster detection
        private const val DETECTION_COOLDOWN = 30000L // 30 second cooldown between detections of same app
        const val PREFS_NAME = "dopamenu_redirect"
        const val KEY_PENDING_APP = "pending_redirect_app"
        const val KEY_PENDING_TIMESTAMP = "pending_redirect_timestamp"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        handler = Handler(Looper.getMainLooper())
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringArrayListExtra("packages")?.let {
            monitoringPackages = it
        }

        startForeground(NOTIFICATION_ID, createNotification())
        startMonitoring()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopMonitoring()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "App Usage Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors app usage for DopaMenu interventions"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DopaMenu Active")
            .setContentText("Monitoring for mindful moments")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun startMonitoring() {
        runnable = object : Runnable {
            override fun run() {
                checkForegroundApp()
                handler?.postDelayed(this, CHECK_INTERVAL)
            }
        }
        handler?.post(runnable!!)
    }

    private fun stopMonitoring() {
        runnable?.let { handler?.removeCallbacks(it) }
        runnable = null
    }

    private fun checkForegroundApp() {
        try {
            val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val endTime = System.currentTimeMillis()
            val startTime = endTime - 3000 // Last 3 seconds

            // Use UsageEvents API for real-time foreground app detection
            // This is much more reliable than queryUsageStats for detecting current app
            val usageEvents = usageStatsManager.queryEvents(startTime, endTime)
            var currentForeground: String? = null
            val event = UsageEvents.Event()

            while (usageEvents.hasNextEvent()) {
                usageEvents.getNextEvent(event)
                // MOVE_TO_FOREGROUND (1) indicates an app has come to the foreground
                if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                    currentForeground = event.packageName
                }
            }

            // Fallback to queryUsageStats if no events found
            if (currentForeground == null) {
                val stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_BEST,
                    endTime - 5000,
                    endTime
                )
                currentForeground = stats
                    ?.filter { it.lastTimeUsed > endTime - 5000 }
                    ?.maxByOrNull { it.lastTimeUsed }
                    ?.packageName
            }

            if (currentForeground != null &&
                currentForeground != packageName && // Don't detect ourselves
                currentForeground != lastForegroundApp &&
                monitoringPackages.contains(currentForeground)) {

                val now = System.currentTimeMillis()
                if (now - lastDetectionTime > DETECTION_COOLDOWN) {
                    // Detected a tracked app launch!
                    lastDetectionTime = now
                    lastForegroundApp = currentForeground
                    onTrackedAppLaunched(currentForeground)
                }
            } else if (currentForeground != null) {
                lastForegroundApp = currentForeground
            }
        } catch (e: Exception) {
            // Silently handle - permission might have been revoked
        }
    }

    private fun onTrackedAppLaunched(packageName: String) {
        // Store the pending redirect in SharedPreferences for the JS layer to pick up
        prefs?.edit()?.apply {
            putString(KEY_PENDING_APP, packageName)
            putLong(KEY_PENDING_TIMESTAMP, System.currentTimeMillis())
            apply()
        }

        // Bring DopaMenu to foreground for full-screen redirect overlay
        val launchIntent = packageManager.getLaunchIntentForPackage(this.packageName)
        launchIntent?.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        )
        launchIntent?.putExtra("redirect_source_app", packageName)
        launchIntent?.putExtra("redirect_triggered", true)

        try {
            startActivity(launchIntent)
        } catch (e: Exception) {
            // Fallback: show notification if can't bring to foreground
            showRedirectNotification(packageName)
        }
    }

    private fun showRedirectNotification(packageName: String) {
        val intent = packageManager.getLaunchIntentForPackage(this.packageName)
        intent?.putExtra("redirect_source_app", packageName)
        intent?.putExtra("redirect_triggered", true)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val messages = listOf(
            "Caught yourself! What do you actually need?",
            "Before you scroll, take a breath.",
            "Pause. What would feel good instead?",
            "Mindful moment: you have other options.",
        )

        // Create notification channel for app detection if needed
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "app_detection",
                "App Detection",
                NotificationManager.IMPORTANCE_HIGH
            )
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, "app_detection")
            .setContentTitle("DopaMenu")
            .setContentText(messages.random())
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
`;
}

// Register the native module in MainApplication
function withAppUsageMainApplication(config) {
  return withMainApplication(config, async (config) => {
    const contents = config.modResults.contents;

    // Add import if not present
    if (!contents.includes('DopaMenuAppUsagePackage')) {
      const packageName = config.android?.package || 'com.dopamenu.app';

      // Add import
      const importStatement = `import ${packageName}.DopaMenuAppUsagePackage`;
      config.modResults.contents = contents.replace(
        /(import com\.facebook\.react\.ReactPackage)/,
        `$1\n${importStatement}`
      );

      // Add to packages list
      config.modResults.contents = config.modResults.contents.replace(
        /(packages\.add\(MainReactPackage\(\)\))/,
        `$1\n            packages.add(DopaMenuAppUsagePackage())`
      );
    }

    return config;
  });
}

// Main plugin function
module.exports = function withAppUsage(config) {
  config = withAppUsageManifest(config);
  config = withAppUsageNativeCode(config);
  config = withAppUsageMainApplication(config);
  return config;
};
