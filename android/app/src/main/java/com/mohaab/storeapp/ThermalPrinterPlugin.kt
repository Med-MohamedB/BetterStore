package com.mohaab.storeapp

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Talks to Bluetooth Classic (SPP / RFCOMM) receipt printers — the cheap
 * 58mm / 80mm ESC/POS thermal printers small shops actually use. All this
 * plugin does is move raw bytes: www/printer.js builds the ESC/POS bytes
 * (text commands, native barcode, or a raster image) and hands them over
 * here as base64.
 *
 * Why a small custom plugin instead of a third-party Capacitor one: the
 * ones that exist either bundle a vendor SDK binary or aren't kept current
 * for Capacitor 8, and this is ~one screen of Bluetooth Classic code that
 * follows the same pattern as NativePrintPlugin / SelfUpdatePlugin.
 *
 * Scope note: Bluetooth Classic only. A printer that speaks BLE only (a
 * minority of very small "mini" printers) will not show up as printable.
 *
 * Method names deliberately avoid checkPermissions / requestPermissions —
 * Capacitor's Plugin base class already owns those two names.
 */
@SuppressLint("MissingPermission")
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "btConnect"),
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN], alias = "btScan"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "btLocation")
    ]
)
class ThermalPrinterPlugin : Plugin() {

    companion object {
        /** The standard Serial Port Profile UUID every SPP printer answers on. */
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val PAIR_TIMEOUT_MS = 60_000L
    }

    /** Bluetooth I/O (connect can block for many seconds) must never run on
     *  Capacitor's shared plugin thread — it would stall every other
     *  plugin call — so all printing goes through this one worker. */
    private val io = Executors.newSingleThreadExecutor()

    private var discoveryReceiver: BroadcastReceiver? = null
    private val discovered = LinkedHashMap<String, JSObject>()

    @Volatile
    private var discovering = false

    private val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    // --- permissions ------------------------------------------------------

    /** Android 12+ needs BLUETOOTH_CONNECT to list/connect to paired
     *  devices; before that the legacy BLUETOOTH permission is an
     *  install-time (normal) permission, so there is nothing to ask. */
    private fun hasConnectPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    /** Scanning for nearby devices: BLUETOOTH_SCAN on Android 12+, and the
     *  location permission on Android 11 and older. */
    private fun hasScanPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }

    @PluginMethod
    fun getState(call: PluginCall) {
        val a = adapter
        val res = JSObject()
        res.put("supported", a != null)
        res.put("enabled", a != null && a.isEnabled)
        res.put("connectGranted", hasConnectPermission())
        res.put("scanGranted", hasScanPermission())
        call.resolve(res)
    }

    @PluginMethod
    fun askPermissions(call: PluginCall) {
        val forScan = call.getBoolean("forScan", false) == true
        val needed = ArrayList<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (!hasConnectPermission()) needed.add("btConnect")
            if (forScan && !hasScanPermission()) needed.add("btScan")
        } else if (forScan && !hasScanPermission()) {
            needed.add("btLocation")
        }
        if (needed.isEmpty()) {
            resolvePermissions(call)
            return
        }
        requestPermissionForAliases(needed.toTypedArray(), call, "permissionsCallback")
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        resolvePermissions(call)
    }

    private fun resolvePermissions(call: PluginCall) {
        val res = JSObject()
        res.put("connectGranted", hasConnectPermission())
        res.put("scanGranted", hasScanPermission())
        call.resolve(res)
    }

    // --- devices ----------------------------------------------------------

    private fun deviceToJson(d: BluetoothDevice, bonded: Boolean): JSObject {
        val o = JSObject()
        val name: String = try { d.name ?: "" } catch (e: SecurityException) { "" }
        val major: Int = try { d.bluetoothClass?.majorDeviceClass ?: -1 } catch (e: SecurityException) { -1 }
        o.put("name", name)
        o.put("address", d.address)
        o.put("bonded", bonded)
        o.put("majorClass", major)
        return o
    }

    @PluginMethod
    fun listPaired(call: PluginCall) {
        val a = adapter
        if (a == null) {
            call.reject("Bluetooth is not supported on this device", "BT_UNSUPPORTED")
            return
        }
        if (!hasConnectPermission()) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
            return
        }
        try {
            val arr = JSArray()
            a.bondedDevices?.forEach { arr.put(deviceToJson(it, true)) }
            val res = JSObject()
            res.put("devices", arr)
            call.resolve(res)
        } catch (e: SecurityException) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
        }
    }

    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        val a = adapter
        if (a == null) {
            call.reject("Bluetooth is not supported on this device", "BT_UNSUPPORTED")
            return
        }
        if (!a.isEnabled) {
            call.reject("Bluetooth is turned off", "BT_OFF")
            return
        }
        if (!hasScanPermission() || !hasConnectPermission()) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
            return
        }

        stopDiscoveryInternal()
        synchronized(discovered) { discovered.clear() }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val i = intent ?: return
                when (i.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val dev = IntentCompat.getParcelableExtra(
                            i, BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java
                        ) ?: return
                        synchronized(discovered) {
                            discovered[dev.address] =
                                deviceToJson(dev, dev.bondState == BluetoothDevice.BOND_BONDED)
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> discovering = false
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
        discoveryReceiver = receiver

        discovering = try { a.startDiscovery() } catch (e: SecurityException) { false }
        if (!discovering) {
            stopDiscoveryInternal()
            call.reject("Could not start scanning", "SCAN_FAILED")
            return
        }
        call.resolve()
    }

    /** JS polls this every second or so while a scan is running — polling
     *  instead of native->JS events keeps this independent of how the
     *  Capacitor bridge wires listeners for native-only plugins. */
    @PluginMethod
    fun getDiscovery(call: PluginCall) {
        val arr = JSArray()
        synchronized(discovered) { discovered.values.forEach { arr.put(it) } }
        val res = JSObject()
        res.put("discovering", discovering)
        res.put("devices", arr)
        call.resolve(res)
    }

    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        stopDiscoveryInternal()
        call.resolve()
    }

    private fun stopDiscoveryInternal() {
        try { adapter?.cancelDiscovery() } catch (e: SecurityException) { /* nothing to cancel */ }
        discoveryReceiver?.let {
            try { context.unregisterReceiver(it) } catch (e: IllegalArgumentException) { /* already gone */ }
        }
        discoveryReceiver = null
        discovering = false
    }

    // --- pairing ----------------------------------------------------------

    /** Waits (up to a minute) for the system pairing dialog the person
     *  answers to end one way or the other, then settles the JS call. */
    private inner class BondWatcher(
        private val device: BluetoothDevice,
        private val call: PluginCall
    ) : BroadcastReceiver() {
        private val handler = Handler(Looper.getMainLooper())
        private var done = false
        private val timeout = Runnable { finish(false, "Pairing timed out", "PAIR_TIMEOUT") }

        fun start() {
            val filter = IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            ContextCompat.registerReceiver(
                this@ThermalPrinterPlugin.context, this, filter, ContextCompat.RECEIVER_EXPORTED
            )
            handler.postDelayed(timeout, PAIR_TIMEOUT_MS)
        }

        override fun onReceive(ctx: Context?, intent: Intent?) {
            val i = intent ?: return
            if (i.action != BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
            val dev = IntentCompat.getParcelableExtra(
                i, BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java
            ) ?: return
            if (dev.address != device.address) return
            val state = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
            val previous = i.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.ERROR)
            if (state == BluetoothDevice.BOND_BONDED) {
                finish(true, null, null)
            } else if (state == BluetoothDevice.BOND_NONE && previous == BluetoothDevice.BOND_BONDING) {
                finish(false, "Pairing was declined or failed", "PAIR_FAILED")
            }
        }

        fun finish(ok: Boolean, message: String?, code: String?) {
            if (done) return
            done = true
            handler.removeCallbacks(timeout)
            try {
                this@ThermalPrinterPlugin.context.unregisterReceiver(this)
            } catch (e: IllegalArgumentException) { /* already unregistered */ }
            if (ok) {
                val res = JSObject()
                res.put("bonded", true)
                call.resolve(res)
            } else {
                call.reject(message, code)
            }
        }
    }

    @PluginMethod
    fun pair(call: PluginCall) {
        val address = call.getString("address")
        val a = adapter
        if (a == null) {
            call.reject("Bluetooth is not supported on this device", "BT_UNSUPPORTED")
            return
        }
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address)) {
            call.reject("Invalid printer address", "BAD_ADDRESS")
            return
        }
        if (!hasConnectPermission()) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
            return
        }
        try {
            val device = a.getRemoteDevice(address)
            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                val res = JSObject()
                res.put("bonded", true)
                call.resolve(res)
                return
            }
            stopDiscoveryInternal() // pairing while a scan is running is unreliable on many phones
            val watcher = BondWatcher(device, call)
            watcher.start()
            if (!device.createBond()) {
                // Couldn't even start — settle now (the watcher's own timeout
                // would otherwise keep the call open for a full minute).
                watcher.finish(false, "Could not start pairing", "PAIR_FAILED")
            }
        } catch (e: SecurityException) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
        }
    }

    // --- printing ---------------------------------------------------------

    /** Opens an RFCOMM connection, streams the bytes, and closes again.
     *  A fresh connection per print is deliberate: a cached socket to a
     *  printer that has since been switched off or walked out of range is
     *  the classic source of prints that silently vanish. */
    @PluginMethod
    fun print(call: PluginCall) {
        val address = call.getString("address")
        val data = call.getString("data")
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address)) {
            call.reject("Invalid printer address", "BAD_ADDRESS")
            return
        }
        if (data.isNullOrEmpty()) {
            call.reject("Nothing to print", "NO_DATA")
            return
        }
        val a = adapter
        if (a == null) {
            call.reject("Bluetooth is not supported on this device", "BT_UNSUPPORTED")
            return
        }
        if (!a.isEnabled) {
            call.reject("Bluetooth is turned off", "BT_OFF")
            return
        }
        if (!hasConnectPermission()) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
            return
        }
        val bytes: ByteArray = try {
            Base64.decode(data, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            call.reject("Print data was not valid base64", "NO_DATA")
            return
        }
        val chunkSize = (call.getInt("chunkSize") ?: 512).coerceIn(64, 4096)
        val chunkDelayMs = (call.getInt("chunkDelayMs") ?: 8).coerceIn(0, 200).toLong()

        io.execute { doPrint(call, a, address, bytes, chunkSize, chunkDelayMs) }
    }

    private fun doPrint(
        call: PluginCall,
        a: BluetoothAdapter,
        address: String,
        bytes: ByteArray,
        chunkSize: Int,
        chunkDelayMs: Long
    ) {
        var socket: BluetoothSocket? = null
        var stage = "CONNECT_FAILED"
        try {
            try { a.cancelDiscovery() } catch (e: SecurityException) { /* not scanning */ }
            val device = a.getRemoteDevice(address)

            socket = tryConnect { device.createRfcommSocketToServiceRecord(SPP_UUID) }
                ?: tryConnect { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) }
                ?: tryConnect { fallbackSocket(device) }
            if (socket == null) {
                call.reject("Could not connect to the printer", "CONNECT_FAILED")
                return
            }

            stage = "WRITE_FAILED"
            val out = socket.outputStream
            var offset = 0
            while (offset < bytes.size) {
                val len = minOf(chunkSize, bytes.size - offset)
                out.write(bytes, offset, len)
                offset += len
                // Cheap printers have tiny receive buffers; a short pause
                // between chunks keeps a long raster image from overrunning
                // them and coming out as garbage.
                if (chunkDelayMs > 0) Thread.sleep(chunkDelayMs)
            }
            out.flush()

            // write() returns once the phone's Bluetooth stack has QUEUED the
            // bytes, not once the printer has them — closing right away can
            // cut the tail of the receipt off. Give it time proportional to
            // the size before hanging up.
            Thread.sleep((400L + bytes.size / 80L).coerceAtMost(4000L))

            val res = JSObject()
            res.put("bytes", bytes.size)
            call.resolve(res)
        } catch (e: SecurityException) {
            call.reject("Bluetooth permission not granted", "NO_PERMISSION")
        } catch (e: IOException) {
            call.reject(e.message ?: "Printing failed", stage)
        } catch (e: InterruptedException) {
            call.reject("Printing was interrupted", "WRITE_FAILED")
        } catch (e: Exception) {
            call.reject(e.message ?: "Printing failed", stage)
        } finally {
            try { socket?.close() } catch (e: IOException) { /* nothing more to do */ }
        }
    }

    private fun tryConnect(create: () -> BluetoothSocket): BluetoothSocket? {
        var s: BluetoothSocket? = null
        return try {
            s = create()
            s.connect()
            s
        } catch (e: Exception) {
            try { s?.close() } catch (ignored: IOException) { /* failed attempt, discard */ }
            null
        }
    }

    /** Last resort for the odd printer that doesn't advertise the SPP
     *  service record: the hidden createRfcommSocket(channel 1). Wrapped by
     *  tryConnect, so if the platform blocks the reflective call it simply
     *  counts as one more failed attempt. */
    private fun fallbackSocket(device: BluetoothDevice): BluetoothSocket {
        val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        return method.invoke(device, 1) as BluetoothSocket
    }

    // --- shortcuts to system screens -------------------------------------

    @PluginMethod
    fun openBluetoothSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    override fun handleOnDestroy() {
        stopDiscoveryInternal()
        io.shutdown()
        super.handleOnDestroy()
    }
}
