package com.dialflow.app.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import com.dialflow.app.model.CampaignScript
import com.dialflow.app.model.Contact
import com.dialflow.app.model.TranscriptTurn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

enum class VoiceConnectionState {
    IDLE, CONNECTING, LISTENING, SPEAKING, ERROR
}

/**
 * Real-time bidirectional audio client bridging Android AudioRecord (16kHz PCM)
 * and AudioTrack (24kHz PCM) to DialFlow's /ws/live Gemini Live WebSocket server.
 */
class GeminiLiveVoiceClient(
    private val context: Context,
    private val serverBaseUrl: String
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val httpClient = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val _state = MutableStateFlow(VoiceConnectionState.IDLE)
    val state: StateFlow<VoiceConnectionState> = _state.asStateFlow()

    private val _transcript = MutableStateFlow<List<TranscriptTurn>>(emptyList())
    val transcript: StateFlow<List<TranscriptTurn>> = _transcript.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private var webSocket: WebSocket? = null
    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var captureJob: Job? = null
    private var isMuted: Boolean = false

    fun setMuted(muted: Boolean) {
        isMuted = muted
    }

    fun enableSpeakerphone(enable: Boolean) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (enable) {
                    val speaker = audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    }
                    if (speaker != null) {
                        audioManager.setCommunicationDevice(speaker)
                    }
                } else {
                    audioManager.clearCommunicationDevice()
                }
            } else {
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = enable
            }
        } catch (_: SecurityException) {
            // Permission not granted
        }
    }

    fun start(contact: Contact, script: CampaignScript) {
        stop()
        _errorMessage.value = null
        _transcript.value = emptyList()
        _state.value = VoiceConnectionState.CONNECTING

        if (script.autoSpeakerphone) {
            enableSpeakerphone(true)
        }

        val wsUrl = serverBaseUrl
            .trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://") + "/ws/live"

        val request = Request.Builder().url(wsUrl).build()
        setupAudioTrack()

        webSocket = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                val startPayload = JSONObject().apply {
                    put("type", "start")
                    put("voiceName", script.voiceName)
                    put("systemInstruction", script.buildLiveSystemInstruction(contact))
                    put(
                        "openingPrompt",
                        "The call with ${contact.name} has connected. Greet them warmly using the opening script and pause for their reply."
                    )
                }
                ws.send(startPayload.toString())
                startMicCapture(ws)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                try {
                    val msg = JSONObject(text)
                    when (msg.optString("type")) {
                        "status" -> {
                            when (msg.optString("status")) {
                                "connected" -> _state.value = VoiceConnectionState.LISTENING
                                "closed" -> _state.value = VoiceConnectionState.IDLE
                            }
                        }
                        "audio" -> {
                            val b64 = msg.optString("audio")
                            if (b64.isNotEmpty()) {
                                _state.value = VoiceConnectionState.SPEAKING
                                val pcmBytes = Base64.decode(b64, Base64.DEFAULT)
                                audioTrack?.write(pcmBytes, 0, pcmBytes.size)
                            }
                        }
                        "turnComplete" -> {
                            if (_state.value == VoiceConnectionState.SPEAKING) {
                                _state.value = VoiceConnectionState.LISTENING
                            }
                        }
                        "interrupted" -> {
                            audioTrack?.pause()
                            audioTrack?.flush()
                            audioTrack?.play()
                            _state.value = VoiceConnectionState.LISTENING
                        }
                        "inputTranscript" -> appendTurn("contact", msg.optString("text"))
                        "outputTranscript" -> appendTurn("ai", msg.optString("text"))
                        "error" -> {
                            _errorMessage.value = msg.optString("error", "Live voice error")
                            _state.value = VoiceConnectionState.ERROR
                        }
                    }
                } catch (_: Exception) {
                    // Ignore malformed message
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                _errorMessage.value = t.message ?: "Voice WebSocket connection failed"
                _state.value = VoiceConnectionState.ERROR
                stopAudioHardware()
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                if (_state.value != VoiceConnectionState.ERROR) {
                    _state.value = VoiceConnectionState.IDLE
                }
                stopAudioHardware()
            }
        })
    }

    private fun setupAudioTrack() {
        val sampleRate = 24000
        val minBuf = AudioTrack.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(maxOf(minBuf * 2, 8192))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
            .also { it.play() }
    }

    @SuppressLint("MissingPermission")
    private fun startMicCapture(ws: WebSocket) {
        val sampleRate = 16000
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val bufferSize = maxOf(minBuf * 2, 4096)
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        )
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            _errorMessage.value = "Unable to initialize device microphone."
            _state.value = VoiceConnectionState.ERROR
            return
        }

        audioRecord = recorder
        recorder.startRecording()

        captureJob = scope.launch {
            val readBuf = ByteArray(3200) // ~100ms of 16kHz 16-bit mono PCM
            while (isActive) {
                val read = recorder.read(readBuf, 0, readBuf.size)
                if (read > 0 && !isMuted) {
                    val encoded = Base64.encodeToString(readBuf, 0, read, Base64.NO_WRAP)
                    val payload = JSONObject().apply {
                        put("type", "audio")
                        put("audio", encoded)
                    }
                    ws.send(payload.toString())
                }
            }
        }
    }

    private fun appendTurn(speaker: String, chunk: String) {
        val clean = chunk.trim()
        if (clean.isEmpty()) return
        val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val current = _transcript.value.toMutableList()
        val last = current.lastOrNull()
        if (last != null && last.speaker == speaker) {
            current[current.lastIndex] = last.copy(text = "${last.text} $clean".trim())
        } else {
            current.add(TranscriptTurn(speaker = speaker, text = clean, timestamp = time))
        }
        _transcript.value = current
    }

    private fun stopAudioHardware() {
        captureJob?.cancel()
        captureJob = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {
        }
        audioRecord = null

        try {
            audioTrack?.pause()
            audioTrack?.flush()
            audioTrack?.release()
        } catch (_: Exception) {
        }
        audioTrack = null
    }

    fun stop() {
        try {
            webSocket?.send(JSONObject().put("type", "stop").toString())
            webSocket?.close(1000, "Call ended")
        } catch (_: Exception) {
        }
        webSocket = null
        stopAudioHardware()
        _state.value = VoiceConnectionState.IDLE
    }
}
