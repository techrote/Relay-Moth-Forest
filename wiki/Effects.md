# Effects

Visual effect presets live in:

```text
relay_moth_effects.json
```

Current schema:

```text
relay-moth-effects/v3.99
```

The current file has a bounded active-effect budget:

```json
"max_active": 16
```

## Preset structure

A typical preset:

```json
"lamp_ignite": {
  "kind": 6,
  "life": 1.4,
  "element": "fx_objective",
  "index": 245,
  "params": [1, 10, 0, 0]
}
```

### `kind`

Selects the runtime shader/effect behavior.

This is code-coupled. Inventing a new number does not automatically create a new effect implementation.

### `life`

Effect lifetime in seconds.

### `element`

Semantic LUT element used for its base colour.

Examples:

- `fx_pulse`
- `fx_magic`
- `fx_water`
- `fx_portal`
- `fx_objective`
- `fx_teleport`
- `fx_creature`

### `index`

0–255 LUT index inside the semantic element.

### `params`

Four generic effect parameters. Their exact interpretation depends on `kind`.

Safest approach: copy/tune an existing preset of the same `kind` rather than guessing parameter semantics.

## Objective effect mapping

`objective_map` selects which preset plays for each objective kind.

Current mapping:

```json
{
  "lamp": "lamp_ignite",
  "lantern": "lantern_branch",
  "rivet": "bridge_build",
  "pip": "pip_wake",
  "beacon": "beacon_ping",
  "bell": "bell_song",
  "star": "star_constellation",
  "dawn": "dawn_rise"
}
```

## Current notable presets

- `pulse`
- `objective_generic`
- `teleport`
- `moth_pickup`
- `portal_start`
- `portal_end`
- `lamp_ignite`
- `lantern_branch`
- `bridge_build`
- `pip_wake`
- `beacon_ping`
- `bell_song`
- `star_constellation`
- `dawn_rise`
- `mini_hint`
- `creature_chime`
- `creature_dash`
- `ao_pulse`

## Example: make moth pickups linger longer

Change:

```json
"life": 1.05
```

to, for example:

```json
"life": 1.6
```

inside `moth_pickup`.

## Example: recolour an effect without changing the shader

Change the preset's semantic `element` and/or `index`, or edit that semantic LUT in `relay_moth_pixel_luts.json`.

Prefer this over hard-coding RGB values in shader code.
