const Discord = require("discord.js");
let config = require("./botConfig.json");
let bot = null;
let sentCounter = 0;
let sendingCounter = 0;

module.exports = {
    sendFile: async function (file, fileInfo, dlAmount, logger) {
        const attachment = new Discord.Attachment(file, fileInfo.fileName);
        let channel = bot.channels.get(config.channels[fileInfo.course]);
        logger.info(`[DiscordBot] Sending (${++sendingCounter}/${dlAmount}) ${fileInfo.fileName}`);
        try {
            let message = await channel.send(fileInfo.fileName, attachment);
            logger.info(`[DiscordBot] Sent (${++sentCounter}/${dlAmount}) ${message}`);
        } catch (e) {
            logger.error(`[DiscordBot] Error sending ${fileInfo.fileName}: ${e}`);
        }
    },
    createBot: function () {
        bot = new Discord.Client({
            token: config.token,
            autorun: true
        });

        bot.login(config.token);
    },
    destroyBot: function () {
        bot.destroy();
    }
};