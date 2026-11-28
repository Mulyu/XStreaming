package com.xstreaming.settings.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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

/**
 * A title + description row with a slider -- the Compose counterpart of
 * shared/ui/SettingRows' SliderRow. [value]/[onChange] are the actual
 * (un-rounded) setting value; [steps] is Compose Slider's own convention of
 * "divisions between the two endpoints, exclusive", derived from [min]/
 * [max]/[step] so callers don't have to compute it themselves.
 */
@Composable
fun SliderRow(
    title: String,
    description: String?,
    min: Float,
    max: Float,
    step: Float,
    value: Float,
    onChange: (Float) -> Unit,
    formatValue: (Float) -> String,
) {
    val steps = if (step > 0f) {
        (Math.round((max - min) / step) - 1).coerceAtLeast(0)
    } else {
        0
    }
    // A local draft while dragging, committed via onChange only once the
    // drag ends -- matching the JS SliderRow this ports, which only ever
    // calls its own onChange once (on the confirm dialog's "Confirm"
    // button), never continuously. onChange persists the whole Settings
    // object through a native MMKV write (see saveSettings()); calling it on
    // every drag frame via Slider's own onValueChange would turn one drag
    // gesture into dozens of redundant JNI/disk writes. remember(value) keys
    // the draft back to the committed value whenever it changes from
    // outside this slider (e.g. a reset), not just at first composition.
    var draft by remember(value) { mutableStateOf(value) }
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(formatValue(draft), style = MaterialTheme.typography.titleMedium)
        }
        if (!description.isNullOrEmpty()) {
            Text(
                description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Slider(
            value = draft,
            onValueChange = { draft = it },
            onValueChangeFinished = { onChange(draft) },
            valueRange = min..max,
            steps = steps,
        )
    }
}
