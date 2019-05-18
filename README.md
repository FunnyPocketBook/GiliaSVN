# ilias-scraper
## How to use

1. Install Node.js
2. Clone repository
3. Run `npm install` in the terminal
4. Get your private RSS feed link on ILIAS
5. Configure the `config-template.js` file. Replace any backslashes with forward slashes in the path and don't have a line break in the privateRssFeed link. Example:
    ```javascript
    exports.userData = {
    user: "ying-kai.dang",
    passwordIlias: "hunter2",
    privateRssFeed: "https://ying-kai.dang:-password-@ilias.uni-konstanz.de/ilias/privfeed.php?client_id=ilias_uni&user_id=userid&hash=hash",
    passwordRss: "hunter2Rss",
    downloadDir: "C:/Users/user/iliasFiles"
    };
    ```
6. Rename config-template.js to config.js
7. (optional) Create a file `ignore.txt` and add one filename per line to not download that file.
8. Run `node ilias-scraper.js` in the terminal

### Requirements
This script uses Node.js. If you don't have it, head to [Node.js](https://nodejs.org/en/) and download the latest LTS version for your OS. Then install it and follow the install instructions.

### "Installation"
Click on the green "Clone or download" button and press "Download ZIP" or clone the repo to your desired location. Unpack the downloaded .zip.
Open the command prompt/terminal in that location and enter `npm install` to install the dependencies.

![github repo link](https://i.imgur.com/PlRoCY3.png)

### Config Setup
#### config.js

Go to the location where you unpacked/cloned the repo to and open the `config.js` file in your desired text editor.

#### RSS feed

Go to the [ILIAS](https://ilias.uni-konstanz.de) dashboard/personal desktop and click the orange RSS button on the left. This will lead you to another page, where it will tell you where to enable your private personal feed-URL. Once you have done that, copy the private personal feed-URL and navigate to the `config.js` file, where you set the `privateRssFeed` to the URl you copied. 
Make sure the URL does not have any line breaks and is all in one line.

![ILIAS RSS link](https://i.imgur.com/0rUIp7M.png)

#### Credentials

Enter your ILIAS username and password in the placeholders. The username is usually `firstname.lastname`. In `passwordRss`, enter the password you set for the RSS feed. You can change it by clicking

#### Download directory

Create a folder somewhere where the files should be downloaded to. Then copy the  path to that location (e.g. `C:/Users/user/iliasFiles`) and replace `path to download directory` with the path you copied. <b>Please replace any backslashes `\` with forward slashes `/`</b>. The path should only have backslashes if you are using a Windows system.

Example config:
```javascript
exports.userData = {
    user: "ying-kai.dang",
    passwordIlias: "hunter2",
    privateRssFeed: "https://ying-kai.dang:-password-@ilias.uni-konstanz.de/ilias/privfeed.php?client_id=ilias_uni&user_id=userid&hash=hash",
    passwordRss: "hunter2Rss",
    downloadDir: "C:/Users/user/iliasFiles"
};
```

#### Ignore Files

If you want to ignore files/not download certain files, create a file called `ignore.txt` in the same directory and add one filename per line. Those files won't be downloaded.

### Usage
Open the terminal at the location of downloaded files. Enter
```
node ilias-scraper.js
```
and it should start downloading the files. 

If you just want to double-click a file to run the script, you can write a simple batch or bash file, something like this:

ilias-scraper.bat
```batch
cd C:\Users\user\Documents\ilias-scraper
node ilias-scraper.js
```

## How it works
After the initial the setup, the first execution will download all files that are listed in the RSS feed. Each file information (date, file ID, file name) will then be stored in an object in the file `files.json`.
Every other execution will compare the upload date in the RSS feed of the file with the date of the file that has been stored in `files.json`. If the RSS date is more recent, that file will be downloaded again.

If you want to download specific files again, search for them in `files.json` and either delete them completely or change the date of that file to something in the past. 

If you want to download all files again, you can delete the entire `files.json` file or its contents.
