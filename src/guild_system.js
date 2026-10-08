function normalizeGuild(guildData) {
    if (!guildData || typeof guildData !== 'object') return;

    if (!Array.isArray(guildData.channels)) {
        guildData.channels = guildData.channel ? [guildData.channel] : [];
    }

    if (Array.isArray(guildData.history)) {
        const first = guildData.channels[0];
        guildData.histories = first ? { [first]: guildData.history } : {};
    }
    guildData.histories ??= {};

    delete guildData.channel;
    delete guildData.history;
}

export { normalizeGuild }