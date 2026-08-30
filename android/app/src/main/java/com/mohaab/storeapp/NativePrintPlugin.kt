package com.mohaab.storeapp

import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Hands a receipt PDF straight to Android's built-in Print framework
 * (PrintManager) instead of routing through the Share sheet.
 *
 * Why this approach: Android has no public API to silently print to an
 * arbitrary Bluetooth/USB roll printer — every printer brand has its own
 * protocol. What Android DOES have is the system Print framework, and
 * printer manufacturers plug into it by shipping a "Print Service" app
 * (installed separately, e.g. from the printer's own app on the Play
 * Store). Once that's installed, this plugin's print job shows up in the
 * system print dialog exactly like any other document, and the user picks
 * their printer there — often with a one-tap "print" from that point on.
 * This is the same mechanism apps like Chrome and Gmail use for "Print".
 */
@CapacitorPlugin(name = "NativePrint")
class NativePrintPlugin : Plugin() {

    @PluginMethod
    fun printPdf(call: PluginCall) {
        val base64 = call.getString("base64")
        val jobName = call.getString("jobName") ?: "Document"

        if (base64.isNullOrEmpty()) {
            call.reject("Missing base64 PDF data")
            return
        }

        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val tempFile = File(context.cacheDir, "print_${System.currentTimeMillis()}.pdf")
            FileOutputStream(tempFile).use { it.write(bytes) }

            val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            val adapter = ReceiptPrintAdapter(tempFile, jobName)

            val attrs = PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setResolution(PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                .setMinMargins(PrintAttributes.Margins(0, 0, 0, 0))
                .build()

            printManager.print(jobName, adapter, attrs)

            val result = JSObject()
            result.put("opened", true)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Print failed: ${e.message}")
        }
    }

    /** Streams the already-rendered PDF bytes straight into whatever the
     *  print pipeline hands it, page count and layout are already baked
     *  in from the jsPDF side, so this adapter's only job is I/O. */
    private class ReceiptPrintAdapter(
        private val pdfFile: File,
        private val jobName: String
    ) : PrintDocumentAdapter() {

        override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes?,
            cancellationSignal: CancellationSignal?,
            callback: LayoutResultCallback?,
            extras: Bundle?
        ) {
            if (cancellationSignal?.isCanceled == true) {
                callback?.onLayoutCancelled()
                return
            }
            val info = PrintDocumentInfo.Builder(jobName)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .build()
            callback?.onLayoutFinished(info, true)
        }

        override fun onWrite(
            pages: Array<out PageRange>?,
            destination: ParcelFileDescriptor?,
            cancellationSignal: CancellationSignal?,
            callback: WriteResultCallback?
        ) {
            try {
                FileInputStream(pdfFile).use { input ->
                    FileOutputStream(destination?.fileDescriptor).use { output ->
                        input.copyTo(output)
                    }
                }
                callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                callback?.onWriteFailed(e.message)
            }
        }

        override fun onFinish() {
            super.onFinish()
            pdfFile.delete()
        }
    }
}
