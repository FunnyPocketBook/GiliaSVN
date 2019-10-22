const request = require('request');
const jsdom = require('jsdom');
const fs = require('fs');
const log4js = require('log4js');
const parseString = require('xml2js').parseString;
const { JSDOM } = jsdom;
const svnSpawn = require('svn-spawn');
const { document } = (new JSDOM('')).window;
global.document = document;
log4js.configure({
    appenders: {
        ilias: {
            type: 'file',
            filename: 'ilias.log',
            maxLogSize: 1048576,
            compress: true
        },
        console: {
            type: 'console'
        }
    },
    categories: {
        default: {
            appenders: ['ilias', 'console'],
            level: 'info'
        }
    }
});
const logger = log4js.getLogger('ilias');
logger.info("-----");

let cookie = request.jar();
let config;
try {
    config = require('./config.js');
} catch (e) {
    logger.error("Please make sure that the link to the RSS feed is in one line and does not contain any line breaks.");
    log4js.shutdown(() => {
        process.exit();
    });
}
const pathToDir = config.userData.downloadDir.endsWith("/") ? config.userData.downloadDir : config.userData.downloadDir + "/";
const fileFile = config.userData.savedFilesDir.endsWith("/") ? config.userData.savedFilesDir + "files.json" : config.userData.savedFilesDir + "/files.json";
const ignoreFile = config.userData.ignoreDir.endsWith("/") ? config.userData.savedFilesDir + "ignore.txt" : config.userData.savedFilesDir + "/ignore.txt";
const svnRepo = config.userData.svnRepo;
const url = "https://ilias.uni-konstanz.de/ilias/ilias.php?lang=de&client_id=ilias_uni&cmd=post&cmdClass=ilstartupgui&cmdNode=vp&baseClass=ilStartUpGUI&rtoken=";
const data = {
    "username": config.userData.user,
    "password": config.userData.passwordIlias,
    "cmd[doStandardAuthentication]": "Anmelden"
}
const rss = config.userData.privateRssFeed.replace("-password-", config.userData.passwordRss);

let fileList = {}; // Stores file infos
let ignoreList = []; // Stores files to ignore
let downloadedCounter = 0;
let toDownloadCounter = 0;
let error = false;

logger.info("Download path: " + pathToDir);
logger.info("File list path: " + fileFile);
logger.info("Ignore file path: " + ignoreFile);
// Check if the pathToDir exists and if not, create it
if (!fs.existsSync(pathToDir)) {
    fs.mkdirSync(pathToDir);
}

getFileList();

/**
 * Read existing data from files.json
 */
function getFileList() {
    if (!fs.existsSync(fileFile)) {
        fs.closeSync(fs.openSync(fileFile, 'w'))
    }
    fs.readFile(fileFile, function (err, data) {
        if (err) {
            logger.error(err);
        }
        if (data.length > 0) {
            fileList = JSON.parse(data);
        }
    });

    if (!fs.existsSync(ignoreFile)) {
        fs.closeSync(fs.openSync(ignoreFile, 'w'))
    }
    fs.readFile(ignoreFile, function (err, data) {
        if (err) {
            logger.error(err);
        }
        if (data.length > 0) {
            let array = data.toString().replace(/\r\n/g, '\n').split('\n');
            for (i in array) {
                ignoreList.push(array[i]);
            }
        }
    });
    login();
}

/**
 * Login to ilias
 */
function login() {
    let t0 = (new Date).getTime();
    logger.info("Logging in ...");
    request({
        url: url,
        method: 'POST',
        followAllRedirects: true,
        form: data,
        jar: cookie,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
        }
    }, (error, response, body) => {
        const dom = new JSDOM(body);
        cookie._jar.store.getAllCookies(function (err, cookieArray) {
            if (err) throw new Error("Failed to get cookies");
            logger.debug(JSON.stringify(cookieArray, null, 4));
        });
        if (response.statusCode != 200) {
            logger.error("Status code " + response.statusCode);
            return;
        }
        if (error) {
            logger.error(error);
            return;
        }
        if (dom.window.document.querySelectorAll(".alert-danger").length != 0) {
            if (response.statusCode != 200) {
                logger.info("Status code: " + response.statusCode);
            }
            dom.window.document.querySelectorAll(".alert-danger").forEach(function (e) {
                logger.error(e.textContent.trim());
            })
            process.exit();
            return;
        }
        logger.info("Login successful, it took " + ((new Date).getTime() - t0) / 1000 + " seconds.");
        rssFeed(rss);
    });
    if (svnRepo.length > 0) {
        addSvnRepo();
    }
}

/**
 * Get RSS feed
 */
function rssFeed(rss) {
    let t0 = (new Date).getTime();
    logger.info("Getting RSS feed. This might take up to 20 seconds, please wait ...");
    request({
        url: rss,
        method: 'GET',
        followAllRedirects: true,
        jar: cookie,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
        }
    }, (error, body) => {
        if (error) {
            logger.error(error);
            return;
        }
        logger.info("RSS successful, it took " + ((new Date).getTime() - t0) / 1000 + " seconds.");
        getInfos(body);
    })
}

/**
 * Parse RSS feed and update files.json
 */
function getInfos(xmlBody) {
    let xml;
    let changed = false;
    if (xmlBody.statusCode !== 200) {
        logger.error(xmlBody.statusCode + ": " + xmlBody.statusMessage);
        switch (xmlBody.statusCode) {
            case 401:
                logger.error("Please check your login data.");
                break;
        }
        return;
    }
    parseString(xmlBody.body, function (err, result) {
        xml = result;
    });
    for (let i = 0; i < xml.rss.channel[0].item.length; i++) {
        // For each link that contains "target=file" (meaning there is a file to download), get the infos of that entry
        if (xml.rss.channel[0].item[i].link[0].includes("target=file")) {
            let course = xml.rss.channel[0].item[i].title[0].match(/\[(.*?)\]/)[1];
            let subfolders = course.split(" > ");
            let fileName = xml.rss.channel[0].item[i].title[0].match(/]\s(.*): Die Datei/)[1]; // TODO: Match the name without "Die Datei"
            let fileNumber = xml.rss.channel[0].item[i].link[0].match(/file_(\d*)/)[1];
            let fileDate = xml.rss.channel[0].item[i].pubDate[0];
            let temp = fileList;

            // Build up the object one key by one
            for (let j = 0; j < subfolders.length; j++) {
                if (!temp[subfolders[j]]) {
                    temp[subfolders[j]] = {};
                    changed = true;
                }
                temp = temp[subfolders[j]];
                if (j == subfolders.length - 1) {
                    // If file already exists and new file is newer than saved one, download and replace it and update timestamp
                    if (temp[fileName] != undefined && new Date(fileDate) > new Date(temp[fileName].fileDate)) {
                        temp[fileName].fileDate = fileDate;
                        changed = true;
                        if (!ignoreList.includes(fileName)) {
                            toDownloadCounter++;
                            downloadFile(subfolders, fileName, fileNumber);
                        }
                    }
                    // If file doesn't exist, download it and create new entry
                    else if (temp[fileName] == undefined) {
                        temp[fileName] = { "fileNumber": fileNumber, "fileDate": fileDate };
                        changed = true;
                        if (!ignoreList.includes(fileName)) {
                            toDownloadCounter++;
                            downloadFile(subfolders, fileName, fileNumber);
                        }
                    }
                }
            }
        }
    }
    // If nothing in the file information object has changed, don't rewrite the file
    if (!changed) {
        logger.info("No new files from RSS feed.");
    }
}


/**
 * Checkout SVN repositories
 */
function addSvnRepo() {
    svnRepo.forEach((url) => {
        let folder = url.replace("https://svn.uni-konstanz.de/", "").replace(/\/$/, "").split("/").slice(1).join("/");
        // Only checkout repo if it isn't a working copy already
        let svn = new svnSpawn({
            cwd: pathToDir + folder,
            username: config.userData.user,
            password: config.userData.passwordIlias,
            noAuthCache: true,
        });
        if (!fs.existsSync(pathToDir + folder)) {
            fs.mkdirSync(pathToDir + folder, { recursive: true });
        }
        // Check if path is working directory, if no checkout repo
        svn.cmd(["info", pathToDir + folder], function (err, data) {
            if (err) {
                if (err.message.includes("is not a working copy")) {
                    svn.cmd(["checkout", url, pathToDir + folder], function (err, data) {
                        err ? logger.error("Checkout of " + url + " failed! \r\n" + err.message) : logger.info("Checkout of " + url + " complete.");
                    });
                }
            }
        });
    });
    setTimeout(updateSvnRepo, 1000);
}

/**
 * Update SVN repositories
 */
function updateSvnRepo() {
    svnRepo.forEach((url) => {
        let folder = url.replace("https://svn.uni-konstanz.de/", "").replace(/\/$/, "").split("/").slice(1).join("/");
        let svn = new svnSpawn({
            cwd: pathToDir + folder,
            username: config.userData.user,
            password: config.userData.passwordIlias,
            noAuthCache: true,
        });
        // Check if path is working directory, if yes update repo
        svn.cmd(["info", pathToDir + folder], function (err, data) {
            if (!err) {
                svn.cmd(["update", pathToDir + folder], function (err, data) {
                    err ? logger.error("Update of " + url + " failed! \r\n" + err.message) : logger.info("Update of " + url + " complete.");
                });
            } else {
                logger.error(err.message);
            }
        });
    });
}

/**
 * Download the requested file
 * @param {*} fileName file name from getInfos()
 * @param {*} fileNumber file number from getInfos() to download the file
 */
function downloadFile(subfolders, fileName, fileNumber) {
    logger.info(toDownloadCounter + " Downloading " + fileName + " ...");
    let path = pathToDir;
    // Build the folder structure one by one in order to mkdir for each new dir
    for (let i = 0; i < subfolders.length; i++) {
        path += subfolders[i].replace(/[/\\?%*:|"<>]/g, '-');
        if (i != subfolders.length - 1) {
            path += "/";
        }
        // Create folder if it doesn't already exist
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    }
    let file = fs.createWriteStream(path + "/" + fileName.replace(/[/\\?%*:|"<>]/g, '-'));
    request({
        url: "https://ilias.uni-konstanz.de/ilias/goto_ilias_uni_file_" + fileNumber + "_download.html",
        method: 'GET',
        followAllRedirects: true,
        jar: cookie,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
        }
    }).pipe(file).on('finish', () => {
        downloadedCounter++;
        logger.info("(" + downloadedCounter + "/" + toDownloadCounter + ") Finished downloading: " + fileName);
        if (downloadedCounter == toDownloadCounter) {
            updateFileList();
            logger.info("All files finished downloading.");
        }
    }).on('error', (error) => {
        logger.error(error);
        error = true;
    })
}

/**
 * Update files.json
 */
function updateFileList() {
    if (!error) {
        fs.writeFile(fileFile, JSON.stringify(fileList, null, 4), (err) => {
            if (err) {
                logger.error("An error occurred, file list has not been updated.");
                logger.error(err);
            }
            logger.info("File list has been updated.");
        });
    }
}

process.on("SIGINT", () => {
    logger.info("Process manually aborted by user.");
    log4js.shutdown(() => {
        process.exit();
    });
});
