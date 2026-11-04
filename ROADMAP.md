# Roadmap

DRIFT is used live and grows with real needs from gigs. This is the current plan. Nothing here has
a date, and priorities move with what comes up at actual sets.

## Next

Small, concrete improvements.

- [ ] **Output resolution cap.** Render the output window at about Full HD unless **High
      resolution** is on, so a fullscreen Retina window keeps a high frame rate.
- [ ] **Export / import settings.** Save settings and the MIDI mapping as a JSON file, to move to
      another machine or keep a backup before a gig.
- [ ] **Mood legend.** Explain the coloured mood stripes on scenes (groove / breakdown / both)
      next to the scene lists.
- [ ] **Configurable bar length.** 3, 4 or 7 beats per bar, so transitions, phrases and the
      manual drop also work for music that is not in 4/4.

## Later

Bigger features.

- [ ] **Scene presets.** Store a combination of depth scene, backdrop, palettes and sliders, and
      recall it from one key or pad.
- [ ] **Setlist / timeline.** A planned order of scenes for a set that the autopilot follows.
- [ ] **Clip recording.** Export a few seconds of the output to a video file, for example for
      social media.
- [ ] **Offline app (PWA).** Installable, and runs without a local server or an internet
      connection.
- [ ] **Other browsers.** Today the full feature set (Web MIDI, screen layout) needs Chrome.

## Ideas

Worth exploring, not yet planned.

- [ ] **Ableton Link / OSC sync**, as an alternative to deriving the tempo from audio.
- [ ] **User shaders loaded from a file**, without editing the code.
- [ ] **Phone as a second control surface.**

## Done

- [x] Two-layer compositing (depth + backdrop) with transitions, trails and blend modes
- [x] Audio analysis, kick detection and BPM clock with tap tempo and MIDI clock
- [x] Autopilot, breakdown/drop detection and a programmable manual drop
- [x] MIDI learn, a mapping table and a MiniLab 3 preset
- [x] Fluid and reaction-diffusion simulations
- [x] Input sensitivity control and level meter
- [x] Responsive panel layout
- [x] English UI, tests and CI
