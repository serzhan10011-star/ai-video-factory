"""Kazakh neural voice-over: one clip per subtitle sentence, placed at its subtitle start; mixed with ducked music."""
import subprocess, os, re
src = open('src/main.js').read()
subs = re.findall(r"\[([\d.]+), ([\d.]+), '([^']+)'\]", src)
proxy = ['--proxy', os.environ['HTTPS_PROXY']] if os.environ.get('HTTPS_PROXY') else []
ins, flt = [], []
for i, (a, b, txt) in enumerate(subs):
    a, b = float(a), float(b); f = f'audio/s{i}.mp3'
    subprocess.run(['edge-tts', *proxy, '--voice', 'kk-KZ-DauletNeural', '--rate=-12%', '--pitch=-3Hz', '--text', txt, '--write-media', f], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', '-ar', '44100', '-ac', '1', f'audio/s{i}.wav'], check=True)
    ins += ['-i', f'audio/s{i}.wav']; ms = int((a + 0.2) * 1000); flt.append(f'[{i}]adelay={ms}|{ms}[d{i}]')
n = len(subs)
fc = ';'.join(flt) + ';' + ''.join(f'[d{i}]' for i in range(n)) + f"amix=inputs={n}:normalize=0,highpass=f=70,equalizer=f=200:t=q:w=1:g=1.5,equalizer=f=4000:t=q:w=1:g=1.5,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=150,aecho=0.85:0.6:35|60:0.06|0.04,pan=stereo|c0=c0|c1=c0,volume=1.5,apad=whole_dur=74.5,asplit[v][vk];[{n}]volume=0.6[m];[m][vk]sidechaincompress=threshold=0.04:ratio=5:attack=40:release=700[md];[v][md]amix=inputs=2:normalize=0,atrim=0:74.5,afade=t=out:st=72.5:d=2,loudnorm=I=-16:TP=-1.5:LRA=11"
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-i', 'audio/music.wav', '-filter_complex', fc, '-ar', '48000', '-c:a', 'pcm_s16le', 'audio/mix_human.wav'], check=True)
