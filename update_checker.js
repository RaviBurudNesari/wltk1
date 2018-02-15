'use strict';

require('shelljs/global');
const async = require('async');
const fs = require('fs');
const ip = require('ip');
const log = require('../logger.js').updatechecker;
const request = require('request');

const HOME = '/home/developers/HUB';
const SERVER = fs.readFileSync(`${HOME}/db/server`, 'utf-8').trim();

let updated = false;

const DOWNLOAD_MAP = {
    module: { path: 'public/modules.tar.gz', file: 'modules.tar.gz', cb: (cb) => { exec('cd /home/developers/HUB && tar xvf modules.tar.gz', cb); } },
    dependancy: { path: 'public/deps.tar.gz', file: 'deps.tar.gz', cb: (cb) => { exec('cd /home/developers/HUB && tar xvf deps.tar.gz', cb); } },
    sound: { path: 'public/sounds.tar.gz', file: 'sounds.tar.gz', cb: (cb) => { exec('cd /home/developers/HUB && tar xvf sounds.tar.gz', cb); } },
    voiceKit: { path: 'public/voiceKit.tar.gz', file: 'voiceKit.tar.gz', cb: (cb) => { exec('mkdir -p /home/developers/HUB/voiceKit && cd /home/developers/HUB/voiceKit && tar xvf ../voiceKit.tar.gz', cb); } },
    hub: {
        path: 'public/hub.tar.gz',
        file: 'hub.tar.gz',
        cb: (cb) => {
            exec('mkdir -p /home/developers/HUB/hub && cd /home/developers/HUB/hub && tar xvf ../hub.tar.gz');
            cb();
        }
    },
};

const SERIAL = fs.readFileSync(`${HOME}/db/serial`, 'utf-8').trim();

let FIRMWARE;
if (fs.existsSync(`${HOME}/db/firmware`)) {
    FIRMWARE = JSON.parse(fs.readFileSync(`${HOME}/db/firmware`, 'utf-8').trim());
} else {
    FIRMWARE = { module: 1, dependancy: 1, sound: 1, hub: 1, voiceKit: 1 };
    fs.writeFileSync(`${HOME}/db/firmware`, JSON.stringify(FIRMWARE));
}

const getLatestVersion = (cb) => {
    request(`${SERVER}/latest`, (err, resp, body) => {
        if (err) { cb(err, null); }
        cb(null, body);
    });
};

const getLatestFirmware = (cb) => {
    request.post({
        url: `${SERVER}/versions`,
        body: {
            hubId: SERIAL,
            firmware_hub: FIRMWARE,
            ip: ip.address()
        },
        json: true
    }, (err, resp, body) => {
        if (resp && resp.statusCode === 404) { process.exit(0); }
        cb(err, body);
    });
};

const download = (path, file, cb) => {
    request(`${SERVER}/${path}`)
        .on('error', (err) => { cb(err); })
        .on('end', () => { cb(null); })
        .pipe(fs.createWriteStream(`${HOME}/${file}`));
};

getLatestFirmware((err, body) => {
    if (err) { log.error(err); return; }
    const bodyKeys = Object.keys(body);
    const firmwareKeys = Object.keys(FIRMWARE);
    const diffKeys = bodyKeys.filter(function(obj) { if (firmwareKeys.indexOf(obj) == -1) { FIRMWARE[obj] = 1; return true; }; });
    log.info(diffKeys);
    // if (diffKeys.length > 1) {
    //     diffKeys.forEach(function(dd) {
    //         FIRMWARE[dd] = 1
    //     })
    // }
    // log.info(FIRMWARE);
    const tasks = Object.keys(body).map((type) => {
        return (cb) => {
            if (body[type] > FIRMWARE[type]) {
                updated = true;
                log.info(`Updating ${type}`);
                const path = DOWNLOAD_MAP[type].path;
                const file = DOWNLOAD_MAP[type].file;
                download(path, file, (err) => {
                    if (err) { cb(err); } else { DOWNLOAD_MAP[type].cb(cb); }
                });
            } else {
                log.info(`${type} is up-to-date`);
                cb(null);
            }
        }
    });
    async.series(tasks, (err, results) => {
        if (err) { log.error(err); return; }
        if (updated) {
            fs.writeFileSync(`${HOME}/db/firmware`, JSON.stringify(body));
            log.info('Everything is up-to-date, restarting...');
            exec(`chmod +x ${HOME}/hub/scripts/update.sh`);
            process.exit();            
            //exec(`${HOME}/hub/scripts/update.sh`);
        }
    });
});
