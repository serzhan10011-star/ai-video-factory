#!/usr/bin/env bash
# Full pipeline: narration -> music -> parallel render -> mix -> mux
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio out
# Natural Kazakh neural voice (Edge TTS, needs speech.platform.bing.com), one clip per subtitle sentence
pip install -q edge-tts
python3 voice.py
python3 music.py 74.5 "[13.0, 26.5, 43.5, 59.0]"
N=1788; P=4; C=$(( (N+P-1)/P ))
for i in $(seq 0 $((P-1))); do s=$((i*C)); e=$(( (i+1)*C < N ? (i+1)*C : N )); node render.mjs frames $s $e out/part$i.mp4 > out/log$i.txt 2>&1 & done
wait
printf "file 'part%d.mp4'\n" $(seq 0 $((P-1))) > out/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i out/list.txt -i audio/mix_human.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/biosfera_kk.mp4
echo done: out/biosfera_kk.mp4
