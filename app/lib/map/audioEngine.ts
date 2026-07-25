/**
 * Procedural ride-mode audio built on the Web Audio API. No samples, no
 * library: an electric-motor drone (oscillators), speed-coupled wind (filtered
 * pink noise), a resonant tire screech for drift/hard-brake slip, a soft brake
 * drag, and short noise bursts for stone-kick / tree-impact events.
 *
 * The continuous voices are a fixed node graph modulated each frame via
 * setTargetAtTime (no zipper noise, no per-frame node churn). One-shots build a
 * short-lived graph per event. The AudioContext is created lazily on entering
 * ride mode (a user gesture). The pure parameter math is exported so it can be
 * unit-tested headless without an AudioContext.
 */

const AUDIO_VMAX = 38; // m/s, matches V_MAX_BOOST in motorcycle.ts

// --- motor ---
const MOTOR_IDLE_HZ = 46;
const MOTOR_SPEED_HZ = 24; // +Hz per m/s
const MOTOR_GROWL_RATIO = 0.5;
const MOTOR_WHINE_RATIO = 6; // the high electric-motor harmonic
const MOTOR_BUS_MAX = 0.22;

// --- wind / skid / brake ceilings ---
const WIND_GAIN_MAX = 0.22;
export const SKID_GAIN_MAX = 0.4;
const BRAKE_GAIN_MAX = 0.18;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export type AudioDriveState = {
  speed: number;
  throttle: number;
  brake: number;
  boost: boolean;
  hardBrake: boolean;
  /** Signed nose-vs-travel angle (rad) from the motorcycle controller. */
  slip: number;
  drifting: boolean;
};

/** Electric-motor fundamental: idle hum plus linear speed coupling. */
export function motorFundamental(speed: number): number {
  return MOTOR_IDLE_HZ + clamp(Math.abs(speed), 0, AUDIO_VMAX) * MOTOR_SPEED_HZ;
}

/** Overall motor level: a quiet idle hum, louder under throttle / speed / boost. */
export function motorBusGain(speed: number, throttle: number, boost: boolean): number {
  const s = clamp01(Math.abs(speed) / AUDIO_VMAX);
  const base = 0.04 + s * 0.11;
  const thr = clamp01(throttle) * 0.05;
  const boostBoost = boost ? 0.03 : 0;
  return clamp(base + thr + boostBoost, 0, MOTOR_BUS_MAX);
}

/** Lowpass cutoff rises with speed so the drone brightens as you accelerate. */
export function motorCutoff(speed: number): number {
  const s = clamp01(Math.abs(speed) / AUDIO_VMAX);
  return 600 + s * 2000;
}

/** Wind: quadratic so it stays silent at low speed and whooshes near the top. */
export function windGain(speed: number): number {
  const s = clamp01(Math.abs(speed) / AUDIO_VMAX);
  return s * s * WIND_GAIN_MAX;
}

/** Wind filter cutoff rises with speed (a brighter, faster rush). */
export function windCutoff(speed: number): number {
  const s = clamp01(Math.abs(speed) / AUDIO_VMAX);
  return 350 + s * s * 2600;
}

/**
 * Tire-screech amount 0..1 from the bike's nose-vs-travel slip. Gripping in a
 * straight line is silent; drifting (or a high-speed hard brake) opens it up.
 */
export function skidAmount(
  slip: number,
  drifting: boolean,
  hardBrake: boolean,
  speed: number,
): number {
  if (Math.abs(speed) < 3) return 0;
  const slipMag = clamp01(Math.abs(slip) / 0.55);
  let amt = slipMag;
  if (drifting) amt = Math.max(amt, 0.7);
  if (hardBrake && Math.abs(speed) > 5) amt = Math.max(amt, 0.5);
  return clamp01(amt);
}

/** Tire scrub under braking — responds to S/Down AND Space, louder at speed. */
export function brakeGain(brakeInput: number, hardBrake: boolean, speed: number): number {
  const v = Math.abs(speed);
  if (v < 1.5) return 0;
  const pressure = Math.max(clamp01(brakeInput), hardBrake ? 1 : 0);
  if (pressure <= 0) return 0;
  const speedFactor = 0.7 + 0.4 * clamp01(v / AUDIO_VMAX);
  return clamp(pressure * BRAKE_GAIN_MAX * speedFactor, 0, BRAKE_GAIN_MAX * 1.4);
}

/** Paul Kellet pink noise into a short looping buffer. */
function createPinkNoise(ctx: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;

  // motor voice
  private motorLowpass: BiquadFilterNode | null = null;
  private motorGain: GainNode | null = null;
  private oscGrowl: OscillatorNode | null = null;
  private oscFund: OscillatorNode | null = null;
  private oscWhine: OscillatorNode | null = null;

  // wind voice
  private windLowpass: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;

  // skid voice
  private skidBand: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  private skidSrc: AudioBufferSourceNode | null = null;

  // brake voice
  private brakeBand: BiquadFilterNode | null = null;
  private brakeGainNode: GainNode | null = null;
  private brakeSrc: AudioBufferSourceNode | null = null;

  private started = false;
  private active = false;
  private muted = false;
  private volume = 0.9;
  private lastImpact = 0;

  /** Lazily build the node graph. Idempotent; safe to call from a user gesture. */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.noise = createPinkNoise(ctx, 2);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    comp.connect(master);
    master.connect(ctx.destination);
    this.comp = comp;
    this.master = master;

    // --- motor: low growl + fundamental + high electric whine, shaped by a lowpass ---
    const motorLowpass = ctx.createBiquadFilter();
    motorLowpass.type = "lowpass";
    motorLowpass.frequency.value = motorCutoff(0);
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0;
    motorLowpass.connect(motorGain).connect(comp);

    const oscGrowl = ctx.createOscillator();
    oscGrowl.type = "sawtooth";
    oscGrowl.frequency.value = motorFundamental(0) * MOTOR_GROWL_RATIO;
    const growlGain = ctx.createGain();
    growlGain.gain.value = 0.4;
    oscGrowl.connect(growlGain).connect(motorLowpass);

    const oscFund = ctx.createOscillator();
    oscFund.type = "triangle";
    oscFund.frequency.value = motorFundamental(0);
    const fundGain = ctx.createGain();
    fundGain.gain.value = 0.55;
    oscFund.connect(fundGain).connect(motorLowpass);

    const oscWhine = ctx.createOscillator();
    oscWhine.type = "sine";
    oscWhine.frequency.value = motorFundamental(0) * MOTOR_WHINE_RATIO;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.28;
    oscWhine.connect(whineGain).connect(motorLowpass);

    oscGrowl.start();
    oscFund.start();
    oscWhine.start();
    this.motorLowpass = motorLowpass;
    this.motorGain = motorGain;
    this.oscGrowl = oscGrowl;
    this.oscFund = oscFund;
    this.oscWhine = oscWhine;

    // --- wind: pink noise through a speed-coupled lowpass ---
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noise;
    windSrc.loop = true;
    const windLowpass = ctx.createBiquadFilter();
    windLowpass.type = "lowpass";
    windLowpass.frequency.value = windCutoff(0);
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windLowpass).connect(windGain).connect(comp);
    windSrc.start();
    this.windSrc = windSrc;
    this.windLowpass = windLowpass;
    this.windGain = windGain;

    // --- skid: resonant bandpass screech with a slow warbling LFO on its center freq ---
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = this.noise;
    skidSrc.loop = true;
    const skidBand = ctx.createBiquadFilter();
    skidBand.type = "bandpass";
    skidBand.frequency.value = 1200;
    skidBand.Q.value = 7;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidBand).connect(skidGain).connect(comp);
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(skidBand.frequency);
    lfo.start();
    skidSrc.start();
    this.skidSrc = skidSrc;
    this.skidBand = skidBand;
    this.skidGain = skidGain;

    // --- brake: midband tire scrub (a "shhh") under any braking ---
    const brakeSrc = ctx.createBufferSource();
    brakeSrc.buffer = this.noise;
    brakeSrc.loop = true;
    const brakeBand = ctx.createBiquadFilter();
    brakeBand.type = "bandpass";
    brakeBand.frequency.value = 1200;
    brakeBand.Q.value = 0.7;
    const brakeGainNode = ctx.createGain();
    brakeGainNode.gain.value = 0;
    brakeSrc.connect(brakeBand).connect(brakeGainNode).connect(comp);
    brakeSrc.start();
    this.brakeSrc = brakeSrc;
    this.brakeBand = brakeBand;
    this.brakeGainNode = brakeGainNode;

    this.started = true;
  }

  /** Resume the context and mark the engine active (call on entering ride mode). */
  start() {
    if (!this.ctx) return;
    this.active = true;
    void this.ctx.resume();
  }

  /** Ramp continuous voices to silence and suspend (call on leaving ride mode). */
  stop() {
    this.active = false;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const tau = 0.12;
    this.motorGain?.gain.setTargetAtTime(0, now, tau);
    this.windGain?.gain.setTargetAtTime(0, now, tau);
    this.skidGain?.gain.setTargetAtTime(0, now, tau);
    this.brakeGainNode?.gain.setTargetAtTime(0, now, tau);
    // Let the short fade play, then suspend so the tab stops paying for audio.
    window.setTimeout(() => {
      if (!this.active && this.ctx) void this.ctx.suspend();
    }, 260);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  setVolume(volume: number) {
    this.volume = clamp01(volume);
    if (!this.ctx || !this.master || this.muted) return;
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  isMuted() {
    return this.muted;
  }

  isActive() {
    return this.active;
  }

  /** Smoothly retarget every continuous voice to the current ride state. */
  update(state: AudioDriveState) {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const tau = 0.07;

    const f = motorFundamental(state.speed);
    this.oscFund?.frequency.setTargetAtTime(f, now, tau);
    this.oscGrowl?.frequency.setTargetAtTime(f * MOTOR_GROWL_RATIO, now, tau);
    this.oscWhine?.frequency.setTargetAtTime(f * MOTOR_WHINE_RATIO, now, tau);
    this.motorLowpass?.frequency.setTargetAtTime(motorCutoff(state.speed), now, tau);
    this.motorGain?.gain.setTargetAtTime(
      motorBusGain(state.speed, state.throttle, state.boost),
      now,
      tau,
    );

    this.windLowpass?.frequency.setTargetAtTime(windCutoff(state.speed), now, tau);
    this.windGain?.gain.setTargetAtTime(windGain(state.speed), now, tau);

    const screech = skidAmount(state.slip, state.drifting, state.hardBrake, state.speed);
    this.skidGain?.gain.setTargetAtTime(screech * SKID_GAIN_MAX, now, tau);

    this.brakeGainNode?.gain.setTargetAtTime(
      brakeGain(state.brake, state.hardBrake, state.speed),
      now,
      tau,
    );
  }

  /** Short noise burst for stone kicks / tree impacts. intensity is 0..1. */
  triggerImpact(intensity = 0.5) {
    const ctx = this.ctx;
    const comp = this.comp;
    if (!ctx || !comp || !this.started || this.muted) return;
    const now = ctx.currentTime;
    // Throttle so a sustained rub doesn't machine-gun the compressor.
    if (now - this.lastImpact < 0.04) return;
    this.lastImpact = now;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 320 + clamp01(intensity) * 700;
    const g = ctx.createGain();
    const peak = clamp(0.12 + clamp01(intensity) * 0.2, 0, 0.4);
    const dur = 0.1 + clamp01(intensity) * 0.08;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(filt).connect(g).connect(comp);
    src.start(now);
    src.stop(now + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    };
  }

  dispose() {
    this.active = false;
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.oscGrowl?.stop();
      this.oscFund?.stop();
      this.oscWhine?.stop();
      this.windSrc?.stop();
      this.skidSrc?.stop();
      this.brakeSrc?.stop();
    } catch {
      // Nodes may already be stopped; closing the context cleans up regardless.
    }
    void ctx.close();
    this.ctx = null;
    this.started = false;
  }
}
