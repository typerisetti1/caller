package com.dialflow.app.telephony

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import com.dialflow.app.BuildConfig
import com.dialflow.app.audio.GeminiLiveVoiceClient
import com.dialflow.app.data.CampaignStore
import com.dialflow.app.model.CallOutcome
import com.dialflow.app.model.Contact
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DialerRuntimeState(
    val isRunningCampaign: Boolean = false,
    val activeContact: Contact? = null,
    val callPhase: String = "Idle",
    val queueRemaining: Int = 0
)

/**
 * Foreground service that places native Android calls via Intent.ACTION_CALL,
 * listens to TelephonyManager call state transitions (OFFHOOK -> IDLE),
 * switches on speakerphone + Gemini Live AI Voice during the call,
 * and automatically advances to the next contact in the queue when the call ends.
 */
class AutoDialerService : Service() {

    companion object {
        const val ACTION_START_CAMPAIGN = "com.dialflow.app.ACTION_START_CAMPAIGN"
        const val ACTION_DIAL_CONTACT = "com.dialflow.app.ACTION_DIAL_CONTACT"
        const val ACTION_STOP_CAMPAIGN = "com.dialflow.app.ACTION_STOP_CAMPAIGN"
        const val EXTRA_CONTACT_ID = "contact_id"
        private const val CHANNEL_ID = "dialflow_campaign_channel"
        private const val NOTIFICATION_ID = 4102

        private val _runtimeState = MutableStateFlow(DialerRuntimeState())
        val runtimeState: StateFlow<DialerRuntimeState> = _runtimeState.asStateFlow()
    }

    private lateinit var store: CampaignStore
    private lateinit var telephonyManager: TelephonyManager
    private lateinit var voiceClient: GeminiLiveVoiceClient
    private val mainHandler = Handler(Looper.getMainLooper())

    private var currentContact: Contact? = null
    private var sawOffhook = false
    private var campaignActive = false
    private var telephonyCallback: TelephonyCallback? = null

    @Suppress("DEPRECATION")
    private var legacyListener: PhoneStateListener? = null

    override fun onCreate() {
        super.onCreate()
        store = CampaignStore(this)
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        voiceClient = GeminiLiveVoiceClient(this, store.getServerUrl(BuildConfig.SERVER_BASE_URL))
        createNotificationChannel()
        registerCallStateObserver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_CAMPAIGN -> {
                campaignActive = true
                promoteToForeground("Starting sequential calling queue...")
                dialNextPending()
            }
            ACTION_DIAL_CONTACT -> {
                val targetId = intent.getStringExtra(EXTRA_CONTACT_ID)
                val contact = store.loadContacts().firstOrNull { it.id == targetId }
                if (contact != null) {
                    campaignActive = store.loadScript().autoAdvance
                    promoteToForeground("Calling ${contact.name}...")
                    placeDirectCall(contact)
                }
            }
            ACTION_STOP_CAMPAIGN -> {
                stopCampaign()
            }
        }
        return START_NOT_STICKY
    }

    private fun dialNextPending() {
        val contacts = store.loadContacts()
        val next = contacts.firstOrNull { it.outcome == CallOutcome.PENDING }
        if (next == null) {
            _runtimeState.value = DialerRuntimeState(
                isRunningCampaign = false,
                activeContact = null,
                callPhase = "All contacts completed",
                queueRemaining = 0
            )
            stopCampaign()
            return
        }
        placeDirectCall(next)
    }

    @SuppressLint("MissingPermission")
    private fun placeDirectCall(contact: Contact) {
        currentContact = contact
        sawOffhook = false
        val pendingCount = store.loadContacts().count { it.outcome == CallOutcome.PENDING }
        _runtimeState.value = DialerRuntimeState(
            isRunningCampaign = campaignActive,
            activeContact = contact,
            callPhase = "Dialing ${contact.name}...",
            queueRemaining = pendingCount
        )
        updateNotification("Dialing ${contact.name} (${contact.phone})")

        val cleanedNumber = contact.phone.replace(Regex("[^\\d+*#]"), "")
        val callIntent = Intent(Intent.ACTION_CALL).apply {
            data = Uri.parse("tel:$cleanedNumber")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(callIntent)
    }

    private fun handleCallStateChanged(state: Int) {
        val active = currentContact ?: return
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (!sawOffhook) {
                    sawOffhook = true
                    _runtimeState.value = _runtimeState.value.copy(
                        callPhase = "Connected · AI Voice Active"
                    )
                    updateNotification("AI Voice talking with ${active.name}")
                    // Wait briefly for carrier audio setup, then activate speakerphone & Gemini Live
                    mainHandler.postDelayed({
                        if (sawOffhook && currentContact?.id == active.id) {
                            voiceClient.start(active, store.loadScript())
                        }
                    }, 1800L)
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (sawOffhook) {
                    sawOffhook = false
                    voiceClient.stop()
                    voiceClient.enableSpeakerphone(false)
                    store.updateOutcome(active.id, CallOutcome.COMPLETED)
                    currentContact = null

                    if (campaignActive && store.loadScript().autoAdvance) {
                        _runtimeState.value = _runtimeState.value.copy(
                            callPhase = "Call ended · Dialing next contact in 3s..."
                        )
                        mainHandler.postDelayed({
                            if (campaignActive) dialNextPending()
                        }, 3000L)
                    } else {
                        _runtimeState.value = _runtimeState.value.copy(
                            isRunningCampaign = false,
                            callPhase = "Call completed"
                        )
                        stopForeground(STOP_FOREGROUND_REMOVE)
                    }
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun registerCallStateObserver() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleCallStateChanged(state)
                }
            }
            telephonyCallback = cb
            try {
                telephonyManager.registerTelephonyCallback(mainExecutor, cb)
            } catch (_: SecurityException) {
            }
        } else {
            @Suppress("DEPRECATION")
            val listener = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleCallStateChanged(state)
                }
            }
            legacyListener = listener
            try {
                @Suppress("DEPRECATION")
                telephonyManager.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
            } catch (_: SecurityException) {
            }
        }
    }

    private fun stopCampaign() {
        campaignActive = false
        sawOffhook = false
        currentContact = null
        mainHandler.removeCallbacksAndMessages(null)
        voiceClient.stop()
        voiceClient.enableSpeakerphone(false)
        _runtimeState.value = DialerRuntimeState(
            isRunningCampaign = false,
            activeContact = null,
            callPhase = "Stopped",
            queueRemaining = store.loadContacts().count { it.outcome == CallOutcome.PENDING }
        )
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun promoteToForeground(text: String) {
        val notification = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DialFlow Auto-Dialer")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "DialFlow Calling Campaign",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        voiceClient.stop()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { telephonyManager.unregisterTelephonyCallback(it) }
        } else {
            @Suppress("DEPRECATION")
            legacyListener?.let {
                telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE)
            }
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
