#!/usr/bin/env bash
# Full pipeline: narration -> music -> parallel render -> mix -> mux
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio out
python3 - <<'PY'
import json,subprocess
for i,s in enumerate(json.load(open('narration.json'))):
    subprocess.run(['espeak-ng','-v','kk+m3','-s','148','-p','36','-g','6','-w',f'audio/raw{i}.wav',s],check=True)
PY
python3 music.py 74.5 "[13.0, 26.5, 43.5, 59.0]"
N=1788; P=4; C=$(( (N+P-1)/P ))
for i in $(seq 0 $((P-1))); do s=$((i*C)); e=$(( (i+1)*C < N ? (i+1)*C : N )); node render.mjs frames $s $e out/part$i.mp4 > out/log$i.txt 2>&1 & done
wait
ffmpeg -y -loglevel error -i audio/raw0.wav -i audio/raw1.wav -i audio/raw2.wav -i audio/raw3.wav -i audio/raw4.wav -i audio/music.wav -filter_complex "
[0]adelay=1000|1000[a0];[1]adelay=14000|14000[a1];[2]adelay=27300|27300[a2];[3]adelay=44200|44200[a3];[4]adelay=60500|60500[a4];
[a0][a1][a2][a3][a4]amix=inputs=5:normalize=0,aresample=44100,highpass=f=90,lowpass=f=9500,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1:g=2,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,aecho=0.8:0.5:40|75:0.12|0.08,pan=stereo|c0=c0|c1=c0,volume=1.6,apad=whole_dur=74.5,asplit[v][vk];
[5]volume=0.55[m];[m][vk]sidechaincompress=threshold=0.04:ratio=5:attack=40:release=600[md];
[v][md]amix=inputs=2:normalize=0,atrim=0:74.5,afade=t=out:st=72.5:d=2,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a pcm_s16le audio/mix.wav
printf "file 'part%d.mp4'\n" $(seq 0 $((P-1))) > out/list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i out/list.txt -i audio/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/biosfera_kk.mp4
echo done: out/biosfera_kk.mp4
