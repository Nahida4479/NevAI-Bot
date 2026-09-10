import fs from 'fs';

const MAX_SIZE = 1024 * 1024 * 1024;

function deleteOldestLine() {
    const lines = fs.readFileSync('debug.log', 'utf8').split('\n');
    const half = lines.slice(Math.floor(lines.length / 2));
    fs.writeFileSync('debug.log', half.join('\n'));
}

export function debugging(message) {
    if (process.env.DEBUG_MODE !== 'true') return;
    const line = `[${new Date().toISOString()}] ${message}\n`
    fs.appendFileSync(`debug.log`, line)

    const size = fs.statSync('debug.log').size;
    if (size > MAX_SIZE) {
        deleteOldestLine();
    }
}