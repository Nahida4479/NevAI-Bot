import { loadData, saveData } from '../../save_data.js';
import { debugging, debug_log_err, debug_log_success } from '../../../debug/debug.js';
import { readLimit } from '../limits.js';

const LIMITS = {
    user: readLimit('GENERATE_IMAGE_LIMIT_USER', 5),
    global: readLimit('GENERATE_IMAGE_LIMIT_GLOBAL', 10),
    parallel: readLimit('GENERATE_IMAGE_LIMIT_PARALLEL', 10)
};

const LIMIT_USER = LIMITS.user.value;
const LIMIT_GLOBAL = LIMITS.global.value;
const LIMIT_PARALLEL = LIMITS.parallel.value;
const KEY = '_image_usage';

let running = 0;

const today = () => new Date().toISOString().slice(0, 10); 

function getUsage(data) {
    const usage = data[KEY];
    if (usage?.date === today()) return usage;
    return { date: today(), global: 0, users: {} };
}

function reserveImageSlot(userId) {
    if (LIMIT_PARALLEL && running >= LIMIT_PARALLEL) return 'IMAGE_LIMIT_PARALLEL';

    const data = loadData();
    const usage = getUsage(data);
    if (LIMIT_GLOBAL && usage.global >= LIMIT_GLOBAL) return 'IMAGE_LIMIT_GLOBAL';
    if (LIMIT_USER && (usage.users[userId] ?? 0) >= LIMIT_USER) return 'IMAGE_LIMIT_USER';

    usage.global += 1;
    usage.users[userId] = (usage.users[userId] ?? 0) + 1;
    data[KEY] = usage;
    saveData(data);
    running += 1;
    return null;
}

function releaseImageSlot(userId, success) {
    running -= 1;
    if (success) return;

    const data = loadData();
    const usage = getUsage(data);
    usage.global = Math.max(0, usage.global - 1);
    usage.users[userId] = Math.max(0, (usage.users[userId] ?? 1) - 1);
    data[KEY] = usage;
    saveData(data);
}

export { reserveImageSlot, releaseImageSlot, LIMITS as imageLimits };