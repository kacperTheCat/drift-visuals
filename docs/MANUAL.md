# DRIFT — manual

Everything DRIFT can do, section by section. Names in **bold** match the labels in the app.
For a quick overview, see the [README](../README.md).

## Start

```bash
python3 serve.py 8080
```

Open `http://localhost:8080` in Chrome. Localhost (or HTTPS) is required because the browser only
grants access to audio inputs and MIDI in a secure context.

- **Two screens:** `O` opens the output window on the projector. Details are in [Projector](#projector).
- **One screen:** `F` shows fullscreen without the panel, and `Esc` returns to the panel.

## Getting sound in (best first)

1. **Cable from the mixer to an audio interface.** Connect the booth, rec or second master output of
   the mixer to any USB audio interface, or to the controller's input if it has one. In DRIFT, pick
   that input from the list in the top bar; picking connects right away. The signal is clean, with
   no room noise or feedback, and it does not depend on the club's volume.
2. **Playing from the laptop (Rekordbox, Traktor or Serato on the same Mac).** Install
   [BlackHole 2ch](https://existential.audio/blackhole/), which is free. In "Audio MIDI Setup",
   create a "Multi-Output Device" (controller + BlackHole), or send the master from the DJ software
   to BlackHole. In DRIFT, pick "BlackHole 2ch" from the list.
3. **Microphone (fallback).** This works too. The browser's voice-call processing (noise
   suppression, AGC, echo cancellation) is disabled. Each band has its own automatic normalisation,
   and the kick is detected only in the sub band (35–110 Hz), which dominates in a club. A test on a
   synthetic signal at −82 dB detected 28 of 28 kicks. When the microphone picks up too little,
   raise the **sensitivity** slider next to the meters (0…+40 dB) until the green **IN** meter
   reaches past half. The slider can be assigned to MIDI in Learn mode.
4. **No sound.** Use demo mode and `TAP` (T). To rehearse at home, pick **Audio file…** from the
   list. DRIFT plays the recording and reacts to it like live audio. The visuals keep moving in
   tempo, and the clock holds the BPM on its own.

For a longer set, click **SYNC 1** (Enter) on the first kick of a phrase. The autopilot then counts
its phrases from the right place. After a drop it re-aligns by itself.

## How it works

- **Analysis:** 4 bands (sub, low, mid, high). Each band is normalised to its own peak, which decays
  slowly (AGC). A kick is a sudden jump in the sub band above an adaptive threshold.
- **Clock:** the tempo comes from a histogram of the intervals between kicks, refined with
  regression. The phase locks onto the kicks with a PLL. A breakdown is no kick for 8 beats. A drop
  is two kicks one beat apart after a breakdown.
- **Autopilot:** every 8, 16 or 32 bars it changes the scene (60% of the time) or makes a variation.
  On a breakdown it moves smoothly to a calm scene. On a drop it cuts to a strong scene with a
  flash. The ● dot on a scene adds it to or removes it from the autopilot pool. A manual change
  resets the counter, so the autopilot will not override it right away.

## Manual drop

The **Drop** section is in the left column. The `D` key arms or cancels a drop with the last length
used.

1. Click **1 / 4 / 8 / 16**. The drop lands at the start of a bar that many bars from now. It follows
   the beat grid, so it is worth pressing SYNC at the start of a phrase beforehand. The bar counts
   down bars and beats.
2. **Build-up** during the countdown (pick any):
   - **Blur:** trails grow to the maximum.
   - **Speed-up:** motion gets faster and faster.
   - **Darken:** the image fades out.
   - **Strobe:** eighth notes in the last bar, sixteenths in the last 2 beats.
   - **Glitch:** builds up over the last 2 bars.
   - **Shatter:** the image cracks and falls apart over the whole countdown, then snaps back
     together on the drop.
3. **Drop program:** 4 lists, **Depth**, **Backdrop**, **Depth colours** and **Backdrop colours**.
   - By default they show what is playing now, which means no change.
   - Pick a scene, backdrop, palette or "random", and the field lights up. It comes in with a cut on
     the drop. Picking what is playing clears that field's program.
   - The program clears after the drop.
   - The **On the drop** switches add **Variation** and **Flash**.

On the drop the build-up effects release at once, and the drop becomes the start of a phrase for
the autopilot.

The autopilot does not change scenes during the countdown. The drop buttons can be assigned to MIDI
(Learn or the Mapping window). Clicking the same length again cancels the drop.

## Layers

**Depth** (keys `1`–`0`, then `Q W E R Y U I A J K N`) is the foreground.
- **3D (raymarching):** Arches, Core, Field, Rings, Spiral, Mercury, Gyroid, Crystal, Organism and
  Artery.
- **Flat:** Tunnel, Corridor, Kaleidoscope, Orbits and Pulse.
- **Fractals:** Core (Menger sponge), Crystal (KIFS), Mandelbulb and Apollonius (a flight through
  caves of spheres).
- **Ripples:** glowing spectrum rings. Every half bar, a contour shaped like a circular frequency
  plot is born and spreads outwards with a slight twist.
- **Organic:**
  - **Mycelium:** a flight through a web of fibres with impulses.
  - **Nautilus:** a nautilus spiral; the camera endlessly screws into the centre.
  - **Spine:** a winding chain of vertebrae.
  - **Villi:** a tunnel of waving protrusions.
  - **Seeds:** spinning pods.
- **Liquids (end of the list):**
  - **Ferrofluid:** a black liquid with a magnet drifting beneath it. Spikes grow where the magnet
    is and lengthen with bass and kick.
  - **Lava lamp.**
  - **Vortex:** a funnel that spins faster with the bass.
  - **Ribs:** a ribcage with a spine and a pulsing core. The ribs spread like wings, and a variation
    changes how wide they open.

Clicking a scene crossfades into it. Scenes without a key (past the 21st) are picked by clicking.
The transition time (**cut / 1 beat / 1 bar / 4 bars**) is set under the depth scenes. The backdrop
has its own switch (**cut / 1 / 2 / 4 bars**) under the backdrop list.

**Backdrop** (`G` / `Shift+G`):
- **Basic:** Fog, Glow, Horizon, Moiré, Strata, Scanner, Void (almost black: depth alone on black),
  Dust, Aurora, Raster, Contours and Cells.
- **Julia:** a flowing 2D fractal whose bands spread out in time with the beat.
- **Pond:** calm dark water. Every beat a drop falls at a random spot (stronger on the kick), and
  the bass strengthens the surface wave.
- **Organic:**
  - **Bioluminescence:** fine plankton flashing in a wave every 2 beats.
  - **Ink:** thick, glossy ink in two layers.
  - **Wood grain.**
  - **Leaf:** it rotates, and a pulse flows through the veins.
  - **Mitosis:** cells merge membranes when they touch and divide with a pinch; each drifts along
    its own vector.
  - **Veins:** a pulse from a wandering heart.
- **Liquids (end of the list):** Cymatics (standing waves from frequencies), Caustics, Marbling and
  Oil slick.
- **Simulations** (state lives between frames, see `js/sim.js`):
  - **Fluid:** a real fluid simulation. The kick injects coloured swirls, and the bass keeps
    stirring.
  - **Reaction-diffusion:** Turing patterns growing live. The kick seeds new spots, and a variation
    changes the pattern type (coral, spots, worms or cells). The pattern grows until it stops
    spreading, then slowly recedes and regrows from a few seeds.

The backdrop shows through where the depth is empty or fades into fog.

**Per-layer parameters:**
- Depth has **Intensity**, **Reactivity**, **Motion** (speed, 100 = normal) and **Trails**.
- The backdrop has **Brightness**, **Reactivity** and **Motion**.
- Trails only affect the depth, so the backdrop stays sharp.
- A good starting point is a backdrop that moves slower and reacts less than the depth.

**Balance, blend and colours:**
- **Backdrop ↔ Depth balance** (`← →`, `↓` = centre): 0 is backdrop only, the middle is both layers,
  and 1 is depth only. `L` hides the depth and brings it back later.
- **Blend** (`M`) sets how the depth combines with the backdrop:
  - **Normal:** the depth covers the backdrop.
  - **Screen:** the bright parts of both layers add up.
  - **Mask:** the backdrop shows only inside the depth shapes.
  - **Difference:** where both layers are bright, the image goes dark.
- **Per-layer colours:** depth and backdrop have separate palettes, for example a cold depth over a
  warm backdrop. **Backdrop uses depth colours** joins them back into one.

**Autopilot** changes the backdrop every few phrases, and sometimes the blend mode. In a breakdown it
switches to a calm backdrop and either hides the depth or plays a calm scene. On the drop the depth
comes back with a cut.

## MIDI

1. Connect a controller and click **MIDI** in the top bar. Chrome asks for permission once; after
   that MIDI turns on by itself.
2. Click **Learn**. Assignable elements get a dashed outline.
3. Click a panel element (a scene, slider, button, palette, blend mode and so on), then move a knob
   or fader, or hit a pad or button on the controller. Done. You can assign the next one right away.
4. In Learn mode, right-clicking an element removes its assignment. `Esc` or **Learn** ends Learn
   mode.

**Mapping** (button in the top bar) is a table of all assignments:
- **+ Add: move a control:** move a knob or pad, a row appears, and you pick an action from the list.
- The **Value** and **Last result** columns show live what comes in and what DRIFT did with it (for
  example "slider = 71% (abs)"). You can see straight away whether a control works.
- **Knob mode** is one of auto, absolute, relative 64± or relative 1/127.
  - If the slider jumps from end to end, set **absolute**.
  - If the knob turns endlessly and the slider barely moves, set **relative**.

Other MIDI behaviour:
- Knobs and faders (CC) drive sliders across their full range. Buttons and pads click buttons.
  **Strobe** only runs while you hold the button.
- In Learn mode an **Extra MIDI actions** section appears. It has next/previous depth scene and
  backdrop, next blend mode, balance to centre, colour changes, and **knobs that scroll through
  scenes** (turn the knob and the scenes change one by one).
- Assignments are saved in the browser.
- The status in the bar shows the number of devices and assignments, and the last control received.
  That helps when you do not know what a controller sends.
- **MIDI clock:** if a device or program sends MIDI clock, DRIFT takes the exact BPM from it (CLOCK
  appears in the bar). A Start message also sets the phrase start.

**Arturia MiniLab 3** has a ready-made layout that loads by itself when the controller is connected
and you have no assignments of your own. You can also load it with **MiniLab 3 layout** in Learn
mode:

| MiniLab 3 | DRIFT |
|---|---|
| Knobs 1–4 (CC 86 87 89 90) | Depth: Intensity, Reactivity, Motion, Trails |
| Knobs 5–8 (CC 110 111 116 117) | Backdrop ↔ Depth balance; Backdrop: Brightness, Reactivity, Motion |
| Fader 1 / 2 (CC 14 / 15) | scroll through depth scenes / backdrops |
| Fader 3 / 4 (CC 30 / 31) | free — assign in Learn mode |
| Pads, bank A | Flash, Strobe, Glitch, Depth variation, ◀ ▶ Backdrop, Backdrop variation, SYNC |
| Pads, bank B | Flash, Strobe, Glitch, Depth variation, Depth colours ▶, ◀ ▶ Backdrop, SYNC |
| Buttons CC 109 / 105 / 28 / 107 | TAP, Backdrop variation, Backdrop colours ▶ (×2) |
| Keys from C3 | consecutive depth scenes, one per key (further scenes after Oct+) |

The "Minilab3 MCU/HUI" port (DAW mode) is ignored because it duplicates the faders as pitch bend.
Pitch bend from the normal port (the touch strip) can be assigned like a knob in Learn mode. Every
MIDI message is logged in the browser console (`Cmd+Option+J`) together with whether it is assigned.
`DRIFT.midi.debug = false` turns the log off.

**DJ gear with MIDI:** if a mixer or controller sends MIDI messages or clock, DRIFT receives them.
After connecting, check the MIDI status in the bar. It shows the number of devices and the last
control received (for example `CC21`).

## FPS counter

The counter in the top-right corner of the preview shows frames per second and frame time. With the
output window open, it shows the projector's FPS ("OUTPUT …").
- Green means smooth, yellow means below 55 fps, and red means below 40 fps.
- When it is red, turn off **High resolution** or pick a lighter scene.

A preview hidden in a background tab is throttled by the browser, so it shows less. The window you
are looking at is the one that counts.

The frame rate is also capped by the display's refresh rate. A steady 60 or 75 fps on an external
monitor usually means the monitor's limit, not a performance problem.

## Image quality

Under **Image quality** in the Depth column:
- **Edge smoothing** (on by default): an FXAA filter on the depth layer. It removes jagged edges on
  3D scenes at almost no performance cost.
- **High resolution** (on by default): scenes are rendered at 1.5× resolution and scaled down. This
  gives the most detail at roughly twice the GPU load. The render is never denser than 2 pixels per
  screen pixel, so on Retina screens the option changes little.

## Projector

Do not mirror the displays. In macOS, set the projector as an **extended** display (System Settings
→ Displays, without "Mirror").
1. `O` opens the output window.
2. The first time, Chrome asks for access to the screen layout. Once allowed, the output window opens
   directly on the projector. Before that, you have to drag it there.
3. Clicking the output window makes it fullscreen.

The panel stays on the laptop.

## Shortcuts

| Key | Action |
|---|---|
| `1`–`0`, `Q`–`N` | depth scene (with Shift = cut instead of a crossfade) |
| `G` / `Shift+G` | next / previous backdrop |
| `L` | depth on/off (backdrop only) |
| `← →` / `Shift+← →` / `↓` | backdrop/depth balance / all the way / centre |
| `M` | layer blend mode |
| `Space` | autopilot on/off |
| `T` / `Enter` | tap tempo / phrase start (the BPM can also be typed into the field) |
| `D` | arm / cancel a manual drop |
| `P` / `Shift+P` | next depth / backdrop palette |
| `V` / `Shift+V` | new variation of the depth / backdrop scene |
| `X` / `S` (hold) / `B` | flash / strobe / blackout |
| `Z` (hold) | glitch: RGB split, shifted bands and blocks, in eighth notes |
| `C` | shatter: the image cracks and falls apart into falling shards over 4 bars (with subtle noise beneath); press again to reassemble |
| `[ ]` | depth intensity |
| `F` / `H` / `O` | fullscreen / hide panel / output window |

## Adding your own

- **Scene:** add an object to `js/scenes.js` with `id`, `name`, `layer`, `mood` and `frag`, plus
  `map` for a 3D scene. The available uniforms are described in `COMMON`. A scene that fails to
  compile is marked red in the panel (the error is in its tooltip), and everything else keeps
  running.
- **Palette:** one line in `js/palettes.js`.

## Files

| File | Contents |
|---|---|
| `js/audio.js` | audio input, band analysis, kick detection, BPM clock, demo mode |
| `js/director.js` | state, autopilot, breakdown/drop, building each frame |
| `js/engine.js` | renderer: scene transitions, feedback/trails, flash, blackout |
| `js/sim.js` | stateful simulation scenes (fluid, reaction-diffusion) |
| `js/scenes.js`, `js/palettes.js` | the visual content |
| `js/main.js`, `js/keys.js` | panel, output window and shortcuts |
| `test/` | unit tests (`npm test`) |
