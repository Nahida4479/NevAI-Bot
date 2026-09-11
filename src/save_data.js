import fs from 'fs';
import { debug_log_err, debugging } from '../debug/debug.js';

const JSONFilePath = './data.json';

function loadData() {
    try {
    if (!fs.existsSync(JSONFilePath)) {
        fs.writeFileSync(JSONFilePath, JSON.stringify({}));
    }
    const raw = fs.readFileSync(JSONFilePath, 'utf-8');
    return JSON.parse(raw)
} catch (err) {
    const data_err = 'Load data error (clear/repair data.json).'
    debug_log_err(data_err)
    debugging(err)
    return {};
}
}

function saveData(data) {
    try {
    fs.writeFileSync(JSONFilePath, JSON.stringify(data, null, 2));
    } catch (err) {
        const data_err_wr = `Write data error.`
        debug_log_err(data_err_wr)
        debugging(err)
    }
}

export { loadData, saveData}