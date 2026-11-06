import fs from 'fs';
import path from 'path';

const sampleRate = 44100;

function createWavBuffer(samplesL: Float32Array, samplesR: Float32Array): Buffer {
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samplesL.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samplesL.length; i++) {
    const sL = Math.max(-0.95, Math.min(0.95, samplesL[i]));
    const sR = Math.max(-0.95, Math.min(0.95, samplesR[i]));
    const valL = Math.floor(sL < 0 ? sL * 0x8000 : sL * 0x7fff);
    const valR = Math.floor(sR < 0 ? sR * 0x8000 : sR * 0x7fff);
    buffer.writeInt16LE(valL, offset);
    buffer.writeInt16LE(valR, offset + 2);
    offset += 4;
  }

  return buffer;
}

// Physical model of a soft mallet striking a precision acoustic chime/marimba bar
function addModernChime(
  outL: Float32Array,
  outR: Float32Array,
  startSec: number,
  baseFreq: number,
  durationSec: number,
  gain = 0.35,
  pan = 0.0 // -1 left, +1 right
) {
  const startIdx = Math.floor(startSec * sampleRate);
  const total = Math.floor(durationSec * sampleRate);

  // Inharmonic bar overtone ratios (typical of tuned marimba / celesta bars)
  const modes = [
    { ratio: 1.000, amp: 1.00, decay: 4.5 },
    { ratio: 2.756, amp: 0.18, decay: 9.0 },
    { ratio: 5.404, amp: 0.06, decay: 15.0 },
    { ratio: 0.500, amp: 0.12, decay: 3.5 }  // sub-warmth
  ];

  for (let i = 0; i < total; i++) {
    const idx = startIdx + i;
    if (idx >= outL.length) break;

    const t = i / sampleRate;

    // Smooth transient: felt mallet strike (12ms smooth ease-in)
    const attack = Math.sin(Math.min(1, t / 0.012) * (Math.PI / 2));

    let sample = 0;
    for (const m of modes) {
      const f = baseFreq * m.ratio;
      const env = attack * Math.exp(-m.decay * t);
      // Gentle stereo phase drift for rich spatial presence
      sample += Math.sin(2 * Math.PI * f * t) * env * m.amp;
    }

    // Soft warm lowpass modeling
    const warmDamp = Math.exp(-2.0 * t);
    sample = Math.tanh(sample * 1.1) * warmDamp * gain;

    // Pan calculation with subtle stereo Haas delay
    const panL = Math.cos((pan + 1) * Math.PI / 4);
    const panR = Math.sin((pan + 1) * Math.PI / 4);

    outL[idx] += sample * panL;
    outR[idx] += sample * panR;
  }
}

// 1. Modern Message Tone: Soft, ultra-satisfying bubbly acoustic dual-tap (Telegram/Slack style)
function generateModernMessageTone(): Buffer {
  const duration = 0.45;
  const numSamples = Math.floor(duration * sampleRate);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Note 1: F5 (698.46 Hz) soft left, Note 2: C6 (1046.50 Hz) bright center-right
  addModernChime(left, right, 0.00, 698.46, 0.35, 0.38, -0.15);
  addModernChime(left, right, 0.08, 1046.50, 0.35, 0.42, 0.15);

  return createWavBuffer(left, right);
}

// 2. Modern Audio Call Tone: Warm, catchy, rhythmic acoustic bell loop (Telegram/WhatsApp style)
function generateModernAudioCallTone(): Buffer {
  const duration = 2.6;
  const numSamples = Math.floor(duration * sampleRate);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Soft rhythmic marimba phrase in E-major (E5 -> G#5 -> B5 -> E6)
  addModernChime(left, right, 0.00, 659.25, 0.70, 0.32, -0.2); // E5
  addModernChime(left, right, 0.20, 830.61, 0.65, 0.32, 0.0);  // G#5
  addModernChime(left, right, 0.40, 987.77, 0.65, 0.35, 0.2);  // B5
  addModernChime(left, right, 0.60, 1318.51, 0.90, 0.38, 0.0); // E6

  // Gentle rhythmic echo
  addModernChime(left, right, 0.95, 987.77, 0.60, 0.22, 0.1);  // B5
  addModernChime(left, right, 1.15, 830.61, 0.60, 0.20, -0.1); // G#5

  return createWavBuffer(left, right);
}

// 3. Modern Video Call Tone: Crisp, elegant, ethereal glass chime loop (FaceTime/modern app style)
function generateModernVideoCallTone(): Buffer {
  const duration = 2.6;
  const numSamples = Math.floor(duration * sampleRate);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Harmonic chordal chime in A-major (A5 + E6 shimmer)
  addModernChime(left, right, 0.00, 880.00, 0.85, 0.30, -0.2); // A5
  addModernChime(left, right, 0.00, 1318.51, 0.70, 0.22, 0.2); // E6

  addModernChime(left, right, 0.30, 1108.73, 0.85, 0.32, 0.0); // C#6
  addModernChime(left, right, 0.30, 1661.22, 0.70, 0.20, 0.25); // G#6

  addModernChime(left, right, 0.60, 1318.51, 1.00, 0.35, 0.0); // E6
  addModernChime(left, right, 0.60, 1760.00, 0.80, 0.22, -0.2); // A6 shimmer

  return createWavBuffer(left, right);
}

const outDir = path.join(process.cwd(), 'public', 'sounds');
fs.writeFileSync(path.join(outDir, 'message.wav'), generateModernMessageTone());
fs.writeFileSync(path.join(outDir, 'call-audio.wav'), generateModernAudioCallTone());
fs.writeFileSync(path.join(outDir, 'call-video.wav'), generateModernVideoCallTone());

console.log('Successfully synthesized Modern App acoustic sound files!');
