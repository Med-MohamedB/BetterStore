package com.mohaab.storeapp

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : BridgeActivity() {

    private val requiredPermissions = arrayOf(
        Manifest.permission.CAMERA,
        Manifest.permission.VIBRATE
    )

    init {
        registerPlugin(BiometricAuthPlugin::class.java)
        registerPlugin(NativePrintPlugin::class.java)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNeededPermissions()
        createAdAlertsChannel()
        subscribeToAdUpdates()
    }

    private fun requestNeededPermissions() {
        val toRequest = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (toRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, toRequest.toTypedArray(), 1001)
        }
    }

    /** Same channel id/importance AdNotify.js creates from JS (see
     *  www/adNotify.js ensureChannel()) — created here too, natively, so it
     *  is guaranteed to exist from the very first launch, before any JS has
     *  had a chance to run. A push that arrives while the app is
     *  backgrounded or fully closed is displayed entirely by the OS using
     *  this channel (see the default_notification_channel_id meta-data in
     *  AndroidManifest.xml) — if the channel didn't exist yet, that push
     *  would silently fall back to normal (non heads-up) importance
     *  instead of popping up immediately. */
    private fun createAdAlertsChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            "ad-alerts",
            "Offers & promotions",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Lets you know when a new offer or ad is available"
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    /** Subscribes this device to the "ad-updates" FCM topic so a push sent
     *  to that topic (see .github/workflows/send-ad-push.yml, which fires
     *  whenever ad-config.json changes) reaches every install instantly,
     *  even fully closed — no per-device token storage needed anywhere.
     *  Wrapped in try/catch: if google-services.json hasn't been added to
     *  the project yet, Firebase isn't initialized and this would
     *  otherwise crash every single app launch. */
    private fun subscribeToAdUpdates() {
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("ad-updates")
        } catch (e: Throwable) {
            // Firebase not set up yet (no google-services.json committed) —
            // safe to ignore, ad notifications just fall back to local-only
            // (foreground / app-open) delivery until it's added.
            Log.i("MainActivity", "FCM topic subscription skipped: ${e.message}")
        }
    }
}
