package com.dialflow.app.data

import android.content.Context
import android.provider.ContactsContract
import com.dialflow.app.model.CallOutcome
import com.dialflow.app.model.CampaignScript
import com.dialflow.app.model.Contact
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class CampaignStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("dialflow_native_prefs", Context.MODE_PRIVATE)

    fun getServerUrl(defaultUrl: String): String =
        prefs.getString("server_url", null)?.takeIf { it.isNotBlank() } ?: defaultUrl

    fun setServerUrl(url: String) {
        prefs.edit().putString("server_url", url.trim()).apply()
    }

    fun loadContacts(): List<Contact> {
        val stored = prefs.getString("contacts_json", null)
        if (stored != null) {
            return parseContactsJson(stored)
        }
        val bundled = readAssetOrNull("initial_campaign.json")
        if (bundled != null) {
            val root = JSONObject(bundled)
            val arr = root.optJSONArray("contacts")
            if (arr != null) {
                val parsed = parseContactsArray(arr)
                saveContacts(parsed)
                return parsed
            }
        }
        return emptyList()
    }

    fun saveContacts(contacts: List<Contact>) {
        val arr = JSONArray()
        contacts.forEach { c ->
            arr.put(
                JSONObject().apply {
                    put("id", c.id)
                    put("name", c.name)
                    put("phone", c.phone)
                    put("company", c.company)
                    put("details", c.details)
                    put("outcome", c.outcome.key)
                    put("notes", c.notes)
                }
            )
        }
        prefs.edit().putString("contacts_json", arr.toString()).apply()
    }

    fun updateOutcome(contactId: String, outcome: CallOutcome) {
        val updated = loadContacts().map {
            if (it.id == contactId) it.copy(outcome = outcome) else it
        }
        saveContacts(updated)
    }

    fun loadScript(): CampaignScript {
        val stored = prefs.getString("script_json", null)
        if (stored != null) {
            return parseScriptJson(JSONObject(stored))
        }
        val bundled = readAssetOrNull("initial_campaign.json")
        if (bundled != null) {
            val scriptObj = JSONObject(bundled).optJSONObject("script")
            if (scriptObj != null) {
                val parsed = parseScriptJson(scriptObj)
                saveScript(parsed)
                return parsed
            }
        }
        return CampaignScript()
    }

    fun saveScript(script: CampaignScript) {
        val obj = JSONObject().apply {
            put("campaignTitle", script.campaignTitle)
            put("agentName", script.agentName)
            put("organization", script.organization)
            put("callingGoal", script.callingGoal)
            put("voiceName", script.voiceName)
            put("speakingStyle", script.speakingStyle)
            put("scriptTemplate", script.scriptTemplate)
            put("autoAdvance", script.autoAdvance)
            put("autoSpeakerphone", script.autoSpeakerphone)
        }
        prefs.edit().putString("script_json", obj.toString()).apply()
    }

    /**
     * Imports up to 100 contacts directly from the Android device Contacts book
     * (requires READ_CONTACTS runtime permission).
     */
    fun importFromAndroidContacts(limit: Int = 100): List<Contact> {
        val imported = mutableListOf<Contact>()
        val existingPhones = loadContacts().map { it.phone.replace(Regex("[^\\d+]"), "") }.toMutableSet()

        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            null,
            null,
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        )

        cursor?.use {
            val nameCol = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val phoneCol = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (it.moveToNext() && imported.size < limit) {
                val name = it.getString(nameCol)?.trim().orEmpty()
                val phone = it.getString(phoneCol)?.trim().orEmpty()
                val normalized = phone.replace(Regex("[^\\d+]"), "")
                if (name.isNotBlank() && normalized.length >= 6 && existingPhones.add(normalized)) {
                    imported.add(
                        Contact(
                            id = UUID.randomUUID().toString(),
                            name = name,
                            phone = phone,
                            details = "Imported from phone contacts"
                        )
                    )
                }
            }
        }

        if (imported.isNotEmpty()) {
            saveContacts(imported + loadContacts())
        }
        return imported
    }

    private fun readAssetOrNull(fileName: String): String? =
        try {
            context.assets.open(fileName).bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            null
        }

    private fun parseContactsJson(raw: String): List<Contact> =
        try {
            parseContactsArray(JSONArray(raw))
        } catch (_: Exception) {
            emptyList()
        }

    private fun parseContactsArray(arr: JSONArray): List<Contact> {
        val list = mutableListOf<Contact>()
        for (i in 0 until arr.length()) {
            val obj = arr.optJSONObject(i) ?: continue
            list.add(
                Contact(
                    id = obj.optString("id", UUID.randomUUID().toString()),
                    name = obj.optString("name"),
                    phone = obj.optString("phone"),
                    company = obj.optString("company"),
                    details = obj.optString("details"),
                    outcome = CallOutcome.fromKey(obj.optString("outcome")),
                    notes = obj.optString("notes")
                )
            )
        }
        return list
    }

    private fun parseScriptJson(obj: JSONObject): CampaignScript {
        val def = CampaignScript()
        return CampaignScript(
            campaignTitle = obj.optString("campaignTitle", def.campaignTitle),
            agentName = obj.optString("agentName", def.agentName),
            organization = obj.optString("organization", def.organization),
            callingGoal = obj.optString("callingGoal", def.callingGoal),
            voiceName = obj.optString("voiceName", def.voiceName),
            speakingStyle = obj.optString("speakingStyle", def.speakingStyle),
            scriptTemplate = obj.optString("scriptTemplate", def.scriptTemplate),
            autoAdvance = obj.optBoolean("autoAdvance", def.autoAdvance),
            autoSpeakerphone = obj.optBoolean("autoSpeakerphone", def.autoSpeakerphone)
        )
    }
}
