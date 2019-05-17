const request = require('request');
const jsdom = require('jsdom');
const fs = require('fs');
const parseString = require('xml2js').parseString;
const { JSDOM } = jsdom;
const { document } = (new JSDOM('')).window;
let config;
try {
    config = require('./config.js');
} catch(e) {
    console.error("Please make sure that the link to the RSS feed is in one line and does not contain any line breaks.");
    process.exit();
}
const fileFile = "files.json";
global.document = document;

const url = "https://ilias.uni-konstanz.de/ilias/ilias.php?lang=de&client_id=ilias_uni&cmd=post&cmdClass=ilstartupgui&cmdNode=vl&baseClass=ilStartUpGUI&rtoken=";
const data = {
    "username": config.userData.user,
    "password": config.userData.passwordIlias,
    "cmd[doStandardAuthentication]": "Anmelden"
}
const pathToDir = config.userData.downloadDir.replace(/\\/g, "/");
const rss = config.userData.privateRssFeed.replace("-password-", config.userData.passwordRss);


let fileList = {} // Stores file infos
let downloadedCounter = 0;
let toDownloadCounter = 0;
let error = false;

// Check if the pathToDir exists and if not, create it
if (!fs.existsSync(pathToDir)) {
    fs.mkdirSync(pathToDir);
}

getFileList();

/**
 * Read existing data from files.json
 */
function getFileList() {
    if (!fs.existsSync("./" + fileFile)) {
        fs.closeSync(fs.openSync("./" + fileFile, 'w'))
    }   
    fs.readFile(fileFile, function (err, data) {
        if (err) {
            console.error(err);
        }
        if (data.length > 0) {
            fileList = JSON.parse(data);
        }
    });
    login();
}

/**
 * Login to ilias
 */
function login() {
    let t0 = (new Date).getTime();
    console.log("Logging in ...");
    request({
        url: url,
        method: 'POST',
        followAllRedirects: true,
        form: data,
        jar: true
    }, (error, response, body) => {
        const dom = new JSDOM(body);
        if (error) {
            console.error(error);
            return;
        }
        if (dom.window.document.querySelectorAll(".alert").length != 0) {
            if (response.statusCode != 200) {
                console.log("Status code: " + response.statusCode);
            }
            dom.window.document.querySelectorAll(".alert").forEach(function (e) {
                console.error(e.textContent.trim());
            })
            process.exit();
            return;
        }
        console.log("Login successful, it took " + ((new Date).getTime() - t0) / 1000 + " seconds.");
        console.log("-");
        rssFeed(rss);
    })
}

/**
 * Get RSS feed
 */
function rssFeed(rss) {
    let t0 = (new Date).getTime();
    console.log("Getting RSS feed. This might take up to 20 seconds, please wait ...");
    request({
        url: rss,
        method: 'GET',
        followAllRedirects: true,
        jar: true
    }, (error, body) => {
        if (error) {
            console.error(error);
            return;
        }
        console.log("RSS successful, it took " + ((new Date).getTime() - t0) / 1000 + " seconds. \n");
        console.log("-");
        getInfos(body);
    })
}

/**
 * Parse RSS feed and update files.json
 */
function getInfos(xmlBody) {
    let xml;
    let changed = false;
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
                    if (temp[fileName] != undefined && new Date(fileDate) > new Date(temp[fileName].fileDate)) { // If file already exists and new file is newer than saved one
                        temp[fileName].fileDate = fileDate;
                        toDownloadCounter++;
                        changed = true;
                        downloadFile(subfolders, fileName, fileNumber);
                    } else if (temp[fileName] == undefined) { // If file doesn't exist
                        temp[fileName] = {"fileNumber": fileNumber, "fileDate": fileDate};
                        toDownloadCounter++;
                        changed = true;
                        downloadFile(subfolders, fileName, fileNumber);
                    }
                }
            }
        }
    }
    // If nothing in the file information object has changed, don't rewrite the file
    if (!changed) {
        console.log("No new files.");
        process.exit();
    }
}

/**
 * Download the requested file
 * @param {*} fileName file name from getInfos()
 * @param {*} fileNumber file number from getInfos() to download the file
 */
function downloadFile(subfolders, fileName, fileNumber) {
    console.log(toDownloadCounter + " Downloading " + fileName + " ...");
    let path = pathToDir + "/";
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
        jar: true
    }).pipe(file).on('finish', () => {
        downloadedCounter++;
        console.log("(" + downloadedCounter + "/" + toDownloadCounter + ") Finished downloading: " + fileName);
        if (downloadedCounter == toDownloadCounter) {
            updateFileList();
            console.log("-");
            console.log("All files finished downloading.");
            setTimeout(function() {
                process.exit();
            }, 1000);
        }
    }).on('error', (error) => {
        console.log(error);
        error = true;
    })
}

/**
 * Update files.json
 */
function updateFileList() {
    if (!error) {
        fs.writeFile(fileFile, JSON.stringify(fileList), (err) => {
            if (err) {
                console.error("An error occurred, file list has not been updated.");
                console.error(err);
            }
            console.log("File list has been updated.");
        });
    }
}

process.on("SIGINT", () => {
    console.log("Process manually aborted by user.");
    process.exit();
});

process.on("exit", () => {
    console.log("Process shutting down.");
})