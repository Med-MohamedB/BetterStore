package com.mohaab.storeapp

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Triggers Android's own APK install flow for a file already downloaded
 * to disk (see www/selfUpdate.js, which handles the download itself via
 * @capacitor/file-transfer before calling this).
 *
 * IMPORTANT — this is a hard Android platform limitation, not a choice
 * made here: the OS ALWAYS shows its own "Install this app?" confirmation
 * dialog for any app not installed through the Play Store, and a real tap
 * from the person holding the phone is required on it every single time.
 * No plugin, on any app, can script around that one tap — it's Android's
 * core anti-malware protection. Everything up to that point (checking for
 * updates, downloading, showing progress, requesting the "allow installs
 * from this app" permission) can be fully automatic; the final install
 * confirmation cannot.
 */
@CapacitorPlugin(name = "SelfUpdate")
class SelfUpdatePlugin : Plugin() {

    /** Whether this app is currently allowed to prompt Android to install
     *  other APKs (i.e. itself, when updating). Android 8+ only — always
     *  true on older versions where this permission model doesn't exist. */
    @PluginMethod
    fun canInstallPackages(call: PluginCall) {
        val allowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        val result = JSObject()
        result.put("allowed", allowed)
        call.resolve(result)
    }

    /** Opens the system settings screen where the person toggles "Allow
     *  from this source" for this app specifically. There's no way to
     *  grant this permission programmatically — same category of
     *  protection as the install-confirmation tap above. Once they
     *  return to the app (see the appStateChange resume listener in
     *  www/app.js), the JS side re-checks canInstallPackages(). */
    @PluginMethod
    fun requestInstallPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
            intent.data = Uri.parse("package:" + context.packageName)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
        call.resolve()
    }

    /** Launches Android's own package installer for the given APK file
     *  path. This call returning successfully only means the install
     *  SCREEN was opened — not that the install itself finished. There is
     *  deliberately no reliable way to be notified "the install
     *  succeeded" without the app being killed/relaunched, which is why
     *  cleanup of the downloaded file happens on the NEXT app launch (see
     *  www/selfUpdate.js) rather than here. */
    @PluginMethod
    fun installApk(call: PluginCall) {
        val path = call.getString("path")
        if (path == null) {
            call.reject("Missing 'path'")
            return
        }
        val file = File(path)
        if (!file.exists()) {
            call.reject("File does not exist: $path")
            return
        }

        try {
            val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to start install: ${e.message}", e)
        }
    }
}
