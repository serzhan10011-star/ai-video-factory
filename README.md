# 🎬 AI Video Factory — LLM pipeline for video lectures

A pipeline that turns learning material (a syllabus, a book) into **fully narrated video lectures**. It produced **167 video lectures**.

## Pipeline
1. 📄 **Parse material** — PDF/DOCX/PPTX and more (12+ formats, KZ/RU/EN)
2. ✍️ **Script generation** — Claude
3. 🎙️ **Voiceover** — ElevenLabs
4. 🖼️ **Illustrations / b-roll** — fal.ai
5. 🧑‍🏫 **Avatar video** — HeyGen
6. 👄 **GPU lip-sync** — RunPod serverless (Wav2Lip / MuseTalk)
7. 🎞️ Assembly — FFmpeg, logo & subtitle overlay

## Stack
`Python` · `Claude API` · `ElevenLabs` · `fal.ai` · `HeyGen`
`RunPod` (serverless GPU, Docker) · `Wav2Lip` · `MuseTalk 1.5` · `FFmpeg` · `python-telegram-bot`

## Components
- **lecture_bot** — script generation + voiceover + illustrations
- **VideoBot** — syllabus parsing → avatar video, GPU pod pool
- **RunPod backends** — three serverless lip-sync endpoints (Wav2Lip, MuseTalk, LatentSync)

> Real outcome: 167 finished lectures via a fully automated pipeline.

📫 serzhan10011@gmail.com
