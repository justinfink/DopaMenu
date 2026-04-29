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

    // Full-screen-intent notification fallback: when direct startActivity is
    // blocked by Android 12+ background-start restrictions (user hasn't granted
    // Accessibility), a full-screen-intent notification pops the intervention
    // UI over the lock/home screen. Works without SYSTEM_ALERT_WINDOW.
    const hasFullScreenPerm = manifest['uses-permission'].some(
      (perm) => perm.$['android:name'] === 'android.permission.USE_FULL_SCREEN_INTENT'
    );
    if (!hasFullScreenPerm) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.USE_FULL_SCREEN_INTENT' },
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

    // Add AccessibilityService declaration. android:label is REQUIRED by the
    // OS — without it the Accessibility settings screen shows "This service
    // is malfunctioning" the moment you toggle it on.
    const hasAccessibilityService = application.service?.some(
      (svc) => svc.$['android:name'] === '.DopaMenuAccessibilityService'
    );

    if (!hasAccessibilityService) {
      application.service.push({
        $: {
          'android:name': '.DopaMenuAccessibilityService',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:exported': 'true',
          'android:label': '@string/dopamenu_accessibility_label',
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
    // UsageStats and PackageManager calls may silently skip tracked apps).
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

    // Generic launcher visibility: declare an <intent> query for MAIN/LAUNCHER
    // so installedAppsService can probe ALL catalog apps (problem + redirect)
    // via Linking.canOpenURL("intent://...;package=X;end") without needing each
    // package listed individually. This is the Google-blessed pattern for
    // pickers/launchers and does NOT require QUERY_ALL_PACKAGES, so Play
    // review treats it as low-risk. Without this, only the 8 packages above
    // appear as "installed" on Android 11+ — a pre-existing gap in the
    // redirect picker that hid Spotify, Audible, Headspace, etc.
    if (!queries.intent) queries.intent = [];
    const hasLauncherIntent = queries.intent.some((it) => {
      const acts = it.action || [];
      const cats = it.category || [];
      return (
        acts.some((a) => a.$?.['android:name'] === 'android.intent.action.MAIN') &&
        cats.some((c) => c.$?.['android:name'] === 'android.intent.category.LAUNCHER')
      );
    });
    if (!hasLauncherIntent) {
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
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

      // Write string resources for the AccessibilityService label and description.
      // Missing android:description is the #1 cause of "This service is
      // malfunctioning" when the user flips the toggle — Android requires both
      // strings to be resolvable before it will bind the service.
      const resValuesDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'values');
      if (!fs.existsSync(resValuesDir)) {
        fs.mkdirSync(resValuesDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(resValuesDir, 'dopamenu_strings.xml'),
        getDopaMenuStringsXml()
      );

      return config;
    },
  ]);
}

function getModuleCode(packageName) {
  return `package ${packageName}

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ConcurrentHashMap

class DopaMenuAppUsageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DopaMenuAppUsage"
        // Public so DopaMenuAccessibilityService can read/write these
        var monitoringPackages: List<String> = emptyList()
        var instance: DopaMenuAppUsageModule? = null

        // Stable id for the user-facing intervention notification. Constant so
        // we can cancel a stale post when the modal mounts (otherwise the
        // service was using a fresh timestamp id and we couldn't target it).
        const val INTERVENTION_NOTIF_ID = 2001

        // Cross-path debounce: any time EITHER the AccessibilityService or the
        // FGS poller dispatches an intervention, this timestamp is set. Both
        // paths must check it before dispatching their own. Without this, a
        // single Instagram launch fires the modal once via Accessibility (real-
        // time) and again ~2s later via the FGS poll — the "stutter" testers
        // saw. Uses elapsedRealtime so wall-clock changes don't break it.
        @Volatile @JvmField var lastInterventionDispatchAt: Long = 0L
        const val INTERVENTION_DEBOUNCE_MS = 1500L

        // True while the JS-side intervention modal is mounted on screen. The
        // FGS poller checks this before posting the HIGH-priority full-screen-
        // intent notification — if the modal is up, the user already sees
        // DopaMenu and a stacked notification just adds noise.
        @Volatile @JvmField var modalActive: Boolean = false

        // Cross-service suppression map. Keyed by packageName, value is the
        // absolute epoch millis until which BOTH the FGS polling path AND the
        // AccessibilityService must skip firing an intercept for that package.
        //
        // Why we need this: when a user taps "Continue what I was doing" on
        // the intervention screen, JS launches the trigger app (e.g. Instagram)
        // via an Android intent. Without suppression, the FGS poller sees
        // Instagram become foreground one poll later and fires another
        // intercept — the user ends up in an infinite ping-pong between the
        // app they wanted to use and the DopaMenu modal.
        //
        // JS calls suppressIntercept(packageName, durationMs) when the user
        // explicitly chose a non-intercepting action (continue / dismiss /
        // accept an alternative). 5s is the standard window — long enough to
        // cover the trigger app refocusing + a couple of activity transitions,
        // short enough that a deliberate re-launch isn't silently dropped.
        val suppressedUntil: ConcurrentHashMap<String, Long> = ConcurrentHashMap()

        fun isSuppressed(packageName: String): Boolean {
            val until = suppressedUntil[packageName] ?: return false
            if (System.currentTimeMillis() >= until) {
                suppressedUntil.remove(packageName)
                return false
            }
            return true
        }

        /**
         * Cross-path gate. Returns true and updates the dispatch timestamp if
         * an intervention should fire for this package right now; returns
         * false if we should swallow it because (a) the package is in the
         * post-dismissal suppression window or (b) another path already
         * dispatched within INTERVENTION_DEBOUNCE_MS.
         *
         * Both AccessibilityService.onAccessibilityEvent AND
         * AppUsageMonitorService.checkForegroundApp must call this BEFORE
         * starting the intervention activity. Whichever wins the race
         * latches the timestamp; the loser silently drops.
         */
        fun shouldDispatchIntervention(packageName: String): Boolean {
            if (isSuppressed(packageName)) return false
            val now = SystemClock.elapsedRealtime()
            if (now - lastInterventionDispatchAt < INTERVENTION_DEBOUNCE_MS) return false
            lastInterventionDispatchAt = now
            return true
        }

        /** Reset the debounce so a fallback path (e.g. FGS notification when
         * Accessibility's startActivity got BAL-blocked) can fire right away. */
        fun resetInterventionDebounce() {
            lastInterventionDispatchAt = 0L
        }

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

    // JS calls this when the user has explicitly chosen to continue into a
    // tracked app (tap "Keep doing what I was doing", "Launch anyway", or
    // accept a redirect that lands them back in the trigger app). Without
    // this window, the FGS poller and AccessibilityService would re-intercept
    // the same foreground transition and trap the user in a ping-pong loop
    // between the trigger app and the DopaMenu modal.
    @ReactMethod
    fun suppressIntercept(packageName: String, durationMs: Double, promise: Promise) {
        try {
            val until = System.currentTimeMillis() + durationMs.toLong()
            suppressedUntil[packageName] = until
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // JS calls this on intervention-modal mount/unmount. While the modal is
    // up, the FGS poller skips its HIGH-priority full-screen-intent
    // notification — the user already sees DopaMenu, a tray notification on
    // top is just noise. We also cancel any in-flight intervention
    // notification so the brief race window between "service posts
    // notification" and "modal mounts" doesn't leave a stale notification
    // sitting in the shade.
    @ReactMethod
    fun setModalActive(active: Boolean, promise: Promise) {
        try {
            modalActive = active
            if (active) {
                try {
                    val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.cancel(INTERVENTION_NOTIF_ID)
                } catch (e: Exception) {
                    // Best-effort cleanup. Not worth surfacing.
                }
            }
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

    // Returns true if the user has already tapped ⋮ → "Allow restricted settings"
    // for this app in App Info. Uses AppOpsManager op "android:access_restricted_settings"
    // (Android 13+ only; returns true on earlier versions since restriction doesn't apply).
    // With this signal we know whether to show the App Info unlock step proactively.
    @ReactMethod
    fun checkRestrictedSettingsGranted(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                promise.resolve(true)
                return
            }
            val appOps = reactApplicationContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = appOps.unsafeCheckOpNoThrow(
                "android:access_restricted_settings",
                Process.myUid(),
                reactApplicationContext.packageName
            )
            promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
        } catch (e: Exception) {
            // Hidden API unavailable — assume not granted so we show guidance
            promise.resolve(false)
        }
    }

    // Returns true when DopaMenu was NOT installed via the Play Store AND the
    // device is Android 13+ (TIRAMISU). On those devices, sideloaded apps have
    // "Restricted Settings" active, which greys out the Accessibility and Usage
    // Access toggles until the user taps App Info → ⋮ → Allow restricted settings.
    @ReactMethod
    fun checkIsRestrictedInstall(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                promise.resolve(false)
                return
            }
            val pm = reactApplicationContext.packageManager
            val pkg = reactApplicationContext.packageName
            val installer = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    pm.getInstallSourceInfo(pkg).installingPackageName
                } else {
                    @Suppress("DEPRECATION")
                    pm.getInstallerPackageName(pkg)
                }
            } catch (e: Exception) {
                null
            }
            // com.android.vending = Play Store; anything else (null, ADB, file manager) = sideloaded
            promise.resolve(installer != "com.android.vending")
        } catch (e: Exception) {
            // If we can't determine, assume restricted so the UI shows guidance
            promise.resolve(true)
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

    // Kicks off the foreground-service-driven onboarding watch. While JS is
    // backgrounded (user is in Settings), the service polls the target AppOp
    // every 500ms and, when it flips, uses its BAL-exempt startActivity
    // permission to yank DopaMenu back to the foreground. target must be one
    // of: "restricted_unlock", "usage_access", "accessibility".
    @ReactMethod
    fun startOnboardingWatch(target: String, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, AppUsageMonitorService::class.java).apply {
                action = AppUsageMonitorService.ACTION_START_ONBOARDING_WATCH
                putExtra("target", target)
            }
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

    // Returns a map describing the current device so JS can adapt onboarding
    // copy to what the user will actually see in Settings. The ⋮ menu for
    // "Allow restricted settings" is universal on Android 13+ sideloads, but
    // Samsung OneUI 6+ surfaces the same control as a direct row on the App
    // Info page instead of hiding it behind ⋮. We detect that and rewrite
    // the instructions device-by-device rather than saying "on Samsung…".
    @ReactMethod
    fun getDeviceProfile(promise: Promise) {
        try {
            val manufacturer = (Build.MANUFACTURER ?: "").lowercase()
            val brand = (Build.BRAND ?: "").lowercase()
            val model = Build.MODEL ?: ""
            val sdkInt = Build.VERSION.SDK_INT
            val isSamsung = manufacturer.contains("samsung") || brand.contains("samsung")
            val isPixel = brand.contains("google") || model.lowercase().contains("pixel")
            val isOnePlus = manufacturer.contains("oneplus") || brand.contains("oneplus")
            val isXiaomi = manufacturer.contains("xiaomi") || brand.contains("xiaomi") ||
                brand.contains("redmi") || brand.contains("poco")

            // Samsung OneUI version detection. OneUI is layered on top of Android;
            // its version is exposed via SystemProperties "ro.build.version.oneui"
            // on newer builds, fallback to "ro.build.version.sem_platform_int".
            // OneUI 6 = Android 14 base, OneUI 6.1/7+ surface restricted-unlock
            // as a direct row on App Info rather than hiding it in ⋮.
            var oneUIVersion = 0
            if (isSamsung) {
                oneUIVersion = try {
                    val cls = Class.forName("android.os.SystemProperties")
                    val get = cls.getMethod("get", String::class.java, String::class.java)
                    val semInt = (get.invoke(null, "ro.build.version.sem_platform_int", "0") as? String)
                        ?.toIntOrNull() ?: 0
                    // sem_platform_int is (oneUIMajor + 90) * 10000 for OneUI 3+
                    // e.g. OneUI 6 → 150000, OneUI 6.1 → 150100, OneUI 7 → 160000
                    if (semInt >= 130000) (semInt / 10000) - 90 else 0
                } catch (e: Exception) { 0 }
            }

            val map = Arguments.createMap().apply {
                putString("manufacturer", Build.MANUFACTURER ?: "")
                putString("brand", Build.BRAND ?: "")
                putString("model", model)
                putInt("sdkInt", sdkInt)
                putBoolean("isSamsung", isSamsung)
                putBoolean("isPixel", isPixel)
                putBoolean("isOnePlus", isOnePlus)
                putBoolean("isXiaomi", isXiaomi)
                putInt("oneUIVersion", oneUIVersion)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopOnboardingWatch(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, AppUsageMonitorService::class.java).apply {
                action = AppUsageMonitorService.ACTION_STOP_ONBOARDING_WATCH
            }
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

import android.accessibilityservice.AccessibilityServiceInfo
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
import android.os.Process
import android.util.Log
import android.view.accessibility.AccessibilityManager
import androidx.core.app.NotificationCompat

class AppUsageMonitorService : Service() {

    private var handler: Handler? = null
    private var runnable: Runnable? = null
    private var monitoringPackages: List<String> = emptyList()
    private var lastForegroundApp: String? = null

    // Onboarding-watch state. Separate from the polling runnable so we can run
    // concurrently or standalone. Target is one of: restricted_unlock,
    // usage_access, accessibility.
    private var onboardingRunnable: Runnable? = null
    private var onboardingTarget: String? = null
    private var onboardingStartTime: Long = 0L

    companion object {
        private const val CHANNEL_ID = "app_monitoring"
        private const val NOTIFICATION_ID = 1001
        private const val CHECK_INTERVAL = 2000L // Check every 2 seconds

        // Onboarding watch: poll faster so auto-return feels instant once the
        // user flips a toggle. 5-minute ceiling so we can't run forever if the
        // user gets distracted or denies the permission.
        private const val ONBOARDING_POLL_INTERVAL = 500L
        private const val ONBOARDING_TIMEOUT_MS = 5L * 60L * 1000L
        const val ACTION_START_ONBOARDING_WATCH = "${packageName}.ONBOARDING_WATCH_START"
        const val ACTION_STOP_ONBOARDING_WATCH = "${packageName}.ONBOARDING_WATCH_STOP"
        private const val ONBOARDING_RETURN_CHANNEL = "onboarding_return"
        private const val ONBOARDING_RETURN_NOTIFICATION_ID = 9999
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        handler = Handler(Looper.getMainLooper())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        // CRITICAL: any time onStartCommand runs because of startForegroundService(),
        // we MUST call startForeground() before returning — even if we plan to
        // immediately stop. Failing this contract throws
        // android.app.RemoteServiceException\$ForegroundServiceDidNotStartInTimeException
        // which is delivered as a FATAL EXCEPTION on the main thread and
        // crashes the entire app process. When the process dies, the
        // AccessibilityService (same uid) dies with it and Settings shows
        // "This service is malfunctioning". Doing the call up-front, before
        // we branch on action, removes every "but I returned early" footgun.
        try {
            startForeground(NOTIFICATION_ID, createNotification())
        } catch (e: Exception) {
            Log.e("DopaMenu", "startForeground failed: \${e.message}", e)
            // If we can't enter foreground we can't legally proceed —
            // tear down rather than crash the process via the timeout.
            stopSelf(startId)
            return START_NOT_STICKY
        }

        // Onboarding watch: start/stop the permission poller.
        if (action == ACTION_START_ONBOARDING_WATCH) {
            val target = intent.getStringExtra("target")
            if (target != null) {
                startOnboardingWatch(target)
            }
            return START_NOT_STICKY
        }
        if (action == ACTION_STOP_ONBOARDING_WATCH) {
            stopOnboardingWatch()
            // If nothing else needs us, drop foreground state and stop
            // immediately so the user doesn't see a stale "DopaMenu Active"
            // notification flash on screen.
            if (monitoringPackages.isEmpty() && runnable == null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(true)
                }
                stopSelf(startId)
            }
            return START_NOT_STICKY
        }

        intent?.getStringArrayListExtra("packages")?.let {
            monitoringPackages = it
        }

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
        stopOnboardingWatch()
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
            // Cross-path gate. shouldDispatchIntervention checks both the
            // per-package suppression window (set by JS when the user just
            // chose to continue) AND the cross-path debounce (set whenever
            // EITHER this poller or the AccessibilityService just fired).
            // Whichever path got there first latches the timestamp; we drop.
            if (!DopaMenuAppUsageModule.shouldDispatchIntervention(lastResumedPackage)) {
                return
            }
            onTrackedAppLaunched(lastResumedPackage)
        } else if (lastResumedPackage != null) {
            lastForegroundApp = lastResumedPackage
        }
    }

    private fun onTrackedAppLaunched(packageName: String) {
        // Deep link into the intervention screen.
        // NEW_TASK + REORDER_TO_FRONT: brings the existing DopaMenu task to
        // front without destroying the existing activity stack. CLEAR_TOP used
        // to be here but it resets the root activity, which wiped the user's
        // onboarding progress mid-flow — never worth that tradeoff.
        val deepLink = Uri.parse("dopamenu://intervention?trigger=app_intercept&package=\${packageName}")
        val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
            setPackage(this@AppUsageMonitorService.packageName)
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
        }

        // Overlay-style intercept: bring DopaMenu to the foreground directly.
        // A running foreground service CAN launch activities on modern Android,
        // but Android 12+ enforces strict background-activity-start rules —
        // startActivity here often throws on Pixel / AOSP without the
        // Accessibility service also enabled. When it fails we fall back to a
        // full-screen-intent notification, which the OS treats as an
        // overlay-equivalent and surfaces the DopaMenu UI automatically.
        var launchedDirectly = false
        try {
            startActivity(intent)
            launchedDirectly = true
        } catch (e: Exception) {
            Log.w("DopaMenu", "Direct startActivity blocked, using full-screen intent: \${e.message}")
            // Let a fallback path fire immediately — without resetting, the
            // 1.5s cross-path debounce we just claimed would gate the
            // notification fallback too, and the user would see nothing.
            DopaMenuAppUsageModule.resetInterventionDebounce()
        }

        // Notification posting strategy:
        //   - launchedDirectly == true: the modal is opening / already open.
        //     Don't post anything. The modal IS the user-visible interception;
        //     a tray notification stacked on top is the "pops up a few times"
        //     overwhelm that testers reported.
        //   - launchedDirectly == false AND modal already on screen:
        //     also skip — the AccessibilityService got there first and the
        //     user already sees DopaMenu.
        //   - launchedDirectly == false AND no modal: post the HIGH-priority
        //     full-screen-intent notification as the BAL fallback. Without
        //     this, on Pixel/AOSP without Accessibility the user gets nothing.
        if (launchedDirectly || DopaMenuAppUsageModule.modalActive) {
            return
        }

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
            ).apply {
                setShowBadge(false)
                setBypassDnd(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val builder = NotificationCompat.Builder(this, "app_detection")
            .setContentTitle("DopaMenu")
            .setContentText(messages.random())
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setFullScreenIntent(pendingIntent, true)

        try {
            // Stable id so setModalActive() can cancel us once the modal mounts.
            getSystemService(NotificationManager::class.java)
                .notify(DopaMenuAppUsageModule.INTERVENTION_NOTIF_ID, builder.build())
        } catch (e: Exception) {
            Log.e("DopaMenu", "Notification post failed: \${e.message}")
        }
    }

    // ─── Onboarding watch ───────────────────────────────────────────────────
    //
    // During onboarding, the app sends the user out to Settings to flip a
    // toggle (Allow restricted settings, Usage Access, or Accessibility).
    // Android doesn't auto-return from Settings, and in-app permission re-
    // checks can lag or return stale data on some devices. So we poll from
    // here at 500ms intervals and, the moment the target flips to granted,
    // startActivity DopaMenu to yank the user back in. Works because FGSes
    // retain BAL permission on Android 12+.
    //
    // If startActivity is blocked (rare — OEM variants with stricter BAL),
    // we fall back to a full-screen-intent notification.

    private fun startOnboardingWatch(target: String) {
        stopOnboardingWatch()
        onboardingTarget = target
        onboardingStartTime = System.currentTimeMillis()
        onboardingRunnable = object : Runnable {
            override fun run() {
                val currentTarget = onboardingTarget ?: return
                val granted = try {
                    checkOnboardingTargetGranted(currentTarget)
                } catch (e: Exception) {
                    Log.w("DopaMenu", "Onboarding check failed: \${e.message}")
                    false
                }
                if (granted) {
                    bringDopaMenuForward(currentTarget)
                    stopOnboardingWatch()
                    if (monitoringPackages.isEmpty() && runnable == null) {
                        stopSelf()
                    }
                    return
                }
                if (System.currentTimeMillis() - onboardingStartTime > ONBOARDING_TIMEOUT_MS) {
                    Log.w("DopaMenu", "Onboarding watch timed out for \$currentTarget")
                    stopOnboardingWatch()
                    if (monitoringPackages.isEmpty() && runnable == null) {
                        stopSelf()
                    }
                    return
                }
                handler?.postDelayed(this, ONBOARDING_POLL_INTERVAL)
            }
        }
        handler?.post(onboardingRunnable!!)
    }

    private fun stopOnboardingWatch() {
        onboardingRunnable?.let { handler?.removeCallbacks(it) }
        onboardingRunnable = null
        onboardingTarget = null
    }

    private fun checkOnboardingTargetGranted(target: String): Boolean = when (target) {
        "restricted_unlock" -> checkRestrictedSettingsGrantedLocal()
        "usage_access" -> hasUsageStatsPermissionLocal()
        "accessibility" -> hasAccessibilityServiceLocal()
        else -> false
    }

    private fun checkRestrictedSettingsGrantedLocal(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return try {
            val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = appOps.unsafeCheckOpNoThrow(
                "android:access_restricted_settings",
                Process.myUid(),
                packageName
            )
            mode == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) { false }
    }

    private fun hasUsageStatsPermissionLocal(): Boolean {
        return try {
            val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    packageName
                )
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    packageName
                )
            }
            mode == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) { false }
    }

    private fun hasAccessibilityServiceLocal(): Boolean {
        return try {
            val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            val enabled = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            enabled.any { it.resolveInfo.serviceInfo.packageName == packageName }
        } catch (e: Exception) { false }
    }

    private fun bringDopaMenuForward(target: String) {
        // REORDER_TO_FRONT preserves the activity stack (keeps the user on
        // their current onboarding screen). CLEAR_TOP would rebuild MainActivity
        // from scratch — that's what was sending users back to the welcome
        // screen every time they returned from Settings.
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            putExtra("onboarding_return", target)
        } ?: return

        // Best-effort direct launch. We DON'T early-return on success because
        // Android 12+ BAL silently drops startActivity from a FGS in many
        // situations without throwing — no exception, no foreground change,
        // and the user is stuck in Settings with no way back. Posting the
        // full-screen-intent notification below unconditionally is cheap and
        // guarantees a return path the user can see.
        try {
            startActivity(launchIntent)
        } catch (e: Exception) {
            Log.w("DopaMenu", "Onboarding return startActivity blocked: \${e.message}")
        }

        // Always post the full-screen-intent notification. On Android 14+ this
        // requires USE_FULL_SCREEN_INTENT (already declared in the manifest)
        // and for most users it surfaces DopaMenu immediately as if it were
        // an incoming call.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    ONBOARDING_RETURN_CHANNEL,
                    "Setup Return",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    setShowBadge(false)
                    setBypassDnd(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            }
            val pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val notif = NotificationCompat.Builder(this, ONBOARDING_RETURN_CHANNEL)
                .setContentTitle("DopaMenu setup ready")
                .setContentText("Tap to continue where you left off")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setFullScreenIntent(pendingIntent, true)
                .build()
            getSystemService(NotificationManager::class.java)
                .notify(ONBOARDING_RETURN_NOTIFICATION_ID, notif)
        } catch (e: Exception) {
            Log.e("DopaMenu", "Onboarding return notification failed: \${e.message}")
        }
    }
}
`;
}

function getAccessibilityServiceCode(packageName) {
  return `package ${packageName}

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.ActivityOptions
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent

// AccessibilityService is the overlay mechanism. When it detects a tracked app
// opening, it immediately brings DopaMenu to the foreground via startActivity
// — which AccessibilityServices are explicitly permitted to do even from the
// background on Android 10+. This is what makes the "intercept" feel instant
// and overlay-like instead of a notification the user has to tap.
class DopaMenuAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        // Do NOT set serviceInfo programmatically here. Assigning a fresh
        // AccessibilityServiceInfo() replaces the XML config wholesale,
        // dropping android:description, android:label, packageNames, and
        // canRetrieveWindowContent. The OS then marks the service as
        // "malfunctioning" because the runtime info is missing required
        // fields, and the toggle bounces back to off. The XML config
        // (res/xml/dopamenu_accessibility_config.xml) already declares
        // every value the framework needs — leave it alone.
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Wrap the whole handler. If anything throws, the OS treats the service
        // as misbehaving and can disable it — we must never let an exception
        // escape this callback.
        try {
            if (event == null) return
            if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
            val pkg = event.packageName?.toString() ?: return

            // Only intercept apps the user is tracking
            if (!DopaMenuAppUsageModule.monitoringPackages.contains(pkg)) return

            // Cross-path gate. shouldDispatchIntervention combines the
            // user-explicit suppression window AND a 1.5s cross-path debounce
            // that synchronizes us with the FGS poller. A single Instagram
            // launch fires WINDOW_STATE_CHANGED multiple times as activities
            // transition (splash → feed) — the debounce swallows the
            // aftershocks. The FGS poller's 2s tick also calls this same gate,
            // so whichever fires first wins.
            if (!DopaMenuAppUsageModule.shouldDispatchIntervention(pkg)) return

            // Forward to the module so JS can record analytics if foregrounded
            try {
                DopaMenuAppUsageModule.onAccessibilityAppDetected(pkg)
            } catch (e: Throwable) {
                Log.w("DopaMenu", "JS notify failed: \${e.message}")
            }

            // Bring DopaMenu to the foreground — this is the overlay behavior.
            bringDopaMenuForward(pkg)
        } catch (e: Throwable) {
            Log.e("DopaMenu", "onAccessibilityEvent crash: \${e.message}", e)
        }
    }

    private fun bringDopaMenuForward(sourcePackage: String) {
        try {
            val deepLink = Uri.parse("dopamenu://intervention?trigger=app_intercept&package=\$sourcePackage")
            val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
                setPackage(applicationContext.packageName)
                // REORDER_TO_FRONT (no CLEAR_TOP) so we don't obliterate the
                // user's current screen — especially during onboarding.
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
            }
            // Android 14 (API 34) tightened background activity launches.
            // AccessibilityServices technically have an exemption, but the
            // OS only honors it when ActivityOptions explicitly opts into
            // the background-launch mode. Without these options, the
            // launch can be silently dropped, and repeated drops are a
            // known cause of the OS marking the service "malfunctioning"
            // and disabling it.
            if (Build.VERSION.SDK_INT >= 34) {
                val options = ActivityOptions.makeBasic()
                    .setPendingIntentBackgroundActivityStartMode(
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                    )
                startActivity(intent, options.toBundle())
            } else {
                startActivity(intent)
            }
        } catch (e: Exception) {
            // If startActivity is blocked for any reason (rare for an
            // AccessibilityService), the UsageStats polling path still fires
            // a notification as a fallback. Reset the cross-path debounce so
            // the next FGS poll within the 1.5s window isn't gated — we need
            // SOME path to surface the intervention.
            Log.w("DopaMenu", "Accessibility startActivity blocked: \${e.message}")
            DopaMenuAppUsageModule.resetInterventionDebounce()
        }
    }

    override fun onInterrupt() {
        // No-op. Keep this try/catch-guarded at the caller; Accessibility
        // framework invokes this on its own thread and an uncaught throw here
        // will mark the service as malfunctioning.
    }
}
`;
}

function getAccessibilityConfigXml() {
  // Every attribute here matters for keeping the OS from flipping the
  // service into "This service is malfunctioning" on Android 14/15:
  //
  // - android:description is mandatory — Android uses it on the Accessibility
  //   settings page; missing/unresolved → malfunctioning.
  //
  // - android:isAccessibilityTool="false" — REQUIRED for non-assistive
  //   uses on Android 12+. Pixel 14/15 will mark services malfunctioning
  //   if this attribute is missing AND the service is being used for
  //   non-tool purposes (DopaMenu monitors app launches, it's not for
  //   users with disabilities). Setting it to false also keeps us in
  //   compliance with Google Play's prominent-disclosure requirement
  //   that the app surfaces a consent screen before opening Settings.
  //
  // - accessibilityFlags MUST include flagRequestAccessibilityButton
  //   when the user has the "Accessibility shortcut" toggle on (Pixel
  //   defaults this to on after first-enable). Without the flag, the
  //   shortcut row exists in Settings but the service can't claim it,
  //   and the OS reports the mismatch as malfunctioning.
  return `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/dopamenu_accessibility_description"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="100"
    android:canRetrieveWindowContent="false"
    android:isAccessibilityTool="false"
    android:accessibilityFlags="flagDefault|flagRequestAccessibilityButton|flagIncludeNotImportantViews" />
`;
}

function getDopaMenuStringsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="dopamenu_accessibility_label">DopaMenu</string>
    <string name="dopamenu_accessibility_description">DopaMenu watches for when you open apps you\\'ve chosen to intercept (like Instagram or TikTok) and gently redirects you into a mindful moment. This permission is required for the real-time intercept to feel instant. DopaMenu never reads screen content, passwords, or typed text.</string>
</resources>
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
