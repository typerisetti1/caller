package com.dialflow.app.model

enum class CallOutcome(val key: String, val label: String) {
    PENDING("pending", "Pending"),
    COMPLETED("completed", "Answered"),
    CALLBACK("callback", "Callback"),
    NO_ANSWER("no_answer", "No Answer"),
    VOICEMAIL("voicemail", "Voicemail"),
    WRONG_NUMBER("wrong_number", "Wrong #");

    companion object {
        fun fromKey(key: String?): CallOutcome =
            entries.firstOrNull { it.key == key } ?: PENDING
    }
}

data class TranscriptTurn(
    val speaker: String,
    val text: String,
    val timestamp: String
)

data class Contact(
    val id: String,
    val name: String,
    val phone: String,
    val company: String = "",
    val details: String = "",
    val outcome: CallOutcome = CallOutcome.PENDING,
    val notes: String = ""
)

data class CampaignScript(
    val campaignTitle: String = "Outbound Calling Campaign",
    val agentName: String = "Maya",
    val organization: String = "Northstar Care",
    val callingGoal: String = "Confirm appointments or renewals and answer quick questions.",
    val voiceName: String = "Zephyr",
    val speakingStyle: String = "Warm, natural, concise phone voice",
    val scriptTemplate: String =
        "Hi {{name}}, this is {{agent}} calling from {{organization}} regarding {{details}}. Does that still work well for you?",
    val autoAdvance: Boolean = true,
    val autoSpeakerphone: Boolean = true
) {
    fun interpolateFor(contact: Contact): String {
        val firstName = contact.name.trim().split(Regex("\\s+")).firstOrNull().orEmpty().ifBlank { "there" }
        return scriptTemplate
            .replace(Regex("\\{\\{\\s*name\\s*\\}\\}", RegexOption.IGNORE_CASE), contact.name.ifBlank { "there" })
            .replace(Regex("\\{\\{\\s*first_name\\s*\\}\\}", RegexOption.IGNORE_CASE), firstName)
            .replace(Regex("\\{\\{\\s*company\\s*\\}\\}", RegexOption.IGNORE_CASE), contact.company.ifBlank { "your team" })
            .replace(Regex("\\{\\{\\s*details\\s*\\}\\}", RegexOption.IGNORE_CASE), contact.details.ifBlank { "your upcoming request" })
            .replace(Regex("\\{\\{\\s*agent\\s*\\}\\}", RegexOption.IGNORE_CASE), agentName.ifBlank { "your assistant" })
            .replace(Regex("\\{\\{\\s*organization\\s*\\}\\}", RegexOption.IGNORE_CASE), organization.ifBlank { "our team" })
            .trim()
    }

    fun buildLiveSystemInstruction(contact: Contact): String {
        val merged = interpolateFor(contact)
        return buildString {
            appendLine("You are $agentName from $organization speaking on a live phone call.")
            appendLine("You are calling ${contact.name}${if (contact.company.isNotBlank()) " (${contact.company})" else ""}.")
            appendLine("Contact details: ${contact.details.ifBlank { "General follow-up." }}")
            appendLine("Calling goal: $callingGoal")
            appendLine("Speaking style: $speakingStyle")
            appendLine("Opening script reference: \"$merged\"")
            appendLine("Speak naturally in short 1-3 sentence turns and wait for the contact to respond.")
        }
    }
}
