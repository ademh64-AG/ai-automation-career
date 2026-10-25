# Generate ambient background music — richer + louder.
# Output: bgm.wav (94s, stereo, 44100Hz)
import numpy as np
import wave

SR = 44100
DUR = 94.0
N = int(SR * DUR)
t = np.linspace(0, DUR, N, endpoint=False)

def env_attack_release(n, a=0.5, r=2.5):
    env = np.ones(n)
    a_i = int(a * SR)
    r_i = int(r * SR)
    env[:a_i] = np.linspace(0, 1, a_i)
    env[-r_i:] *= np.linspace(1, 0, r_i)
    return env

def pad(freq, dur):
    n = int(SR * dur)
    tt = np.linspace(0, dur, n, endpoint=False)
    return 0.22 * np.sin(2*np.pi*freq*tt) * env_attack_release(n)

def bass(freq, dur):
    n = int(SR * dur)
    tt = np.linspace(0, dur, n, endpoint=False)
    return 0.30 * np.sin(2*np.pi*freq*tt) * env_attack_release(n, 0.3, 3.0)

# progression (8 bars, 11.75 s each): Cmaj7 Am7 Fmaj7 G
chords = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 349.23],
    [196.00, 246.94, 293.66, 392.00],
]
roots = [130.81, 110.00, 87.31, 98.00]  # C2 A1 F1 G1

bar = 11.75
mix = np.zeros(N)
for bar_idx in range(8):
    start = int(bar_idx * bar * SR)
    ch = chords[bar_idx % 4]
    for f in ch:
        part = pad(f, bar)
        end = min(start + len(part), N)
        mix[start:end] += part[: end - start]
    b = bass(roots[bar_idx % 4], bar)
    end = min(start + len(b), N)
    mix[start:end] += b[: end - start]

# soft lowpass
kernel = np.ones(128) / 128
mix = np.convolve(mix, kernel, mode='same')
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.8

# stereo: slight chorus width
left = mix.copy()
right = mix.copy()
t2 = t + 0.03
right += 0.12 * np.sin(2*np.pi*196*t2) * 0.4

stereo = np.stack([left, right], axis=1)
pcm = (stereo * 32767).astype(np.int16)

with wave.open(r"C:\Users\Administrator\ai-automation-career\demo-video\bgm.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("bgm.wav regenerated, peak=%.2f" % np.max(np.abs(stereo)))
