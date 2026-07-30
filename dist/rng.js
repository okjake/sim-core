"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashSeed = hashSeed;
exports.createRng = createRng;
/** FNV-1a — used to turn a string label into a 32-bit seed. */
function hashSeed(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
/** mulberry32 — small, fast, good enough for traffic shaping. */
function createRng(seed = 1) {
    const numericSeed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    let state = numericSeed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rng = {
        seed: numericSeed,
        next,
        float: (min, max) => min + next() * (max - min),
        int: (min, max) => Math.floor(min + next() * (max - min + 1)),
        chance: (p) => next() < p,
        pick: (items) => {
            if (items.length === 0) {
                throw new Error('rng.pick called with an empty list');
            }
            return items[Math.floor(next() * items.length)];
        },
        weightedPick: (items, weightOf) => {
            if (items.length === 0) {
                throw new Error('rng.weightedPick called with an empty list');
            }
            const weights = items.map((item) => Math.max(0, weightOf(item)));
            const total = weights.reduce((sum, w) => sum + w, 0);
            if (total <= 0) {
                return items[0];
            }
            let roll = next() * total;
            for (let i = 0; i < items.length; i += 1) {
                roll -= weights[i];
                if (roll <= 0) {
                    return items[i];
                }
            }
            return items[items.length - 1];
        },
        derive: (label) => createRng((numericSeed ^ hashSeed(label)) >>> 0),
    };
    return rng;
}
