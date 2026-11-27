package com.xstreaming.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** One labeled value this settings row can be set to. */
data class SettingOption<T>(val value: T, val label: String)

/**
 * A title + description row that expands into a radio-button list of
 * [options] when tapped -- the Compose counterpart of shared/ui/SettingRows'
 * ChoiceRow, minus the RN TV-focus handling that has no meaning here.
 */
@Composable
fun <T> ChoiceRow(
    title: String,
    description: String?,
    options: List<SettingOption<T>>,
    value: T,
    onChange: (T) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (!description.isNullOrEmpty()) {
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        options.forEach { option ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(
                        selected = option.value == value,
                        onClick = { onChange(option.value) },
                    )
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(selected = option.value == value, onClick = { onChange(option.value) })
                Text(option.label, modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

/** A title + description row with a trailing on/off switch. */
@Composable
fun SwitchRow(
    title: String,
    description: String?,
    value: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onChange(!value) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (!description.isNullOrEmpty()) {
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Switch(checked = value, onCheckedChange = onChange)
    }
}
