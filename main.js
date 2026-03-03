/**
 * Lumina Piano - MIDI Engine and Virtual Keyboard
 */

class LuminaPiano {
    constructor() {
        this.synth = null;
        this.reverb = null;
        this.isStarted = false;
        this.midiAccess = null;
        this.activeKeys = new Map(); // Keep track of active notes
        this.isSustainActive = false;

        // Recording State
        this.recordingNotes = [];
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.recordedData = null;

        this.initUI();
    }

    async initAudio() {
        const startBtn = document.getElementById('start-btn');
        const startText = startBtn.innerText;
        startBtn.innerText = "Tuning Instruments...";
        startBtn.disabled = true;

        await Tone.start();

        this.reverb = new Tone.Reverb({
            decay: 2.5,
            preDelay: 0.1,
            wet: 0.2
        }).toDestination();

        // Load multi-instrument samplers
        this.instruments = {
            piano: new Tone.Sampler({
                urls: { "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3", "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", "A7": "A7.mp3", "C8": "C8.mp3" },
                baseUrl: "https://tonejs.github.io/audio/salamander/",
                release: 1
            }).connect(this.reverb),

            epiano: new Tone.Sampler({
                urls: { "A1": "A1.mp3", "A2": "A2.mp3", "A3": "A3.mp3", "C1": "C1.mp3", "C2": "C2.mp3", "C3": "C3.mp3", "D#1": "Ds1.mp3", "D#2": "Ds2.mp3", "D#3": "Ds3.mp3", "F#1": "Fs1.mp3", "F#2": "Fs2.mp3", "F#3": "Fs3.mp3" },
                baseUrl: "https://tonejs.github.io/audio/casio/",
                release: 1
            }).connect(this.reverb),

            synth: new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
                envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 }
            }).connect(this.reverb),

            organ: new Tone.Sampler({
                urls: { "C4": "C4.mp3" },
                baseUrl: "https://tonejs.github.io/audio/casio/",
                release: 2
            }).connect(this.reverb)
        };

        this.synth = this.instruments.piano;

        return new Promise((resolve) => {
            Tone.loaded().then(() => {
                console.log("Instruments loaded!");
                startBtn.innerText = startText;
                startBtn.disabled = false;
                resolve();
            });
            Tone.Destination.volume.value = -5;
        });
    }

    initUI() {
        this.container = document.getElementById('piano-container');
        this.generateKeys();
        this.setupEventListeners();
        this.setupMIDI();
    }

    generateKeys() {
        // MIDI notes for a standard 88-key piano are 21 (A0) to 108 (C8)
        // We'll generate a wide range (C1 to C8)
        const startNote = 24; // C1
        const endNote = 108;  // C8

        let html = '';
        for (let i = startNote; i <= endNote; i++) {
            const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
            const noteName = this.midiToNoteName(i);
            const label = noteName.includes('#') ? '' : noteName; // Only label white keys
            html += `<div class="key ${isBlack ? 'black' : 'white'}" data-note="${i}" data-name="${noteName}">${label}</div>`;
        }
        this.container.innerHTML = html;

        // Auto-center to Middle C (60)
        setTimeout(() => {
            const middleC = document.querySelector('.key[data-note="60"]');
            if (middleC) {
                middleC.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
        }, 500);
    }

    midiToNoteName(midi) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const name = notes[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${name}${octave}`;
    }

    setupEventListeners() {
        const startBtn = document.getElementById('start-btn');
        const overlay = document.getElementById('start-overlay');

        startBtn.addEventListener('click', async () => {
            await this.initAudio();
            overlay.style.display = 'none';
            this.isStarted = true;
        });

        // Mouse Events
        this.container.addEventListener('mousedown', (e) => {
            if (!this.isStarted) return;
            const key = e.target.closest('.key');
            if (key) {
                const midi = parseInt(key.dataset.note);
                this.noteOn(midi, 0.7);
            }
        });

        window.addEventListener('mouseup', () => {
            // Stop all mouse-triggered notes (simplified)
            this.activeKeys.forEach((val, midi) => {
                if (val.trigger === 'mouse') {
                    this.noteOff(midi);
                }
            });
        });

        // Controls
        document.getElementById('volume').addEventListener('input', (e) => {
            Tone.Destination.volume.rampTo(parseFloat(e.target.value), 0.1);
        });

        document.getElementById('reverb').addEventListener('input', (e) => {
            if (this.reverb) this.reverb.wet.value = parseFloat(e.target.value);
        });

        // Instrument Swapper
        document.getElementById('instrument-select').addEventListener('change', (e) => {
            this.switchInstrument(e.target.value);
        });

        // Recording Handlers
        const recordBtn = document.getElementById('record-btn');
        const playBtn = document.getElementById('play-btn');

        recordBtn.addEventListener('click', () => {
            if (!this.isRecording) {
                this.startRecording();
                recordBtn.innerText = 'Stop';
                recordBtn.classList.add('recording');
                playBtn.disabled = true;
            } else {
                this.stopRecording();
                recordBtn.innerText = 'Record';
                recordBtn.classList.remove('recording');
                playBtn.disabled = false;
            }
        });

        playBtn.addEventListener('click', () => {
            this.playRecording();
        });

        // Sustain Button
        const sustainBtn = document.getElementById('sustain-btn');
        sustainBtn.addEventListener('click', () => this.toggleSustain());

        // Panic Button
        document.getElementById('panic-btn').addEventListener('click', () => {
            if (this.synth) this.synth.releaseAll();
            document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
            this.activeKeys.clear();
        });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.toggleSustain(true);
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.toggleSustain(false);
            }
        });
    }

    toggleSustain(force) {
        this.isSustainActive = force !== undefined ? force : !this.isSustainActive;
        const btn = document.getElementById('sustain-btn');
        if (this.isSustainActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
            // Release all notes that were held by sustain
            this.activeKeys.forEach((val, midi) => {
                if (!val.pressed) {
                    this.noteOff(midi);
                }
            });
        }
    }

    async setupMIDI() {
        if (navigator.requestMIDIAccess) {
            try {
                this.midiAccess = await navigator.requestMIDIAccess();
                this.updateMIDIDeviceStatus(true);

                for (let input of this.midiAccess.inputs.values()) {
                    input.onmidimessage = (msg) => this.onMIDIMessage(msg);
                }

                // Listen for device connections/disconnections
                this.midiAccess.onstatechange = (e) => {
                    this.updateMIDIDeviceStatus();
                };
            } catch (err) {
                console.warn('MIDI access denied or not supported', err);
                this.updateMIDIDeviceStatus(false);
            }
        }
    }

    updateMIDIDeviceStatus(initial) {
        const dot = document.querySelector('.status-dot');
        const text = document.getElementById('midi-text');

        let connected = false;
        if (this.midiAccess && this.midiAccess.inputs.size > 0) {
            connected = true;
        }

        if (connected) {
            dot.classList.add('connected');
            text.innerText = 'MIDI Connected';
        } else {
            dot.classList.remove('connected');
            text.innerText = 'No MIDI Device';
        }
    }

    onMIDIMessage(message) {
        if (!this.isStarted) return;

        const [status, note, velocity] = message.data;
        const type = status & 0xf0; // Channel message type
        const channel = status & 0x0f; // MIDI channel

        if (type === 144 && velocity > 0) { // Note On
            this.noteOn(note, velocity / 127, 'midi');
        } else if (type === 128 || (type === 144 && velocity === 0)) { // Note Off
            this.noteOff(note);
        }
    }

    noteOn(midi, velocity, trigger = 'mouse') {
        const noteName = this.midiToNoteName(midi);
        const keyEl = document.querySelector(`.key[data-note="${midi}"]`);

        if (keyEl) keyEl.classList.add('active');

        if (this.synth) {
            this.synth.triggerAttack(noteName, undefined, velocity);
        }

        if (this.isRecording && trigger !== 'playback') {
            this.recordingNotes.push({
                time: Tone.now() - this.recordingStartTime,
                note: midi,
                velocity: velocity,
                type: 'on'
            });
        }

        this.activeKeys.set(midi, { pressed: true, trigger });
        this.createNoteVisual(midi);

        // Dynamic background pulse
        const hue = (midi * 137.5) % 360; // Golden angle for distributed colors
        document.body.style.background = `radial-gradient(circle at center, hsla(${hue}, 70%, 20%, 0.3), #050508)`;
        setTimeout(() => {
            if (this.activeKeys.size === 0) {
                document.body.style.background = '';
            }
        }, 500);
    }

    noteOff(midi) {
        const keyData = this.activeKeys.get(midi);
        if (keyData) {
            keyData.pressed = false;
        }

        if (this.isRecording) {
            this.recordingNotes.push({
                time: Tone.now() - this.recordingStartTime,
                note: midi,
                type: 'off'
            });
        }

        if (this.isSustainActive) return;

        const keyEl = document.querySelector(`.key[data-note="${midi}"]`);
        if (keyEl) keyEl.classList.remove('active');

        if (this.synth) {
            this.synth.triggerRelease(this.midiToNoteName(midi));
        }

        this.activeKeys.delete(midi);
    }

    // --- New Features Logic ---

    switchInstrument(name) {
        if (this.instruments[name]) {
            // Silence current
            if (this.synth) this.synth.releaseAll();
            this.synth = this.instruments[name];
            console.log("Switched to:", name);
        }
    }

    startRecording() {
        this.recordingNotes = [];
        this.isRecording = true;
        this.recordingStartTime = Tone.now();
        console.log("Recording started...");
    }

    stopRecording() {
        this.isRecording = false;
        this.recordedData = [...this.recordingNotes];
        console.log("Recording stopped. Events captured:", this.recordedData.length);
    }

    playRecording() {
        if (!this.recordedData || this.recordedData.length === 0) return;

        const now = Tone.now();
        this.recordedData.forEach(event => {
            Tone.Transport.schedule((time) => {
                if (event.type === 'on') {
                    this.noteOn(event.note, event.velocity, 'playback');
                } else {
                    this.noteOff(event.note);
                }
            }, now + event.time);
        });

        Tone.Transport.start();
        // Stop transport after last note + buffer
        const lastTime = this.recordedData[this.recordedData.length - 1].time;
        setTimeout(() => {
            Tone.Transport.stop();
            Tone.Transport.cancel();
        }, (lastTime + 2) * 1000);
    }

    createNoteVisual(midi) {
        // Simple visual feedback in the background
        const visualizer = document.getElementById('visualizer');
        const burst = document.createElement('div');
        burst.className = 'note-burst';

        // Find key position
        const keyEl = document.querySelector(`.key[data-note="${midi}"]`);
        if (keyEl) {
            const rect = keyEl.getBoundingClientRect();
            burst.style.left = `${rect.left + rect.width / 2}px`;
            burst.style.bottom = '250px';
            burst.style.backgroundColor = midi % 12 === 0 ? 'var(--accent-primary)' : 'var(--accent-secondary)';
        }

        visualizer.appendChild(burst);
        setTimeout(() => burst.remove(), 1000);
    }
}

// Visual styles for note burst (added via JS or CSS)
const style = document.createElement('style');
style.textContent = `
    .visualizer-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
    }
    .note-burst {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        filter: blur(5px);
        opacity: 0.8;
        transform: translate(-50%, 0);
        animation: burstUp 1s ease-out forwards;
    }
    @keyframes burstUp {
        0% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        100% { transform: translate(-50%, -300px) scale(4); opacity: 0; }
    }
`;
document.head.appendChild(style);

window.addEventListener('DOMContentLoaded', () => {
    window.piano = new LuminaPiano();
});
