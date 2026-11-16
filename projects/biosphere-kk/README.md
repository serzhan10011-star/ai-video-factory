# Биосфера және табиғаттағы зат айналымы — code-only 3D video (KZ)

Fully procedural ~74 s, 1920×1080, 24 fps educational film rendered from code:

- **Visuals**: Three.js scenes rendered headlessly in Chromium (Playwright), frame-by-frame, deterministic `renderAt(t)`.
  - Earth: NASA Blue Marble / night lights / clouds textures (from the `three-globe` npm package), custom atmosphere shader.
  - Biosphere cut-away diorama (atmosphere, hydrosphere, lithosphere strata, forests, river, groundwater).
  - Water cycle (evaporation, condensation, precipitation, transpiration, runoff/groundwater) with particles and flow arrows.
  - Carbon cycle forest (photosynthesis, food chain, respiration, decomposition, storage in soil and water).
  - Final globe with a glowing interconnection network.
- **Voice**: natural Kazakh neural voice (Microsoft `kk-KZ-DauletNeural` via edge-tts, `voice.py`), one clip per subtitle sentence.
- **Music**: procedural ambient score (`music.py`, numpy/scipy).
- **Text**: all on-screen text in Kazakh (Montserrat Cyrillic).

## Build
```bash
npm i
python3 music.py 74.5 "[13.0, 26.5, 43.5, 59.0]"
node render.mjs test 5,20,33,50,66          # preview stills into test/
node render.mjs frames 0 1788 out/video.mp4  # full render (24 fps)
```
See `build.sh` for narration synthesis, audio mix and final mux.
