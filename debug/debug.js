import fs from 'fs';
import { styleText } from 'util';

const MAX_SIZE = 1024 * 1024 * 1024;

function deleteOldestLine() {
    const lines = fs.readFileSync('debug.log', 'utf8').split('\n');
    const half = lines.slice(Math.floor(lines.length / 2));
    fs.writeFileSync('debug.log', half.join('\n'));
}

function debug_log_err(msg) {
    console.log(styleText(['red', 'bold'], msg));
    debugging(msg)
}

function debug_log_warn(msg) {
    console.log(styleText(['yellow', 'bold'], msg))
    debugging(msg)
}

function debug_log_success(msg) {
    console.log(styleText(['green', 'bold'], msg))
}

function debugging(message) {
    if (process.env.DEBUG_MODE !== 'true') return;
    const line = `[${new Date().toISOString()}] ${message}\n`
    fs.appendFileSync(`debug.log`, line)

    const size = fs.statSync('debug.log').size;
    if (size > MAX_SIZE) {
        deleteOldestLine();
    }
}

export {debugging, debug_log_err, debug_log_success, debug_log_warn}