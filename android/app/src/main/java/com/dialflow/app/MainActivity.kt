package com.dialflow.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.dialflow.app.data.CampaignStore
import com.dialflow.app.model.CallOutcome
import com.dialflow.app.model.Contact
import com.dialflow.app.telephony.AutoDialerService
import java.util.UUID

private val DialFlowBrand = Color(0xFF0D7A5F)
private val DialFlowDanger = Color(0xFFDC2626)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = CampaignStore(this)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = DialFlowBrand,
                    background = Color(0xFFF8FAFC),
                    surface = Color.White
                )
            ) {
                DialFlowNativeScreen(store = store)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DialFlowNativeScreen(store: CampaignStore) {
    val context = LocalContext.current
    val runtime by AutoDialerService.runtimeState.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    var contacts by remember { mutableStateOf(store.loadContacts()) }
    var script by remember { mutableStateOf(store.loadScript()) }
    var serverUrl by remember { mutableStateOf(store.getServerUrl(BuildConfig.SERVER_BASE_URL)) }
    var statusBanner by remember { mutableStateOf<String?>(null) }

    // Add contact quick inputs
    var newName by remember { mutableStateOf("") }
    var newPhone by remember { mutableStateOf("") }
    var newDetails by remember { mutableStateOf("") }

    val requiredPermissions = remember {
        buildList {
            add(Manifest.permission.CALL_PHONE)
            add(Manifest.permission.READ_PHONE_STATE)
            add(Manifest.permission.RECORD_AUDIO)
            add(Manifest.permission.READ_CONTACTS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }.toTypedArray()
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val callOk = grants[Manifest.permission.CALL_PHONE] == true
        val micOk = grants[Manifest.permission.RECORD_AUDIO] == true
        statusBanner = if (callOk && micOk) {
            "Permissions granted. Ready for automatic calling & AI voice."
        } else {
            "Grant Phone and Microphone permissions in Settings for auto-dialing."
        }
    }

    fun hasCallingPermissions(): Boolean {
        val callOk = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED
        val stateOk = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        val micOk = ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        return callOk && stateOk && micOk
    }

    fun startAutoCampaign() {
        if (!hasCallingPermissions()) {
            permissionLauncher.launch(requiredPermissions)
            return
        }
        val intent = Intent(context, AutoDialerService::class.java).apply {
            action = AutoDialerService.ACTION_START_CAMPAIGN
        }
        ContextCompat.startForegroundService(context, intent)
    }

    fun dialSingleContact(contact: Contact) {
        if (!hasCallingPermissions()) {
            permissionLauncher.launch(requiredPermissions)
            return
        }
        val intent = Intent(context, AutoDialerService::class.java).apply {
            action = AutoDialerService.ACTION_DIAL_CONTACT
            putExtra(AutoDialerService.EXTRA_CONTACT_ID, contact.id)
        }
        ContextCompat.startForegroundService(context, intent)
    }

    fun stopAutoCampaign() {
        val intent = Intent(context, AutoDialerService::class.java).apply {
            action = AutoDialerService.ACTION_STOP_CAMPAIGN
        }
        context.startService(intent)
        contacts = store.loadContacts()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DialFlow", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = Color(0xFF0F172A)
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            TabRow(selectedTabIndex = selectedTab) {
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Queue") })
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Add") })
                Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, text = { Text("Script") })
            }

            if (statusBanner != null) {
                Text(
                    text = statusBanner!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = DialFlowBrand,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }

            when (selectedTab) {
                0 -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Campaign runner card
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = runtime.callPhase,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "${contacts.count { it.outcome == CallOutcome.PENDING }} pending · ${contacts.size} total",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(0xFF475569)
                                )
                                Spacer(Modifier.height(12.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    if (runtime.isRunningCampaign) {
                                        Button(
                                            onClick = { stopAutoCampaign() },
                                            colors = ButtonDefaults.buttonColors(containerColor = DialFlowDanger),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Text("Stop Auto-Dialer")
                                        }
                                    } else {
                                        Button(
                                            onClick = { startAutoCampaign() },
                                            enabled = contacts.any { it.outcome == CallOutcome.PENDING },
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Text("Start Auto-Calling")
                                        }
                                    }
                                    OutlinedButton(
                                        onClick = {
                                            val imported = store.importFromAndroidContacts()
                                            contacts = store.loadContacts()
                                            statusBanner = "Imported ${imported.size} phone contacts."
                                        }
                                    ) {
                                        Text("Phonebook")
                                    }
                                }
                            }
                        }

                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            items(contacts, key = { it.id }) { contact ->
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color.White),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(contact.name, fontWeight = FontWeight.SemiBold)
                                            Text(
                                                "${contact.phone} · ${contact.outcome.label}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = Color(0xFF475569)
                                            )
                                            if (contact.details.isNotBlank()) {
                                                Text(
                                                    contact.details,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = Color(0xFF64748B)
                                                )
                                            }
                                        }
                                        OutlinedButton(onClick = { dialSingleContact(contact) }) {
                                            Text("Call")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                1 -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("Add Contact", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = newName,
                            onValueChange = { newName = it },
                            label = { Text("Full Name") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = newPhone,
                            onValueChange = { newPhone = it },
                            label = { Text("Phone Number") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = newDetails,
                            onValueChange = { newDetails = it },
                            label = { Text("Calling Details / Script Context") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3
                        )
                        Button(
                            onClick = {
                                if (newName.isNotBlank() && newPhone.isNotBlank()) {
                                    val updated = listOf(
                                        Contact(
                                            id = UUID.randomUUID().toString(),
                                            name = newName.trim(),
                                            phone = newPhone.trim(),
                                            details = newDetails.trim()
                                        )
                                    ) + contacts
                                    store.saveContacts(updated)
                                    contacts = updated
                                    newName = ""
                                    newPhone = ""
                                    newDetails = ""
                                    statusBanner = "Added contact to calling queue."
                                    selectedTab = 0
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Add to Calling List")
                        }
                    }
                }

                2 -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("AI Voice & Script", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = serverUrl,
                            onValueChange = {
                                serverUrl = it
                                store.setServerUrl(it)
                            },
                            label = { Text("DialFlow Server URL") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = script.scriptTemplate,
                            onValueChange = {
                                script = script.copy(scriptTemplate = it)
                                store.saveScript(script)
                            },
                            label = { Text("Script Template ({{name}}, {{details}})") },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 4
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Auto-advance to next contact")
                            Switch(
                                checked = script.autoAdvance,
                                onCheckedChange = {
                                    script = script.copy(autoAdvance = it)
                                    store.saveScript(script)
                                }
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Auto-enable Speakerphone on connect")
                            Switch(
                                checked = script.autoSpeakerphone,
                                onCheckedChange = {
                                    script = script.copy(autoSpeakerphone = it)
                                    store.saveScript(script)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
