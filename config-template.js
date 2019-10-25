exports.userData = {
    user: "username",
    passwordIlias: "iliasPassword",
    privateRssFeed: "privateRssFeedURL",
    passwordRss: "RssPassword",
    svnRepo: ["https://svn.uni-konstanz.de/repo/"], // Leave array empty (meaning []) if no SVN repo is to be checked out
    gitRepo: ["https://git.uni-konstanz.de/repo/"], // Leave array empty (meaning []) if no git repo is to be checked out
    downloadDir: "pathToDownloadDirectory",
    savedFilesDir: "pathToFilesDirectory", // files.json is a list of the downloaded files
    ignoreDir: "pathToIgnoreDirectory" // ignore.txt is a file where you can specify which files to not to download
};