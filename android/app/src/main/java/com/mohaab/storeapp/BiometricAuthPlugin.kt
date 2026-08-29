package com.mohaab.storeapp

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BiometricAuth")
class BiometricAuthPlugin : Plugin() {

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val manager = BiometricManager.from(context)
        val status = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        val result = JSObject()
        result.put("available", status == BiometricManager.BIOMETRIC_SUCCESS)
        call.resolve(result)
    }

    @PluginMethod
    fun verify(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("No activity available")
            return
        }
        val reason = call.getString("reason", "Confirm it's you")

        activity.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(context)
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val res = JSObject()
                    res.put("verified", true)
                    call.resolve(res)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val res = JSObject()
                    res.put("verified", false)
                    call.resolve(res)
                }

                override fun onAuthenticationFailed() {
                    // A single failed attempt (bad fingerprint read) — let the
                    // prompt itself keep retrying, don't resolve yet.
                }
            }

            val prompt = BiometricPrompt(activity, executor, callback)
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Better Store")
                .setSubtitle(reason ?: "Confirm it's you")
                .setNegativeButtonText("Use PIN")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            prompt.authenticate(promptInfo)
        }
    }
}
