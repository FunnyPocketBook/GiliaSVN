const electron = require('electron');
const { app, BrowserWindow } = require('electron');
const path = require('path');
const Tray = electron.Tray;
const iconPath = path.join(__dirname, 'thonk.png')
const Menu = electron.Menu;

let win;
let tray = null;
function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });
    win.loadFile('index.html');
    win.webContents.openDevTools();
    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
}


app.on('ready', function () {
    tray = new Tray(iconPath);
    const template = [
        {
            label: 'Open',
            click: function () {
                createWindow();
            }
        },

        {
            label: 'Settings',
            click: function () {
                console.log("Clicked on settings");
            }
        },

        {
            label: 'Help',
            click: function () {
                console.log("Clicked on Help");
            }
        },

        {
            label: 'Exit',
            click: function () {
                app.quit();
            }
        }
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
    createWindow();
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
})