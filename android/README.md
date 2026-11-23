# DialFlow Native Android App (Kotlin + Jetpack Compose)

This is the native Android Studio project for **DialFlow**. It places sequential cellular calls directly through Android's native dialer (`Intent.ACTION_CALL`), monitors call state transitions (`TelephonyCallback`) to advance automatically through your calling list, switches on speakerphone automatically, and streams two-way Gemini Live AI voice via your DialFlow server.

## Native Capabilities Included

- **Direct Sequential Dialing (`CALL_PHONE`)**: Places calls automatically using `Intent.ACTION_CALL` without tapping the dial button for every person.
- **Automatic Call State Detection (`READ_PHONE_STATE`)**: Detects when each call connects (`CALL_STATE_OFFHOOK`) and ends (`CALL_STATE_IDLE`), then waits 3 seconds and dials the next pending contact.
- **Auto-Speakerphone & Real-Time Gemini Live Audio (`RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`)**: Captures 16kHz PCM audio via `AudioRecord`, streams over WebSocket to `/ws/live`, and plays 24kHz Gemini Live AI voice via `AudioTrack` over the phone speaker.
- **Android Phonebook Import (`READ_CONTACTS`)**: One-tap import from your Android device's Contacts list, plus pre-loaded contacts exported from the DialFlow web workspace (`app/src/main/assets/initial_campaign.json`).

## How to Build the APK in Android Studio

1. Unzip `DialFlow-Android-Studio.zip` and open the folder in **Android Studio** (Ladybug or newer).
2. Let Gradle sync dependencies (`Kotlin 2.0`, `Jetpack Compose`, `OkHttp`).
3. Connect an Android device via USB (with USB Debugging enabled) and click **Run**, or choose **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate an installable `.apk`.
4. On first launch, tap **Start Auto-Calling** and grant Phone, Microphone, and Contacts permissions.

## Android OS Telephony Audio Note

Android restricts all third-party native apps from injecting audio directly into the cellular uplink voice channel for security. DialFlow automatically enables speakerphone during calls so the AI voice speaks clearly into the active call and hears the person's response.
