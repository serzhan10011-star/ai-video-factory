"""Procedural calm cinematic ambient score + transition whooshes."""
import numpy as np, scipy.signal as ss, scipy.io.wavfile as wf, json, sys
SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 74.5
rng = np.random.default_rng(7)
N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    e[-nr:] *= np.cos(np.linspace(0, np.pi / 2, nr)) ** 2
    return e

def pad(freq, start, dur, amp, pan):
    n = int(dur * SR); s0 = int(start * SR)
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    for det, w in ((-0.11, .5), (0.0, 1.0), (0.13, .5)):
        f = freq * 2 ** (det / 12)
        ph = rng.uniform(0, 6.28)
        sig += w * (np.sin(2*np.pi*f*tt+ph) + 0.25*np.sin(4*np.pi*f*tt+ph) + 0.08*np.sin(6*np.pi*f*tt))
    sig *= (1 + 0.15 * np.sin(2*np.pi*0.17*tt + rng.uniform(0, 6)))
    sig *= env(n, min(3.5, dur/2.2), min(4.0, dur/2.2)) * amp
    e = min(N, s0 + n); sig = sig[:e - s0]
    L[s0:e] += sig * (1 - pan) ; R[s0:e] += sig * pan

def pluck(freq, start, amp, pan):
    n = int(4.0 * SR); s0 = int(start * SR)
    if s0 >= N: return
    tt = np.arange(n) / SR
    sig = (np.sin(2*np.pi*freq*tt) + 0.3*np.sin(4*np.pi*freq*tt)*np.exp(-tt*3)) * np.exp(-tt * 1.6)
    sig *= np.minimum(1, tt / 0.004) * amp
    e = min(N, s0 + n); sig = sig[:e - s0]
    L[s0:e] += sig * (1 - pan); R[s0:e] += sig * pan

# D minor ambient progression
chords = [[50, 57, 62, 65, 69, 76], [46, 53, 58, 62, 65, 69], [41, 48, 57, 60, 64, 67], [48, 55, 60, 62, 67, 74]]
seg = 9.25
k = 0; st = 0.0
while st < DUR - 2:
    ch = chords[k % 4]
    d = min(seg + 3.0, DUR - st)
    for j, m in enumerate(ch):
        pad(midi(m), st, d, 0.05 if j else 0.075, 0.2 + 0.6 * (j / (len(ch) - 1)))
    pad(midi(ch[0] - 12), st, d, 0.06, 0.5)  # sub
    # sparse arpeggio after intro
    if st > 8:
        for q, m in enumerate([ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[5] + 12]):
            pluck(midi(m), st + 0.6 + q * 2.2 + rng.uniform(-.05, .05), 0.035, rng.uniform(.25, .75))
    st += seg; k += 1
# final resolving chord
pad(midi(50), DUR - 8, 8, .07, .5); pad(midi(62), DUR - 8, 8, .05, .3); pad(midi(69), DUR - 8, 8, .05, .7); pad(midi(74), DUR - 8, 8, .04, .5)

# shimmer noise bed
nz = rng.standard_normal(N)
b, a = ss.butter(2, [3000 / (SR/2), 8000 / (SR/2)], 'band')
sh = ss.lfilter(b, a, nz) * 0.004 * (1 + np.sin(2*np.pi*0.05*t))
L += sh; R += np.roll(sh, 800)

# whooshes at transitions
for tr in json.loads(sys.argv[2]) if len(sys.argv) > 2 else []:
    n = int(3.0 * SR); s0 = int((tr - 1.6) * SR)
    w = rng.standard_normal(n)
    tt = np.arange(n) / n
    out = np.zeros(n); zi = None
    # time-varying lowpass sweep, processed in blocks
    blk = 1024
    for i in range(0, n, blk):
        fc = 300 + 5000 * np.sin(np.pi * tt[i]) ** 2
        bb, aa = ss.butter(2, fc / (SR/2))
        if zi is None: zi = ss.lfilter_zi(bb, aa) * 0
        out[i:i+blk], zi = ss.lfilter(bb, aa, w[i:i+blk], zi=zi)
    out *= np.sin(np.pi * tt) ** 3 * 0.10
    e = min(N, s0 + n)
    pan = 0.5 + 0.4 * np.sin(2*np.pi*tt)[:e - s0]
    L[s0:e] += out[:e - s0] * (1 - pan); R[s0:e] += out[:e - s0] * pan

# reverb
ir_n = int(3.2 * SR)
irt = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-irt * 2.1); irR = rng.standard_normal(ir_n) * np.exp(-irt * 2.1)
b, a = ss.butter(1, 5000 / (SR/2)); irL = ss.lfilter(b, a, irL); irR = ss.lfilter(b, a, irR)
irL /= np.abs(irL).sum() ** .5 * 6; irR /= np.abs(irR).sum() ** .5 * 6
wetL = ss.fftconvolve(L, irL)[:N]; wetR = ss.fftconvolve(R, irR)[:N]
L = 0.55 * L + wetL; R = 0.55 * R + wetR
master = env(N, 3.0, 5.0)
L *= master; R *= master
st = np.stack([L, R], 1)
st = st / np.abs(st).max() * 0.85
wf.write('audio/music.wav', SR, (st * 32767).astype(np.int16))
print('ok', DUR)
