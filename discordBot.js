const Discord = require("discord.js");
let config = require("./botConfig.json");
let bot = null;
let sentCounter = 0;
let sendingCounter = 0;

module.exports = {
    sendFile: function (file, fileInfo, dlAmount, logger) {
        const attachment = new Discord.Attachment(file, fileInfo.fileName);
        let channel = bot.channels.get(config.channels[fileInfo.course]);
        logger.info(`Sending (${++sendingCounter}/${dlAmount}) ${fileInfo.fileName}`);
        channel.send(fileInfo.fileName, attachment).then(m => {
            logger.info(`Sent (${++sentCounter}/${dlAmount}) ${m}`);
            if (sentCounter === dlAmount) {
                bot.destroy();
            }
        });
    },
    createBot: function() {
        bot = new Discord.Client({
            token: config.token,
            autorun: true
        });
    
        bot.login(config.token);
    },
    destroyBot: function() {
        bot.destroy();
    }
};