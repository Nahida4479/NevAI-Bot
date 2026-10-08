import fs from 'fs';
import http from 'node:http';
import { debug_log_err, debug_log_success, debugging } from '../debug/debug.js';

const HistoryFilePath = './status_history.json';
const DAYS = 30;
const MINUTES_PER_DAY = 1440;
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

function dateKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function loadHistory() {
    try {
        if (fs.existsSync(HistoryFilePath)) {
            const raw = fs.readFileSync(HistoryFilePath, 'utf-8');
            if (raw.trim()) return JSON.parse(raw);
        }
    } catch (err) {
        debug_log_err('Load status history error (clear/repair status_history.json).');
        debugging(err);
    }
    return {};
}

function saveHistory(history) {
    try {
        fs.writeFileSync(HistoryFilePath, JSON.stringify(history));
    } catch (err) {
        debug_log_err('Write status history error.');
        debugging(err);
    }
}

function formatUptime(ms) {
    const minutes = Math.floor(ms / 60000);
    const d = Math.floor(minutes / MINUTES_PER_DAY);
    const h = Math.floor((minutes % MINUTES_PER_DAY) / 60);
    const m = minutes % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
}

function buildDays(history) {
    const now = Date.now();
    const days = [];
    let onlineTotal = 0;
    let expectedTotal = 0;

    for (let i = DAYS - 1; i >= 0; i--) {
        const key = dateKey(new Date(now - i * 86400000));
        const dayStart = Math.max(Date.parse(key), history.startedAt);
        const dayEnd = Math.min(Date.parse(key) + 86400000, now);
        const expected = Math.floor((dayEnd - dayStart) / 60000);
        if (key < history.firstDay || expected < 1) {
            days.push(key < history.firstDay ? 'none' : 'ok');
            continue;
        }
        const online = Math.min(history.days[key] || 0, expected);
        const ratio = online / expected;
        onlineTotal += online;
        expectedTotal += expected;
        days.push(ratio >= 0.99 ? 'ok' : ratio >= 0.9 ? 'warn' : 'down');
    }

    const uptimePercent = expectedTotal ? Math.round((onlineTotal / expectedTotal) * 1000) / 10 : 100;
    return { days, uptimePercent };
}

function startStatusServer(client) {
    if (!process.env.STATUS_PORT) return;
    const port = Number(process.env.STATUS_PORT);
    const allowedOrigin = process.env.STATUS_ALLOWED_ORIGIN || '*';

    const history = loadHistory();
    history.days ??= {};
    if (!Object.keys(history.days).length) {
        history.firstDay = dateKey();
        history.startedAt = Date.now();
    }
    history.startedAt ??= Date.parse(history.firstDay);

    setInterval(() => {
        if (!client.isReady()) return;
        const today = dateKey();
        history.days[today] = (history.days[today] || 0) + 1;

        const oldest = dateKey(new Date(Date.now() - DAYS * 86400000));
        for (const key of Object.keys(history.days)) {
            if (key < oldest) delete history.days[key];
        }
        saveHistory(history);
    }, 60000);

    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'GET' || req.url !== '/status') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }

        const online = client.isReady();
        const { days, uptimePercent } = buildDays(history);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            online,
            pingMs: online && client.ws.ping >= 0 ? client.ws.ping : null,
            uptime: online ? formatUptime(client.uptime) : '—',
            uptimePercent,
            servers: online ? client.guilds.cache.size : null,
            version: pkg.version,
            days,
            updatedAt: new Date().toISOString()
        }));
    });

    server.on('error', (err) => {
        debug_log_err(`Status server error: ${err.message}`);
        debugging(err);
    });

    server.listen(port, () => {
        debug_log_success(`Status server running on port ${port} (GET /status)`);
    });
}

export { startStatusServer };
