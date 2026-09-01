import fs from 'fs';

const JSONFilePath = './data.json';

function loadData() {
    if (!fs.existsSync(JSONFilePath)) {
        fs.writeFileSync(JSONFilePath, JSON.stringify({}));
    }
    const raw = fs.readFileSync(JSONFilePath, 'utf-8');
    return JSON.parse(raw)
}

function saveData(data) {
    fs.writeFileSync(JSONFilePath, JSON.stringify(data, null, 2));
}

export { loadData, saveData}