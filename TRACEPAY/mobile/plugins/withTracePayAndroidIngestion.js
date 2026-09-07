const { AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const MODULE_DIR = ["app", "src", "main", "java", "com", "tracepay", "mobile", "ingestion"];

const moduleSource = `package com.tracepay.mobile.ingestion

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.Settings
import android.service.notification.StatusBarNotification
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.security.MessageDigest
import java.util.Date
import java.util.Locale

class TracePayIngestionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "TracePayIngestion"

  @ReactMethod
  fun hasSmsPermission(promise: Promise) {
    promise.resolve(hasReadSmsPermission())
  }

  @ReactMethod
  fun requestSmsPermission(promise: Promise) {
    val activity: Activity? = currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    if (hasReadSmsPermission()) {
      promise.resolve(true)
      return
    }
    ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.READ_SMS), SMS_PERMISSION_REQUEST)
    promise.resolve(false)
  }

  @ReactMethod
  fun readSmsInbox(limit: Int, promise: Promise) {
    if (!hasReadSmsPermission()) {
      promise.resolve(Arguments.createArray())
      return
    }

    val safeLimit = limit.coerceIn(1, 500)
    val readings = Arguments.createArray()
    val cursor: Cursor? = reactContext.contentResolver.query(
      Uri.parse("content://sms/inbox"),
      arrayOf("_id", "address", "date", "body"),
      null,
      null,
      "date DESC LIMIT $safeLimit"
    )

    cursor?.use {
      val idIndex = it.getColumnIndex("_id")
      val addressIndex = it.getColumnIndex("address")
      val dateIndex = it.getColumnIndex("date")
      val bodyIndex = it.getColumnIndex("body")

      while (it.moveToNext()) {
        val sender = it.getString(addressIndex) ?: continue
        val body = it.getString(bodyIndex) ?: continue
        if (!looksFinancial(sender, body)) continue

        val receivedAtMs = it.getLong(dateIndex)
        readings.pushMap(readingMap(
          source = "sms",
          clientId = "sms:" + hash("\${it.getString(idIndex)}:$sender:$receivedAtMs:$body"),
          receivedAtMs = receivedAtMs,
          sender = sender,
          appIdentifier = null,
          title = null,
          body = body
        ))
      }
    }

    promise.resolve(readings)
  }

  @ReactMethod
  fun isNotificationListenerEnabled(promise: Promise) {
    val enabled = Settings.Secure.getString(
      reactContext.contentResolver,
      "enabled_notification_listeners"
    )
    promise.resolve(enabled?.contains(reactContext.packageName) == true)
  }

  @ReactMethod
  fun openNotificationListenerSettings(promise: Promise) {
    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
    promise.resolve(null)
  }

  @ReactMethod
  fun readActiveNotifications(promise: Promise) {
    val readings = Arguments.createArray()
    val notifications: Array<StatusBarNotification> = TracePayNotificationListener.activeNotificationsSnapshot()

    notifications.forEach { notification ->
      val extras = notification.notification.extras
      val title = extras.getCharSequence("android.title")?.toString()
      val text = extras.getCharSequence("android.text")?.toString()
      val bigText = extras.getCharSequence("android.bigText")?.toString()
      val body = bigText ?: text ?: return@forEach
      val packageName = notification.packageName ?: return@forEach
      if (!looksFinancial(packageName, "$title $body")) return@forEach

      readings.pushMap(readingMap(
        source = "notification",
        clientId = "notification:" + hash("\${notification.key}:$packageName:\${notification.postTime}:$body"),
        receivedAtMs = notification.postTime,
        sender = null,
        appIdentifier = packageName,
        title = title,
        body = body
      ))
    }

    promise.resolve(readings)
  }

  private fun hasReadSmsPermission(): Boolean =
    ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

  private fun readingMap(
    source: String,
    clientId: String,
    receivedAtMs: Long,
    sender: String?,
    appIdentifier: String?,
    title: String?,
    body: String
  ): WritableMap {
    val map = Arguments.createMap()
    map.putString("clientId", clientId)
    map.putString("source", source)
    map.putString("receivedAt", Date(receivedAtMs).toInstant().toString())
    sender?.let { map.putString("sender", it) }
    appIdentifier?.let { map.putString("appIdentifier", it) }
    title?.let { map.putString("title", it) }
    map.putString("body", body)
    map.putMap("metadata", Arguments.createMap())
    return map
  }

  private fun looksFinancial(source: String, body: String): Boolean {
    val haystack = "$source $body".lowercase(Locale.ROOT)
    return FINANCIAL_KEYWORDS.any { haystack.contains(it) }
  }

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }.take(32)
  }

  companion object {
    private const val SMS_PERMISSION_REQUEST = 7411
    private val FINANCIAL_KEYWORDS = listOf(
      "bank", "card", "debit", "credit", "payment", "purchase", "pos", "eft",
      "absa", "capitec", "fnb", "nedbank", "standard bank", "tymebank", "discovery bank"
    )
  }
}
`;

const packageSource = `package com.tracepay.mobile.ingestion

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class TracePayIngestionPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(TracePayIngestionModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`;

const listenerSource = `package com.tracepay.mobile.ingestion

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class TracePayNotificationListener : NotificationListenerService() {
  override fun onListenerConnected() {
    active = this
  }

  override fun onListenerDisconnected() {
    if (active === this) {
      active = null
    }
  }

  companion object {
    @Volatile
    private var active: TracePayNotificationListener? = null

    fun activeNotificationsSnapshot(): Array<StatusBarNotification> =
      active?.activeNotifications ?: emptyArray()
  }
}
`;

function writeNativeFiles(projectRoot) {
  const targetDir = path.join(projectRoot, "android", ...MODULE_DIR);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "TracePayIngestionModule.kt"), moduleSource);
  fs.writeFileSync(path.join(targetDir, "TracePayIngestionPackage.kt"), packageSource);
  fs.writeFileSync(path.join(targetDir, "TracePayNotificationListener.kt"), listenerSource);
}

function addPermission(androidManifest, permission) {
  AndroidConfig.Permissions.addPermission(androidManifest, permission);
}

module.exports = function withTracePayAndroidIngestion(config) {
  config = withAndroidManifest(config, (mod) => {
    addPermission(mod.modResults, "android.permission.READ_SMS");
    addPermission(mod.modResults, "android.permission.RECEIVE_SMS");

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.service = application.service || [];
    const hasService = application.service.some(
      (service) => service.$["android:name"] === "com.tracepay.mobile.ingestion.TracePayNotificationListener"
    );

    if (!hasService) {
      application.service.push({
        $: {
          "android:name": "com.tracepay.mobile.ingestion.TracePayNotificationListener",
          "android:label": "TracePay notification access",
          "android:permission": "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
          "android:exported": "true"
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.service.notification.NotificationListenerService"
                }
              }
            ]
          }
        ]
      });
    }

    return mod;
  });

  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== "kt") {
      return mod;
    }
    if (!mod.modResults.contents.includes("TracePayIngestionPackage")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "import com.facebook.react.defaults.DefaultReactNativeHost",
        "import com.facebook.react.defaults.DefaultReactNativeHost\\nimport com.tracepay.mobile.ingestion.TracePayIngestionPackage"
      );
      mod.modResults.contents = mod.modResults.contents.replace(
        "PackageList(this).packages",
        "PackageList(this).packages.apply { add(TracePayIngestionPackage()) }"
      );
    }
    return mod;
  });

  return withDangerousMod(config, [
    "android",
    (mod) => {
      writeNativeFiles(mod.modRequest.projectRoot);
      return mod;
    }
  ]);
};
