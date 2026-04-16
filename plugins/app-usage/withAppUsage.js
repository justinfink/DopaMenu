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

    // Add foreground service type permission (Android 14+)
    const hasForegroundTypePerm = manifest['uses-permission'].some(
      (perm) => perm.$['android:name'] === 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE'
    );

    if (!hasForegroundTypePerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE' },
      });
    }

    // Add the monitoring service
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

    // Add AccessibilityService declaration
    const hasAccessibilityService = application.service?.some(
      (svc) => svc.$['android:name'] === '.DopaMenuAccessibilityService'
    );

    if (!hasAccessibilityService) {
      application.service.push({
        $: {
          'android:name': '.DopaMenuAccessibilityService',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] }],
        'meta-data': [{
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/dopamenu_accessibility_config',
          },
        }],
      });
    }

    // Add <queries> for package visibility on Android 11+ (without this,
    // UsageStats and PackageManager calls may silently skip tracked apps)
    if (!manifest.queries) manifest.queries = [{}];
    const queries = manifest.queries[0];
    if (!queries.package) queries.package = [];
    const trackedPkgs = [
      'com.instagram.android', 'com.twitter.android', 'com.zhiliaoapp.musically',
      'com.facebook.katana', 'com.reddit.frontpage', 'com.snapchat.android',
      'com.google.android.youtube', 'com.netflix.mediaclient',
    ];
    for (const pkg of trackedPkgs) {
      if (!queries.package.some((p) => p.$?.['android:name'] === pkg)) {
        queries.package.push({ $: { 'android:name': pkg } });
      }
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

      // Write the monitoring service
      const serviceCode = getServiceCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'AppUsageMonitorService.kt'), serviceCode);

      // Write the AccessibilityService
      const accessibilityCode = getAccessibilityServiceCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'DopaMenuAccessibilityService.kt'), accessibilityCode);

      // Write the AccessibilityService XML config into res/xml/
      const resXmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
      if (!fs.existsSync(resXmlDir)) {
        fs.mkdirSync(resXmlDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(resXmlDir, 'dopamenu_accessibility_config.xml'),
        getAccessibilityConfigXml()
      );

      return config;
    },
  ]);
}

function getModuleCode(packageName) {
  return `package ${packageName}

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class DopaMenuAppUsageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DopaMenuAppUsage"
        // Public so DopaMenuAccessibilityService can read/write these
        var monitoringPackages: List<String> = emptyList()
        var instance: DopaMenuAppUsageModule? = null

        /** Called by DopaMenuAccessibilityService on the main thread */
        fun onAccessibilityAppDetected(packageName: String) {
            if (!monitoringPackages.contains(packageName)) return
            instance?.emitAppLaunched(packageName, packageName)
        }
    }

    init {
        instance = this
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
    fun checkAccessibilityPermission(promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            val enabled = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            val granted = enabled.any { it.resolveInfo.serviceInfo.packageName == reactApplicationContext.packageName }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestAccessibilityPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // Opens DopaMenu's own App Info screen. This is where Android 13+ surfaces
    // the ⋮ menu with "Allow restricted settings", which is required before
    // sideloaded apps can receive Usage Access or Accessibility permissions.
    @ReactMethod
    fun openAppInfo(promise: Promise) {
        try {
            val pkg = reactApplicationContext.packageName
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.parse("package:\$pkg")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
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
import android.net.Uri
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

    companion object {
        private const val CHANNEL_ID = "app_monitoring"
        private const val NOTIFICATION_ID = 1001
        private const val CHECK_INTERVAL = 2000L // Check every 2 seconds
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        handler = Handler(Looper.getMainLooper())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringArrayListExtra("packages")?.let {
            monitoringPackages = it
        }

        startForeground(NOTIFICATION_ID, createNotification())
        startMonitoring()

        // Android 14+ ignores START_STICKY for foreground services.
        // AccessibilityService keeps detection alive if this service is killed.
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            START_NOT_STICKY
        } else {
            START_STICKY
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // Android 15: called when the 6-hour specialUse FGS time limit is reached
    override fun onTimeout(startId: Int) {
        stopSelf(startId)
    }

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
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        // Overlap by 500ms to avoid gaps between polling cycles
        val startTime = endTime - CHECK_INTERVAL - 500

        // UsageEvents.queryEvents + ACTIVITY_RESUMED is the correct API for
        // foreground detection — queryUsageStats only returns aggregate stats
        // and misses brief app launches like Instagram's splash-to-feed sequence.
        val usageEvents = usageStatsManager.queryEvents(startTime, endTime)
        val event = UsageEvents.Event()
        var lastResumedPackage: String? = null

        while (usageEvents.hasNextEvent()) {
            usageEvents.getNextEvent(event)
            // Check both MOVE_TO_FOREGROUND (app-level, all Android) and
            // ACTIVITY_RESUMED (activity-level, Android 10+) for maximum coverage
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                lastResumedPackage = event.packageName
            }
        }

        if (lastResumedPackage != null &&
            lastResumedPackage != lastForegroundApp &&
            monitoringPackages.contains(lastResumedPackage)) {

            lastForegroundApp = lastResumedPackage
            onTrackedAppLaunched(lastResumedPackage)
        } else if (lastResumedPackage != null) {
            lastForegroundApp = lastResumedPackage
        }
    }

    private fun onTrackedAppLaunched(packageName: String) {
        // Deep link into the intervention screen
        val deepLink = Uri.parse("dopamenu://intervention?trigger=app_intercept&package=\${packageName}")
        val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
            setPackage(this@AppUsageMonitorService.packageName)
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
        }

        // Overlay-style intercept: bring DopaMenu to the foreground directly.
        // A running foreground service is permitted to launch activities even
        // from background context on modern Android. If the platform blocks
        // this (some OEMs/versions), the notification fallback below still
        // lets the user tap in.
        var launchedDirectly = false
        try {
            startActivity(intent)
            launchedDirectly = true
        } catch (_: Exception) {
            // Fall through to notification
        }

        // Always also post a high-priority notification as a fallback/backup
        // path. On devices where the direct launch succeeded this is a
        // redundant but harmless reminder the user can swipe away.
        val pendingIntent = PendingIntent.getActivity(
            this, System.currentTimeMillis().toInt(), intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val messages = listOf(
            "Caught yourself! What do you actually need?",
            "Before you scroll, take a breath.",
            "Pause. What would feel good instead?",
            "Mindful moment: you have other options.",
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "app_detection",
                "App Detection",
                NotificationManager.IMPORTANCE_HIGH
            ).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        // If we already launched DopaMenu directly, make the fallback
        // notification lower priority so it doesn't also heads-up.
        val notif = NotificationCompat.Builder(this, "app_detection")
            .setContentTitle("DopaMenu")
            .setContentText(messages.random())
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setPriority(if (launchedDirectly) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        getSystemService(NotificationManager::class.java)
            .notify(System.currentTimeMillis().toInt(), notif)
    }
}
`;
}

function getAccessibilityServiceCode(packageName) {
  return `package ${packageName}

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.net.Uri
import android.view.accessibility.AccessibilityEvent

// AccessibilityService is the overlay mechanism. When it detects a tracked app
// opening, it immediately brings DopaMenu to the foreground via startActivity
// — which AccessibilityServices are explicitly permitted to do even from the
// background on Android 10+. This is what makes the "intercept" feel instant
// and overlay-like instead of a notification the user has to tap.
class DopaMenuAccessibilityService : AccessibilityService() {

    // Throttle foreground-intent spam. A single window-state change can fire
    // the event multiple times as activities transition.
    private var lastInterceptedPackage: String? = null
    private var lastInterceptTime: Long = 0L

    override fun onServiceConnected() {
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return

        // Only intercept apps the user is tracking
        if (!DopaMenuAppUsageModule.monitoringPackages.contains(pkg)) return

        // Ignore repeats within 5s for the same package — stops us from
        // launching DopaMenu over itself on activity transitions.
        val now = System.currentTimeMillis()
        if (pkg == lastInterceptedPackage && now - lastInterceptTime < 5000L) return
        lastInterceptedPackage = pkg
        lastInterceptTime = now

        // Forward to the module so JS can record analytics if foregrounded
        DopaMenuAppUsageModule.onAccessibilityAppDetected(pkg)

        // Bring DopaMenu to the foreground — this is the overlay behavior.
        bringDopaMenuForward(pkg)
    }

    private fun bringDopaMenuForward(sourcePackage: String) {
        try {
            val deepLink = Uri.parse("dopamenu://intervention?trigger=app_intercept&package=\$sourcePackage")
            val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
                setPackage(applicationContext.packageName)
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
            }
            startActivity(intent)
        } catch (_: Exception) {
            // If startActivity is blocked for any reason (rare for an
            // AccessibilityService), the UsageStats polling path still fires
            // a notification as a fallback.
        }
    }

    override fun onInterrupt() {}
}
`;
}

function getAccessibilityConfigXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="100"
    android:canRetrieveWindowContent="false" />
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

      // Inject package registration — handle all three known MainApplication.kt patterns:
      //   1. New arch (Expo SDK 51+): PackageList(this).packages.apply { ... }
      //   2. New arch (Expo SDK 49-50): val packages = PackageList(this).packages
      //   3. Old arch: packages.add(MainReactPackage())
      const c = config.modResults.contents;
      if (c.includes('PackageList(this).packages.apply')) {
        // Pattern 1: inject inside the apply block
        config.modResults.contents = c.replace(
          /(PackageList\(this\)\.packages\.apply\s*\{)/,
          `$1\n              add(DopaMenuAppUsagePackage())`
        );
      } else if (c.includes('PackageList(this).packages')) {
        // Pattern 2: val packages = PackageList(this).packages
        config.modResults.contents = c.replace(
          /(val packages = PackageList\(this\)\.packages)/,
          `$1\n            packages.add(DopaMenuAppUsagePackage())`
        );
      } else {
        // Pattern 3: old arch
        config.modResults.contents = c.replace(
          /(packages\.add\(MainReactPackage\(\)\))/,
          `$1\n            packages.add(DopaMenuAppUsagePackage())`
        );
      }
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
