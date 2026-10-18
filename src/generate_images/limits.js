import { debug_log_warn } from "../../debug/debug.js";

const INFOGRAPHIC_LIMITS = {
    user: readLimit('INFOGRAPHIC_DAILY_LIMIT_USER', 5),
    global: readLimit('INFOGRAPHIC_DAILY_LIMIT_GLOBAL', 30),
    parallel: readLimit('INFOGRAPHIC_MAX_PARALLEL', 5)
};

const USER_DAILY_LIMIT = INFOGRAPHIC_LIMITS.user.value;
const GLOBAL_DAILY_LIMIT = INFOGRAPHIC_LIMITS.global.value;
const MAX_PARALLEL = INFOGRAPHIC_LIMITS.parallel.value;

let image_running = 0;

let day = today();
let globalCount = 0;
const perUser = new Map();

function today() {
    return new Date().toISOString().slice(0, 10);
}

function readLimit(name, fallback) {
    const raw = process.env[name]?.trim();
    if (!raw) return { value: fallback, source: 'default' };

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        debug_log_warn(`${name}="${raw}" is not a valid number, using default ${fallback}`);
        return { value: fallback, source: 'default (invalid value)' };
    }
    return { value, source: '.env' };
}


function rollover() {
    if (day !== today()) {
        day = today();
        globalCount = 0;
        perUser.clear();
    }
}

function reserveImageSlot(userId) {
    rollover();

    if (image_running >= MAX_PARALLEL) {
        return { ok: false, message: 'Too many infographics are being generated right now. Ask the user to try again in a minute.'}
    }

    if (globalCount >= GLOBAL_DAILY_LIMIT) {
        return { ok: false, message: `The bot daily infopraphic limit ${GLOBAL_DAILY_LIMIT} has been reached. Tell the user to try again tomorrow.`}
    }

    const used = perUser.get(userId) ?? 0;
    if (used >= USER_DAILY_LIMIT) {
        return { ok: false, message: `The user reached their daily image limit ${USER_DAILY_LIMIT}. Tell them to try again tomorrow` };
    }
    
    image_running++
    globalCount++
    perUser.set(userId, used + 1)
    return { ok: true }
}

function releaseImageSlot(userId, success) {
    image_running = Math.max(0, image_running -1);
    if (!success) {
        globalCount = Math.max(0, globalCount -1);
        perUser.set(userId, Math.max(0, (perUser.get(userId) ?? 1) - 1))
    }
}


export { reserveImageSlot, releaseImageSlot, readLimit, INFOGRAPHIC_LIMITS as infographicLimits };



