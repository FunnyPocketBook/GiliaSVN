# ilias-scraper

## How to use

01. Install Node.js, git and svn CLI
02. Clone repository
03. Run `npm install` in the terminal
04. Get your private RSS feed link on ILIAS
05. Configure the `config-template.json` file. Replace any backslashes with forward slashes in the path and don't have a line break in the privateRssFeed link. Example:

    

``` json
    {
    "user": "username",
    "userGitlab": "username",
    "privateRssFeed": "privateRssFeedURL",
    "svnRepo": ["https://svn.uni-konstanz.de/repo/"],
    "gitRepo": ["https://git.uni-konstanz.de/repo/"],
    "ignoreFile": ["grosse-datei.txt"],
    "ignoreCourse": ["Datenmathematik (2019/2020)"],
    "ignoreExtension": [".mp4"],
    "downloadDir": "path to download directory",
    "savedFilesDir": "path to directory of files.json where already downloaded files are being tracked",
    "discordBot": false
}
```

06. Rename `config-template.js` to `config.js`

07. (optional) Create a file `ignore.txt` and add one filename per line to not download that file.

08. (optional) Configure Discord bot in `botConfig-template.json`. Right now, the bot only sends files from ilias.

    

``` json
    {
    "token": "botToken",
    "channels": {
        "Datenmathematik (WS 2019/20)": "channelID"
        }
    }
```

09. Run `node ilias-scraper.js` in the terminal and enter your Ilias and RSS password.

### Requirements

This script uses Node.js. If you don't have it, head to [Node.js](https://nodejs.org/en/) and download the latest LTS version for your OS. Then install it and follow the install instructions. It also requires git and svn CLI clients.

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

#### SVN and Git repositories

Enter your SVN/Git URLs into the `svnRepo` / `gitRepo` array. Each URL should be added as a new element. Leave the array empty `[]` if you don't want to include SVN/Git repos.

#### Credentials

You will be prompted for your password on start of GiliaSVN. Those will be encrypted, so your password won't be stored in plaintext. If you changed your password, simply delete the `data` folder in the root directory to enter your password anew.

#### Download directory

Create a folder somewhere where the files should be downloaded to. Then copy the  path to that location (e.g. `C:/Users/user/iliasFiles` ) and replace `path to download directory` with the path you copied.<b>Please replace any backslashes `\` with forward slashes `/` </b>. The path should only have backslashes if you are using a Windows system.

You also need to provide the path where the `files.json` and `ignore.txt` files are located. `files.json` saves all files that are already downloaded and in `ignore.txt` you can put in the files and courses that you don't want to download. Setting the paths for these files can be useful if you are sharing the files with other people with e.g. Google Drive.

Example `ignore.txt` , ignoring the course "Datenmathematik" and the file `02. Vorlesung: 24.10.19.pdf` :

``` plaintext
Course: Datenmathematik (WS 2019/20)

02. Vorlesung: 24.10.19.pdf

``` 

##### Example config:

``` json
    {
    "user": "ying-kai.dang",
    "privateRssFeed": "https://ying-kai.dang:-password-@ilias.uni-konstanz.de/ilias/privfeed.php?client_id=ilias_uni&user_id=userid&hash=hash",
    "svnRepo": ["https://svn.uni-konstanz.de/dbis/kdp/pub/", "https://svn.uni-konstanz.de/dbis/kdi/pub/"],
    "gitRepo": ["https://git.uni-konstanz.de/repo/"],
    "downloadDir": "C:/Users/user/iliasFiles/",
    "savedFilesDir": "C:/Users/user/iliasFiles/",
    "ignoreDir": "C:/Users/user/iliasFiles/",
    "discordBot": false
    }
```

### Usage

Open the terminal at the location of downloaded files. Enter

``` 
node ilias-scraper.js
```

and it should start downloading the files.

If you just want to double-click a file to run the script, you can write a simple batch or bash file, something like this:

ilias-scraper.bat

``` batch
cd C:\Users\user\Documents\ilias-scraper
node ilias-scraper.js
```

## How it works

After the initial the setup, the first execution will download all files that are listed in the RSS feed. Each file information (date, file ID, file name) will then be stored in an object in the file `files.json` .
Every other execution will compare the upload date in the RSS feed of the file with the date of the file that has been stored in `files.json` . If the RSS date is more recent, that file will be downloaded again.

The SVN repo will be saved in the same directory structure as the SVN URL. If the URL is `https://svn.uni-konstanz.de/dbis/kdp/pub/` , the files will be stores in `kdp/pub/` .
Every new repository will be checked out if there no working copy exists at `kdp/pub/` . If a working copy already exists, it will only be updated.

If you want to download specific files again, search for them in `files.json` and either delete them completely or change the date of that file to something in the past.

If you want to download all files again, you can delete the entire `files.json` file or its contents.

