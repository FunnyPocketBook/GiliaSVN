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
    config = require("./config.js");
} catch (e) {
    logger.info("-----");
    logger.error("Please make sure that the link to the RSS feed is in one line and does not contain any line breaks.");
    log4js.shutdown(() => {
        process.exit();
    });
}

const pathToDir = config.userData.downloadDir.endsWith("/") ? config.userData.downloadDir : config.userData.downloadDir + "/";
const fileFile = config.userData.savedFilesDir.endsWith("/") ? config.userData.savedFilesDir + "files.json" : config.userData.savedFilesDir + "/files.json";
const ignoreFile = config.userData.ignoreDir.endsWith("/") ? config.userData.ignoreDir + "ignore.txt" : config.userData.ignoreDir + "/ignore.txt";
const svnRepo = config.userData.svnRepo;
const gitRepo = config.userData.gitRepo;
const loginData = {
    "username": config.userData.user,
    "cmd[doStandardAuthentication]": "Anmelden"
};
let rss;

let fileList = {}; // Stores file infos
let ignoreList = []; // Stores files to ignore
let ignoreCourse = []; // Stores courses to ignore
let downloadedCounter = 0;
let toDownloadCounter = 0;
let error = false;

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
        read({ prompt: "Ilias password: ", silent: true }, function (err, password) {
            loginData.password = password;
            encrypt(password, "ilias_key");
            read({ prompt: "RSS password: ", silent: true }, function (err, password) {
                rss = config.userData.privateRssFeed.replace("-password-", password);
                encrypt(password, "rss_key");
                getFileList();
            });
        });
    } else {
        getFileList();
    }
    //
}

/**
 * Read existing data from files.json and ignore.txt
 */
function getFileList() {
    if (!loginData.password) {
        loginData.password = decrypt("ilias_key");
        rss = config.userData.privateRssFeed.replace("-password-", decrypt("rss_key"));
    }
    logger.info("Download path: " + pathToDir);
    logger.info("File list path: " + fileFile);
    logger.info("Ignore file path: " + ignoreFile);
    if (!fs.existsSync(fileFile)) {
        fs.closeSync(fs.openSync(fileFile, "w"));
    }
    if (!fs.existsSync(ignoreFile)) {
        fs.mkdirSync(ignoreFile.replace("ignore.txt", ""), { recursive: true });
        fs.closeSync(fs.openSync(ignoreFile, "w"));
    }

    try {
        let fileContent = fs.readFileSync(fileFile, "utf-8");
        if (fileContent.length > 0) {
            fileList = JSON.parse(fileContent);
        }
        fileContent = fs.readFileSync(ignoreFile, "utf-8");
        if (fileContent.length > 0) {
            let array = fileContent.toString().replace(/\r\n/g, "\n").split("\n");
            for (let i in array) {
                if (!array[i].startsWith("Course:")) {
                    ignoreList.push(array[i].trim());
                } else {
                    ignoreCourse.push(array[i].replace("Course:", "").trim());
                }
            }
        }
    } catch (err) {
        logger.error(err);
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
    }, (error, response, body) => {
        const dom = new JSDOM(body);
        login(dom.window.document.querySelector("#form_").getAttribute("action"));
    });
}

/**
 * Login to ilias
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
            });
            process.exit();
            return;
        }
        logger.info("Login successful, it took " + ((new Date).getTime() - t0) / 1000 + " seconds.");
        rssFeed(rss);
    });
    if (svnRepo && svnRepo.length > 0) {
        updateSvn();
    }
    if (gitRepo && gitRepo.length > 0) {
        gitRepo.forEach((url) => {
            let user = config.userData.user;
            if (config.userData.userGitlab && config.userData.userGitlab !== "") {
                user = config.userData.userGitlab;
            }
            url = url.replace("https://", `https://${user}:${loginData.password}@`);
            gitClone(url);
        });
    }
}

/**
 * Get RSS feed
 */
function rssFeed(rss) {
    let t0 = (new Date).getTime();
    logger.info("Getting RSS feed. This might take a while...");
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
            logger.error(error);
            return;
        }
        logger.info("RSS successful, it took " + ((new Date).getTime() - t0) / 1000 + " seconds.");
        getInfos(body);
    });
}

/**
 * Parse RSS feed and update files.json
 */
function getInfos(xmlBody) {
    let xml;
    let changed = false;
    let downloadFilesList = [];
    if (xmlBody.statusCode !== 200) {
        logger.error("RSS feed: " + xmlBody.statusCode + ": " + xmlBody.statusMessage);
        switch (xmlBody.statusCode) {
        case 401:
            logger.error("RSS feed: Please check your login data. Delete the data folder in the root directory to enter your password again.");
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
            let fileToDownload = {
                course: course,
                subfolders: course.split(" > "),
                fileName: xml.rss.channel[0].item[i].title[0].match(/]\s(.*): Die Datei/)[1], // TODO: Match the name without "Die Datei"
                fileNumber: xml.rss.channel[0].item[i].link[0].match(/file_(\d*)/)[1],
                fileDate: xml.rss.channel[0].item[i].pubDate[0]
            };
            // Checks if file has already been downloaded or if there is an updated file
            let temp = fileList;
            if (ignoreCourse.includes(fileToDownload.subfolders[0])) {
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
        toDownloadCounter++;
        downloadFile(f);
    });
    // If nothing in the file information object has changed, don't rewrite the file
    if (!changed) {
        logger.info("No new files from RSS feed.");
    }
}

/**
 * Checkout SVN repositories
 */
function updateSvn() {
    svnRepo.forEach((url) => {
        let repo = url.replace("https://svn.uni-konstanz.de/", "").replace(/\/$/, "").split("/").slice(1).join("/");
        let svn = new svnSpawn({
            cwd: pathToDir + repo,
            username: config.userData.user,
            password: loginData.password,
            noAuthCache: true,
        });
        if (!fs.existsSync(pathToDir + repo)) {
            fs.mkdirSync(pathToDir + repo, { recursive: true });
        }
        // Check if path is working directory, if no checkout repo
        svn.getInfo(function(err) {
            if (err) { // Not a working copy
                svn.cmd(["checkout", url, "./"], function (error, data) { // Path is the path of the previous svn.cmd path
                    if (error){
                        logger.error("Checkout of " + repo + " failed! \r\n" + error.message);
                    }
                    if (data) {
                        let lines = data.split("\r\n").slice(1, -1);
                        if (!lines[0].includes("Checked out revision")) {
                            for (let line of lines) {
                                logger.info(repo + ": " + line);
                            }
                            logger.info("Checkout of " + url + " complete.");
                        }
                    }
                });
            } else {
                svn.update(function (error, data) { // Path is the path of the previous svn.cmd path
                    if (error){
                        logger.error("Update of " + repo + " failed! \r\n" + error.message);
                    }
                    if (data) {
                        let lines = data.split("\r\n").slice(1, -1);
                        if (!lines[0].includes("At revision")) {
                            for (let line of lines) {
                                logger.info(repo + ": " + line);
                            }
                            logger.info("Update of " + url + " complete.");
                        }
                    }
                });
            }
        });
    });
}


/**
 * Clone a git repo from https://git.uni-konstanz.de/
 * @param {string} url URL to git repo
 */
function gitClone(url) {
    let folder = url.slice(url.lastIndexOf("/") + 1, url.lastIndexOf("."));
    if (fs.existsSync(pathToDir + folder)) {
        git(pathToDir + folder).checkIsRepo((err, isRepo) => {
            if (!isRepo) {
                git(pathToDir).clone(url, pathToDir + folder, (err) => {
                    if (err) {
                        logger.error(err);
                    } else {
                        logger.info(`Cloned ${folder} successfully.`);
                    }
                    gitPull(folder);
                });
            } else {
                gitPull(folder);
            }
        });
    } else {
        git(pathToDir).clone(url, folder, (err) => {
            if (err) {
                logger.error(err);
            } else {
                logger.info(`Cloned ${folder} successfully.`);
            }
            gitPull(folder);
        });
    }
}

/**
 * Pull from git repo
 * @param {string} repoName name of git repo
 */
function gitPull(repoName) {
    git(pathToDir + repoName).pull(function (err, res) {
        if (err) {
            logger.error(err);
        }
        if (res.deleted.length > 0) {
            logger.info(`${repoName}: Deleted ${res.deleted.length} files: ${res.deleted.join(", ")}`);
        }
        if (res.created.length > 0) {
            logger.info(`${repoName}: Added ${res.deleted.length} files: ${res.created.join(", ")}`);
        }
        if (Object.keys(res.insertions).length > 0) {
            logger.info(`${repoName}: Changed ${Object.keys(res.insertions).length} files: ${Object.keys(res.insertions).join(", ")}`);
        }
    });
}

/**
 * Download the requested file
 * @param {{}} downloadFile file object to download
 */
function downloadFile(downloadFile) {
    logger.info(toDownloadCounter + " Downloading " + downloadFile.fileName + " ...");
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
        downloadedCounter++;
        logger.info("(" + downloadedCounter + "/" + toDownloadCounter + ") Finished downloading: " + downloadFile.fileName);
        if (downloadedCounter == toDownloadCounter) {
            updateFileList();
            logger.info("All files finished downloading.");
        }
    }).on("error", (error) => {
        logger.error(error);
        error = true;
    });
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
