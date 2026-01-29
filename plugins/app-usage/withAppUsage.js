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

      // Write the service
      const serviceCode = getServiceCode(packageName);
      fs.writeFileSync(path.join(javaDir, 'AppUsageMonitorService.kt'), serviceCode);

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
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

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
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
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
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        val startTime = endTime - 5000 // Last 5 seconds

        val stats = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_BEST,
            startTime,
            endTime
        )

        val currentForeground = stats
            ?.filter { it.lastTimeUsed > startTime }
            ?.maxByOrNull { it.lastTimeUsed }
            ?.packageName

        if (currentForeground != null &&
            currentForeground != lastForegroundApp &&
            monitoringPackages.contains(currentForeground)) {

            // Detected a tracked app launch!
            lastForegroundApp = currentForeground
            onTrackedAppLaunched(currentForeground)
        } else if (currentForeground != null) {
            lastForegroundApp = currentForeground
        }
    }

    private fun onTrackedAppLaunched(packageName: String) {
        // Send a notification to interrupt the user
        val intent = packageManager.getLaunchIntentForPackage(this.packageName)
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
