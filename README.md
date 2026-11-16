# UNDER — Online Sound Listening Archive (AR5801)

A one-page, mobile-first listening companion for the A0 panels. It has two native audio players, for Case 53 Yishun and Case 437 Bukit Panjang, with no autoplay, cookies, analytics or sign-in.

```
under-sound-archive/
├── index.html
├── styles.css
├── audio/
│   ├── case53_existing_synthetic.mp3
│   ├── case53_proposed_synthetic.mp3
│   ├── case437_existing_synthetic.mp3
│   └── case437_proposed_synthetic.mp3
├── video/
│   ├── case437_sequence_train_approach.mp4
│   └── case437_sequence_poster.jpg      still frame (6.0 s) from the same video
├── assets/            mobile + desktop screenshots
├── make_qr.py         makes the panel QR code once the URL is final
└── README.md
```

## Audio provenance (approved files only)

| Page file | Source master (kept unchanged, outside the web folder) | SHA-256 of master | Duration |
|---|---|---|---|
| `audio/case53_existing_synthetic.mp3` | `Internal_Review/synthetic_baselines_53_437/audio/case53_baseline.wav` | `0d7a20de…a1cf35f` | 0:30 |
| `audio/case53_proposed_synthetic.mp3` | `Internal_Review/AR5801_post_intervention_audio/audio_wav/Case53B_FILTER_INTRODUCE_after.wav` (53B: FILTER + INTRODUCE, filtered traffic + wind chimes) | `4b9f04aa…b8563` | 0:30 |
| `audio/case437_existing_synthetic.mp3` | `Internal_Review/synthetic_baselines_53_437/audio/case437_baseline.wav` | `2db7877b…ae64962d` | 0:30 |
| `audio/case437_proposed_synthetic.mp3` | `Internal_Review/AR5801_post_intervention_audio/audio_wav/case437_variations/Case437_V4_piano_melody_after.wav` (REACT + TRANSFORM, V4 piano melody) | `a3c00273…be115fd31` | 0:30 |
| `video/case437_sequence_train_approach.mp4` | `Final/9. Video Experience/B_PrototypeB_audio_synced_rev02.mp4` (copied byte-for-byte, not re-encoded) | `a08f1512…bee92d` | 0:28.8 |

- **Source set:** the updated 30-second set (README_methodology.md in that folder). It is the one the frequency analysis and post-intervention mixes use. The older 60-second `synthetic_baselines/` set is superseded and not used here.
- **Encoding:** MP3, 192 kbps, 44.1 kHz stereo, 0:30.
- **Levels:** no per-file normalisation. Both masters already share one common mastering gain (run_log: −2.04 dB). Case 437 stays about 6.6 LU quieter than Case 53 (−22.8 vs −16.2 LUFS integrated, measured on the masters), which is the intended relative dynamic. No calibrated playback level is claimed.
- **Proposed audio:** each case has a second, proposed-condition player.
  - The masters come from the documented post-intervention pipeline. They are built from the same stems and the same gain reference as the baselines, with nothing normalised, compressed or limited.
  - They are encoded with the same settings as the existing files (MP3 192 kbps, 44.1 kHz stereo), so before/after levels compare as intended.
  - Measured on the masters:
    - Case 53: existing −16.2, proposed −20.5 LUFS integrated.
    - Case 437: existing −22.8, proposed −20.5 LUFS integrated.

    These are relative file levels, not site SPL.
- **Choices to confirm:**
  - **Case 437:** uses V4 piano melody, the version copied to `Internal_Review/` and used in the post-intervention soundscape plans. The documented base scenario `Case437_REACT_TRANSFORM_after.wav` (piano chords) is an alternative. To swap, encode it to the same file name.
  - **Case 53:** uses the documented 53B master. A later `Internal_Review/Sound/Case53B_FILTER_INTRODUCE_after_black_traffic_reduced.mp4` (5 Nov, −24.1 LUFS) exists, but only as a black-screen MP4 with no WAV master or documentation, so it was not used.
- **Video:** the Prototype B (Sequence) rev02 demonstration: 28.8 s, 25 fps, H.264 High 1920×1356, AAC stereo, starts playing before it fully downloads, 3.5 MB.
  - It is a conceptual visualisation made from 12 still images (2.4 s holds) with a synthesised soundtrack: train approach, stop and departure, plus an original bell score from the modules.
  - It is not footage and not an acoustic simulation; the frames carry that caption.
  - The module sound in the video differs from the V4 proposed audio, and the page says so.
  - The poster image is a frame from the video at 6.0 s.

## Replace an audio or video file (the URL never changes)

1. Export the new master WAV and keep it in the project folder.
2. Convert it with the same file name, so the page needs no edits:
   `ffmpeg -i case53_baseline.wav -codec:a libmp3lame -b:a 192k -ar 44100 audio/case53_existing_synthetic.mp3`
3. Proposed audio: `ffmpeg -i <proposed master>.wav -codec:a libmp3lame -b:a 192k -ar 44100 audio/case53_proposed_synthetic.mp3` (or `case437_…`). Do not loudness-normalise the before/after pairs separately.
4. Video: copy the new MP4 (H.264 + AAC) over `video/case437_sequence_train_approach.mp4`. Remake the poster with `ffmpeg -ss 6 -i video/case437_sequence_train_approach.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 video/case437_sequence_poster.jpg`. If the length changes, update "28.8-second demonstration" and check the label.
5. If any duration changes, update its `0:30` label in `index.html`.
6. Commit and push (see below). The URL stays the same, so the printed QR code keeps working.

## Publish on GitHub Pages (free, HTTPS)

1. On github.com, create a **public** repository named `under-sound-archive`.
2. Upload the contents of this folder to the repository root, using **Add file → Upload files** (drag everything in) or git:
   ```
   git init && git add . && git commit -m "UNDER listening page"
   git branch -M main && git remote add origin https://github.com/YOUR-USERNAME/under-sound-archive.git && git push -u origin main
   ```
3. In the repository, go to **Settings → Pages → Build and deployment**. Choose *Deploy from a branch*, then `main`, then `/ (root)`, and save.
4. After a minute the page is live at `https://YOUR-USERNAME.github.io/under-sound-archive/`.
5. Open that URL in a private window on a phone using mobile data, and play both recordings.

## Make the QR code (only once the URL is final)

```
python3 make_qr.py https://YOUR-USERNAME.github.io/under-sound-archive/
```

This writes:
- `qr/UNDER_listen_QR.svg` (vector, 30 mm, for InDesign);
- `qr/UNDER_listen_QR.png` (1200 px);
- `qr/UNDER_listen_QR_labelled.svg`, with **SCAN TO LISTEN — SYNTHETIC SOUNDSCAPES** and the short URL underneath.

The script decodes the code to verify it. Place it on Panel 07 beside the existing-condition soundscape analysis, at 25–35 mm with the white quiet zone intact. Test it from a printed proof at viewing distance. Never change the URL after printing; update the content at that URL instead.

## QC checklist

- [x] 53 = Yishun, Barrier / Filter + Introduce; 437 = Bukit Panjang, Sequence / React + Transform
- [x] Approved files only (hashes above). Every player is labelled Existing or Proposed (BEFORE / AFTER), and each is synthetic. The video is labelled as a design demonstration (conceptual visualisation, not footage or simulation).
- [x] Methodology note: synthetic, not field recordings or SPL measurements
- [x] No autoplay. Native controls (play/pause, seek, volume). Fallback link. Clear message if a file is missing.
- [x] Tested in headless Chrome at 375 px (no horizontal scroll, 16 px body text) and at 1280 px.
  - All four MP3s load (0:30) and the video loads (0:28.8).
  - Nothing autoplays, loops or starts muted. The video plays with sound after a tap.
  - Missing-file messages verified for the new players and the video.
- [ ] Published URL tested in a private window on iOS Safari and Android Chrome (after deployment)
- [ ] QR code generated for the final URL and tested from a printed proof

---

## Generate your own soundscape (added 16 Nov 2026)

One extra section after Case 437, before the footer. Nothing in the case sections, media files, URL or QR destination changed.

### How it works (browser-only, no server)
GitHub Pages cannot run a backend, and no Python host was available before the review, so the whole workflow runs in the visitor's browser:

1. **Upload**: JPG/PNG/WebP, max 10 MB and 50 megapixels, resized on the device to 1024 px on the longest side. The image is never uploaded or stored; Reset or closing the page discards it.
2. **Analyze**: on the visitor's click, `soundscape-generator.js` loads Transformers.js 3.8.1 from jsDelivr and runs **SegFormer-B0 fine-tuned on Cityscapes** (`Xenova/segformer-b0-finetuned-cityscapes-768-768`, 8-bit ONNX, about 4.4 MB) from Hugging Face. First use downloads about 8 MB in total. The model labels every pixel with one of 19 classes.
   - Percentages = pixels of each category ÷ all pixels of the resized image. The grouping is in `generator/class_mapping.json`.
   - This is **not** the UNDER research model (Mask2Former Swin-L, Mapillary Vistas), and the page says so.
   - If the model cannot load (offline, blocked CDN, old phone) or takes over 2 minutes, the page says so and offers **Describe the scene myself**. Visitors then pick Not visible / Visible / Dominant per feature. No percentages are shown in that mode, and it is labelled "no image analysis was performed".
3. **Listen**: `generator/audio_rules.json` turns cues + visitor assumptions into stems. Every stem is synthesised in the browser with the Web Audio API from seeded noise and oscillators: no recordings and no AR5801 stems, so there are no licensing or provenance issues.
   - Rendered offline to a 30 s, 44.1 kHz stereo WAV.
   - Fades 1.5 s in and 2 s out.
   - Final gain = min(peak −1 dBFS, RMS −20 dBFS), about −18 LUFS, close to the case recordings.
   - The same image and settings always give the same audio.

### Mapping (feature / assumption → stem)
| Trigger | Stem | Labelled as |
|---|---|---|
| always | Distant urban hum | Default |
| road or vehicles visible, or traffic set | Traffic bed + pass-bys (unknown 2, low 1, medium 3, high 6) | Image cue / Your assumption |
| bus or truck visible | first pass-by is heavy | Image cue |
| motorcycle/bicycle visible | second pass-by is a motorcycle | Image cue |
| vegetation visible / dominant | Leaves and wind; 2 / 4 bird calls | Image cue |
| pedestrian activity set (1/3/6 walkers), or people visible when unknown (2, or 3 if dominant) | Footsteps | Your assumption / Image cue |
| **Rail nearby = Yes only** | One overhead train pass-by at 9–23 s | Your assumption |
| built visible/dominant, reduced by open sky | Hard-surface reflections | Image cue |

A "train" pixel label is shown only as a cue ("Possible rail vehicle"). It never adds a train; the page tells the visitor to set Rail nearby = Yes. Viaducts are usually labelled building or wall by this model, so rail is never inferred from them.

The thresholds (for example vegetation visible ≥ 3%, dominant ≥ 25%) are UNDER demonstration choices, not calibrated values.

### Licences
- Transformers.js: Apache-2.0.
- SegFormer weights: NVIDIA SegFormer licence (non-commercial research and evaluation). Cityscapes: non-commercial terms. This academic use fits; do not reuse commercially.

### Tested
- **Real model** (built-in desktop browser): loaded in 4.7 s; analysed a street photo in 2.0 s. Masks matched the image size and covered every pixel once.
- **Page** (headless Chrome, 375 px and 1280 px): upload; type errors; model-unavailable fallback; manual mode; model-result path; rail logic; assumption change clears old audio; reset; WAV output (30.0 s, stereo, −18 LUFS); no sideways scroll. Existing four players and the video still load, nothing autoplays.
- **Not yet tested** on a real iPhone or Android over mobile data. Do this once the site is live.
- **WAV download**: works on a normal web host. The private claude.ai preview blocks downloads, so the link does nothing there.

### Optional server version
The brief's FastAPI route (`generator-service/`) was not built: there is nowhere to host it before the review. If added later, it can keep `class_mapping.json` / `audio_rules.json` as its rule source.

---

## Changes, 16 Nov 2026 (evening)
- **Two pages with a shared navigation bar.** The navigation bar shows "UNDER-tones" plus links to **Listen** and **Generate**.
  - `index.html` (Listen): Case 53, Case 437 and the Sequence video. This is still the home address, so the QR code is unaffected.
  - `generate.html` (Generate): the street-image-to-audio tool.
- **Name:** the site title and visible project name are now **UNDER-tones**.
- **Lines removed at Connie's request:**
  - the second footer disclaimer ("Existing and proposed recordings are synthetic…");
  - the generator's privacy paragraph;
  - the "All sounds are synthesised in your browser…" line in the result summary.
- **Photos still stay on the device:** behaviour is unchanged, only the notice is gone.
- **"Other" category:** sky pixels now fall under **Other**, which has no sound source.
- **New note on the Generate page:** it states that this is not the full-scale predictive model but a snapshot of the process.
- **No middle dots:** all were removed from page text. Tags use " | ", and dominant cues show as "(dominant)".

---

## Method page and case evidence cards (16 Nov 2026, night)
- **`method.html`** (navigation: Listen | Method | Generate) has two parts.
  - **The search workflow:** the 7 steps in 3 phases, from panel 01E / `Search_Workflow.png`, with the step circles cropped from that file.
  - **Deriving urban soundscapes from SVI:** the 4 steps from panel 02A, with images cropped from the panel PDF. It cites Zhao et al. (2023).
- **Search evidence card** in each case on `index.html`:
  - street view image and Mask2Former segmentation, cropped from panel 03C;
  - composition bar, with the percentages exactly as on panel 03C;
  - visual cluster, contextual type, acoustic challenge, spatial feasibility and prototype family scores, from `Internal_Review/diagrams/Panel06C_Prototype_Suitability_Map/V3/prototype_assignments_v3.csv`. The Case 437 card explains the design-review override from Barrier to Sequence.
- **Category colours** on the Generate page now use the panel 03C segmentation palette: Natural #D5A6C8, Mobility #C9E1B7, Rail #EFBEBB, Built #9CD0DB, People #F2D06B.
- **Data note:** the screening manifest gives Case 437 built 51.2%. Panel 03C shows Built 43% and Other 12%, most likely because sidewalk pixels are grouped differently. The site follows the panel.
- **Image sources:** in `assets/method/` and `assets/cases/`. The working crops were moved to `Final/web/_to_delete/_build_thumbs`.

---

## Live site (17 Nov 2026)
- **Address:** https://connielkx.github.io/under-tones/ (repository: github.com/Connielkx/under-tones, branch `main`, GitHub Pages from `/ (root)`).
- **QR code:** in `qr/`, plain and labelled ("SCAN TO LISTEN: UNDER-TONES").
  - **Formats:** vector SVG and PDF, drawn as one merged path so no hairline seams appear in InDesign, plus 6000 px PNGs tagged at 600 dpi.
  - **Colour and error correction:** pure black on white, error correction level H (still scans with about 30% of the code damaged or covered).
  - **Checked:** every version decodes back to the address above.
- **Updating the site:** edit the files and upload them to the same repository; the address and QR code stay the same.
- **Claude's access:** the Claude GitHub App has access to this repository only. Remove it any time in GitHub Settings → Applications.
