const request = require("request");
const jsdom = require("jsdom");
const fs = require("fs");
const log4js = require("log4js");
const parseString = require("xml2js").parseString;
const { JSDOM } = jsdom;
const svnSpawn = require("svn-spawn");
const crypto = require("crypto");
const git = require("simple-git");
const read = require("read");
let giliaSvnBot;
const { document } = (new JSDOM("")).window;
global.document = document;
const logger = log4js.getLogger("ilias");
log4js.configure({
    appenders: {
        ilias: {
            type: "file",
            filename: "ilias.log",
            maxLogSize: 1048576,
            compress: true
        },
        console: {
            type: "console"
        }
    },
    categories: {
        default: {
            appenders: ["ilias", "console"],
            level: "info"
        }
    }
});

let cookie = request.jar();
let config;
try {
    config = require("./config.json");
} catch (e) {
    logger.info("-----");
    logger.error("Please make sure that the link to the RSS feed is in one line and does not contain any line breaks.");
    log4js.shutdown(() => {
        process.exit();
    });
}

if (config.discordBot) {
    giliaSvnBot = require("./discordBot");
    giliaSvnBot.createBot();
}

const pathToDir = config.downloadDir.endsWith("/") ? config.downloadDir : config.downloadDir + "/";
const fileFile = config.savedFilesDir.endsWith("/") ? config.savedFilesDir + "files.json" : config.savedFilesDir + "/files.json";
const svnRepo = config.svnRepo;
const gitRepo = config.gitRepo;
const loginData = {
    "username": config.user,
    "cmd[doStandardAuthentication]": "Anmelden"
};
let rss;

let fileList = {}; // Stores file infos
let ignoreList = config.ignoreFile; // Stores files to ignore
let ignoreCourse = config.ignoreCourse; // Stores courses to ignore
let ignoreExtension = config.ignoreExtension; // Stores extensions to ignore
let errorDlFile = false; //
let downloading = 0;
let downloaded = 0;
let promiseSent = [];

// Check if the pathToDir exists and if not, create it
if (!fs.existsSync(pathToDir)) {
    fs.mkdirSync(pathToDir);
}

main();

/**
 * Start program and prompt for password if not stored already
 */
function main() {
    logger.info("-----");
    if (!fs.existsSync("./data/ilias_key") || !fs.existsSync("./data/ilias_key_r" || !fs.existsSync("./data/rss_key") || !fs.existsSync("./data/rss_key_r"))) {
        read({ prompt: "Ilias password: ", silent: true }, function(err, password) {
            loginData.password = password;
            encrypt(password, "ilias_key");
            read({ prompt: "RSS password: ", silent: true }, function(err, password) {
                rss = config.privateRssFeed.replace("-password-", password);
                encrypt(password, "rss_key");
                getFileList();
            });
        });
    } else {
        getFileList();
    }
}

/**
 * Read existing data from files.json and ignore.txt
 */
function getFileList() {
    if (!loginData.password) {
        loginData.password = decrypt("ilias_key");
        rss = config.privateRssFeed.replace("-password-", decrypt("rss_key"));
    }
    logger.info("Download path: " + pathToDir);
    logger.info("File list path: " + fileFile);
    if (!fs.existsSync(fileFile)) {
        fs.closeSync(fs.openSync(fileFile, "w"));
    }

    try {
        let fileContent = fs.readFileSync(fileFile, "utf-8");
        if (fileContent.length > 0) {
            fileList = JSON.parse(fileContent);
        }
    } catch (err) {
        logger.error(err);
        return;
    }
    getLoginLink();
}

/**
 * Get login link dynamically as it changes every version update
 */
function getLoginLink() {
    request({
        url: "https://ilias.uni-konstanz.de/ilias/login.php",
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36"
        }
    }, (error, response) => {
        if (error) {
            logger.error(error);
            return;
        }
        const dom = new JSDOM(response.body);
        login(dom.window.document.querySelector("#form_").getAttribute("action"));
    });
}

/**
 * Log into ilias
 * @param {string} url Login URL for ilias
 */
function login(url) {
    let t0 = (new Date).getTime();
    logger.info("Logging in ...");
    request({
        url: "https://ilias.uni-konstanz.de/ilias/" + url,
        method: "POST",
        followAllRedirects: true,
        form: loginData,
        jar: cookie,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
            "Upgrade-Insecure-Requests": 1
        }
    }, (error, response, body) => {
        const dom = new JSDOM(body);
        if (response.statusCode != 200) {
            logger.error("[Ilias] Status code " + response.statusCode);
            return;
        }
        if (error) {
            logger.error(`[Ilias] ${error}`);
            return;
        }
        if (dom.window.document.querySelectorAll(".alert-danger").length != 0) {
            if (response.statusCode != 200) {
                logger.error("[Ilias] Status code: " + response.statusCode);
            }
            dom.window.document.querySelectorAll(".alert-danger").forEach(function(e) {
                logger.error(`[Ilias] ${e.textContent.trim()}`);
            });
            process.exit();
        }
        logger.info(`[Ilias] Login successful, it took ${((new Date).getTime() - t0) / 1000} seconds.`);
        rssFeed(rss);
    });
    if (svnRepo && svnRepo.length > 0) {
        svnRepo.forEach(updateSvn);
    }
    if (gitRepo && gitRepo.length > 0) {
        gitRepo.forEach((url) => {
            let user = config.user;
            if (config.userGitlab && config.userGitlab !== "") {
                user = config.userGitlab;
            }
            url = url.replace("https://", `https://${user}:${loginData.password}@`);
            gitClone(url);
        });
    }
}


/**
 * Get RSS feed
 * @param {string} rss URL to private RSS feed
 */
function rssFeed(rss) {
    let t0 = (new Date).getTime();
    logger.info("[RSS] Getting RSS feed. This might take a while...");
    request({
        url: rss,
        method: "GET",
        followAllRedirects: true,
        jar: cookie,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36"
        }
    }, (error, body) => {
        if (error) {
            logger.error(`[RSS] ${error}`);
            return;
        }
        logger.info(`[RSS] RSS successful, it took ${((new Date).getTime() - t0) / 1000} seconds.`);
        rssDownload(body);
    });
}

/**
 * Downloads files from the RSS feed
 * @param {string} xmlBody XML as string from the RSS feed
 */
function rssDownload(xmlBody) {
    let xml;
    let changed = false;
    let downloadFilesList = [];
    if (xmlBody.statusCode !== 200) {
        logger.error(`[RSS] ${xmlBody.statusCode}: ${xmlBody.statusMessage}`);
        switch (xmlBody.statusCode) {
            case 401:
                logger.error("RSS feed: Please check your login data. Delete the data folder in the root directory to enter your password again.");
                break;
        }
        return;
    }
    parseString(xmlBody.body, function(err, result) {
        xml = result;
    });
    for (let i = 0; i < xml.rss.channel[0].item.length; i++) {
        // For each link that contains "target=file" (meaning there is a file to download), get the infos of that entry
        if (xml.rss.channel[0].item[i].link[0].includes("target=file")) {
            let subfolders = xml.rss.channel[0].item[i].title[0].match(/\[(.*?)\]/)[1].split(" > ");
            let fileToDownload = {
                course: subfolders[0],
                subfolders: subfolders,
                fileName: xml.rss.channel[0].item[i].title[0].match(/]\s(.*): Die Datei/)[1], // TODO: Match the name without "Die Datei"
                fileNumber: xml.rss.channel[0].item[i].link[0].match(/file_(\d*)/)[1],
                fileDate: xml.rss.channel[0].item[i].pubDate[0]
            };
            fileToDownload.extension = fileToDownload.fileName.substring(fileToDownload.fileName.lastIndexOf("."));
            // Checks if file has already been downloaded or if there is an updated file
            let temp = fileList;
            if (ignoreCourse.includes(fileToDownload.subfolders[0]) || ignoreExtension.includes(fileToDownload.extension)) {
                continue;
            }
            // Build up the object one key by one
            for (let j = 0; j < fileToDownload.subfolders.length; j++) {
                if (!temp[fileToDownload.subfolders[j]]) { // If the subfolder is empty, meaning there are no files yet (new files were uploaded)
                    temp[fileToDownload.subfolders[j]] = {};
                    changed = true;
                }
                temp = temp[fileToDownload.subfolders[j]]; // Go into this subfolder
                if (j == fileToDownload.subfolders.length - 1) {
                    // If file already exists and new file is newer than saved one, download and replace it and update timestamp
                    if (temp[fileToDownload.fileName] != undefined && new Date(fileToDownload.fileDate) > new Date(temp[fileToDownload.fileName].fileDate)) {
                        temp[fileToDownload.fileName].fileDate = fileToDownload.fileDate;
                        changed = true;
                        if (!ignoreList.includes(fileToDownload.fileName)) {
                            downloadFilesList.push(fileToDownload);
                        }
                    }
                    // If file doesn't exist, download it and create new entry
                    else if (temp[fileToDownload.fileName] == undefined) {
                        temp[fileToDownload.fileName] = { "fileNumber": fileToDownload.fileNumber, "fileDate": fileToDownload.fileDate };
                        changed = true;
                        if (!ignoreList.includes(fileToDownload.fileName)) {
                            downloadFilesList.push(fileToDownload);
                        }
                    }
                }
            }
        }
    }
    downloadFilesList.forEach(f => {
        downloadFile(f, downloadFilesList.length);
    });
    // If nothing in the file information object has changed, don't rewrite the file
    if (!changed) {
        logger.info("No new files from RSS feed.");
        if (config.discordBot) {
            giliaSvnBot.destroyBot();
        }
    }
}

/**
 * Checkout or update SVN repositories
 */
function updateSvn(url) {
    let repo = url.replace("https://svn.uni-konstanz.de/", "").replace(/\/$/, "").split("/").slice(1).join("/");
    let svn = new svnSpawn({
        cwd: pathToDir + repo,
        username: config.user,
        password: loginData.password,
        noAuthCache: true,
    });
    if (!fs.existsSync(pathToDir + repo)) {
        fs.mkdirSync(pathToDir + repo, { recursive: true });
    }
    // Check if path is working copy, if not, checkout repo
    svn.getInfo(function(error) {
        if (error) { // Not a working copy
            svn.cmd(["checkout", url, "./"], function(error, data) {
                if (error) {
                    logger.error(`[SVN] Checkout of ${repo} failed! Attempting svn cleanup.\r\n${error.message}`);
                    svn.cmd(["cleanup", url, "./"], function(error) {
                        if (error) {
                            logger.error(`[SVN] Cleanup of ${repo} failed!\r\n${error.message}`);
                        }
                    });
                }
                if (data) {
                    let lines = data.split("\r\n").slice(1, -1);
                    if (!lines[0].includes("Checked out revision")) {
                        for (let line of lines) {
                            logger.info(`[SVN] ${repo}: ${line}`);
                        }
                        logger.info(`[SVN] Checkout of ${url} complete.`);
                    }
                }
            });
        } else {
            svn.update(function(error, data) {
                if (error) {
                    logger.error(`[SVN] Update of ${repo} failed! Attempting svn cleanup.\r\n${error.message}`);
                    svn.cmd(["cleanup", url, "./"], function(error) {
                        if (error) {
                            logger.error(`[SVN] Cleanup of ${repo} failed! \r\n${error.message}`);
                        }
                    });
                }
                if (data) {
                    let lines = data.split("\r\n").slice(1, -1);
                    if (!lines[0].includes("At revision")) {
                        for (let line of lines) {
                            logger.info(repo + ": " + line);
                        }
                        logger.info(`[SVN] Update of ${url} complete.`);
                    }
                }
            });
        }
    });
}


/**
 * Clone a git repo from https://git.uni-konstanz.de/
 * @param {string} url URL to git repo
 */
function gitClone(url) {
    let repoName = url.slice(url.lastIndexOf("/") + 1, url.lastIndexOf("."));
    if (fs.existsSync(pathToDir + repoName)) {
        git(pathToDir + repoName).checkIsRepo((err, isRepo) => {
            if (!isRepo) {
                git(pathToDir).clone(url, pathToDir + repoName, (e) => {
                    if (e) {
                        logger.error(`[Git] Error cloning ${repoName}\r\n${e}`);
                    } else {
                        logger.info(`[Git] Cloned ${repoName} successfully.`);
                    }
                });
            } else {
                gitPull(repoName);
            }
        });
    } else {
        git(pathToDir).clone(url, repoName, (e) => {
            if (e) {
                logger.error(`[Git] Error cloning ${repoName}\r\n${e}`);
            } else {
                logger.info(`[Git] Cloned ${repoName} successfully.`);
            }
        });
    }
}

/**
 * Pull from git repo
 * @param {string} repoName name of git repo
 */
function gitPull(repoName) {
    git(pathToDir + repoName).pull(function(e, res) {
        if (e) {
            logger.error(`[Git] Error pulling ${repoName}\r\n${e}`);
        }
        if (res.deleted.length > 0) {
            logger.info(`[Git] ${repoName}: Deleted ${res.deleted.length} files: ${res.deleted.join(", ")}`);
        }
        if (res.created.length > 0) {
            logger.info(`[Git] ${repoName}: Added ${res.deleted.length} files: ${res.created.join(", ")}`);
        }
        if (Object.keys(res.insertions).length > 0) {
            logger.info(`[Git] ${repoName}: Changed ${Object.keys(res.insertions).length} files: ${Object.keys(res.insertions).join(", ")}`);
        }
    });
}

/**
 * Download the requested ilias file
 * @param {{}} downloadFile object of file to download
 */
function downloadFile(downloadFile, dlAmnt) {
    logger.info(`[Ilias] Downloading (${++downloading}/${dlAmnt}): ${downloadFile.fileName}...`);
    let path = pathToDir;
    // Build the folder structure one by one in order to mkdir for each new dir
    for (let i = 0; i < downloadFile.subfolders.length; i++) {
        path += downloadFile.subfolders[i].replace(/[/\\?%*:|"<>]/g, "-");
        if (i != downloadFile.subfolders.length - 1) {
            path += "/";
        }
        // Create folder if it doesn't already exist
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }
    let file = fs.createWriteStream(path + "/" + downloadFile.fileName.replace(/[/\\?%*:|"<>]/g, "-"));
    request({
        url: "https://ilias.uni-konstanz.de/ilias/goto_ilias_uni_file_" + downloadFile.fileNumber + "_download.html",
        method: "GET",
        followAllRedirects: true,
        jar: cookie,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36"
        }
    }).pipe(file).on("finish", () => {
        logger.info(`[Ilias] Downloaded (${++downloaded}/${dlAmnt}): ${downloadFile.fileName}`);
        if (config.discordBot) {
            const buffer = fs.readFileSync(path + "/" + downloadFile.fileName.replace(/[/\\?%*:|"<>]/g, "-"));
            promiseSent.push(giliaSvnBot.sendFile(buffer, downloadFile, dlAmnt, logger));
        }
        if (downloaded == dlAmnt) {
            updateFileList();
            logger.info("[Ilias] All files finished downloading.");
            if (config.discordBot) {
                Promise.all(promiseSent).then(() => {
                    giliaSvnBot.destroyBot();
                });
            }
        }
    }).on("error", (error) => {
        logger.error("[Ilias] " + error);
        errorDlFile = true;
    });
}

/**
 * Update files.json
 */
function updateFileList() {
    if (!errorDlFile) {
        fs.writeFile(fileFile, JSON.stringify(fileList, null, 4), (err) => {
            if (err) {
                logger.error("[Ilias] An error occurred, file list has not been updated.\r\n" + err);
            }
            logger.info("[Ilias] File list has been updated.");
        });
    }
}

/**
 * Encrpypts a string and stores it in a file under ./data/
 * @param {string} text String to encrypt
 * @param {string} filename Name of file where the encrypted string is stored
 */
function encrypt(text, filename) {
    if (!fs.existsSync("./data/")) {
        fs.mkdirSync("./data/");
    }
    let key = crypto.randomBytes(32);
    let iv = crypto.randomBytes(16);
    let wstream = fs.createWriteStream("./data/" + filename);
    wstream.write(key);
    wstream.end();
    let cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    let result = { iv: iv.toString("hex"), encryptedData: encrypted.toString("hex") };
    let wkeystream = fs.createWriteStream("./data/" + filename + "_r");
    wkeystream.write(JSON.stringify(result));
    wstream.end();
    return result;
}

/**
 * Decrypts string from file
 * @param {string} filename Name of file of encrypted string
 */
function decrypt(filename) {
    let key = fs.readFileSync("./data/" + filename);
    let text = JSON.parse(fs.readFileSync("./data/" + filename + "_r", "utf-8"));
    let iv = Buffer.from(text.iv, "hex");
    let encryptedText = Buffer.from(text.encryptedData, "hex");
    let decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

process.on("SIGINT", () => {
    logger.info("Process manually aborted by user.");
    log4js.shutdown(() => {
        process.exit();
    });
});