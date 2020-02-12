// Copyright (c) 2018-19 MalvaHQ
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

'use strict';

import { CompilerConfig } from './config';
import { ILog } from './log';
import { ProcessOutput, killProcess } from './run';
import { xformPath } from './util';
import { getCurrentCompiler } from './select';
import { ISassCompiler } from './compiler';
import { doAutoprefixCSS } from './autoprefix';
import { getWatchTargetDirectory, isMinCSS, isCSSFile, getMinCSS  } from './target';
import { cwatchCSS, closeCWatcher} from './chokidar_util';
import { FSWatcher } from 'chokidar';
import fs from 'fs';
import { IMinifier } from './minifier';
import { CleanCSSMinifier } from './cleancss';


const minifier: IMinifier = new CleanCSSMinifier();

function doSingleLaunch(compiler: ISassCompiler, srcdir: string, projectRoot: string,
    config: CompilerConfig, _log: ILog): Promise<ProcessOutput> {
    return compiler.watch(srcdir, projectRoot, config, _log);
}


function _internalMinify(docPath: string, config: CompilerConfig, _log: ILog): void {
    if (config.disableMinifiedFileGeneration) {
        return;
    }
    if (!isCSSFile(docPath)) {
        return;
    }
    if (isMinCSS(docPath, config.minCSSExtension)) {
        return;
    }
    const minifiedCSS = getMinCSS(docPath, config.minCSSExtension);
    _log.debug(`About to minify ${docPath} to ${minifiedCSS}`);
    minifier.minify(docPath, config.encoding, minifiedCSS,
        (contents: string) => {
            return doAutoprefixCSS(contents, config);
        },
        _log).then(
        value=> {},
        err => {}
    );
}

function doDelete(docPath: string, config: CompilerConfig, _log: ILog): any {
    _log.debug(`Deletion event received for ${docPath}`);
    if (!isCSSFile(docPath)) {
        return;
    }
    if (isMinCSS(docPath, config.minCSSExtension)) {
        return;
    }
    const minifiedCSS = getMinCSS(docPath, config.minCSSExtension);
    try {
        fs.unlink(minifiedCSS, function(err) {
            if (err) {
                _log.appendLine(`Warning: Error deleting ${minifiedCSS} - ${err}`);
            }
            _log.debug(`Deleted ${minifiedCSS} successfully`);
        });
    } catch(err) {
        _log.appendLine(`Warning: Error deleting ${minifiedCSS} - ${err}`)
    }
}

function doMinify(srcdir: string, projectRoot: string, config: CompilerConfig, _log: ILog): FSWatcher {
    const  _targetDirectory = getWatchTargetDirectory(srcdir, config);
    const targetDirectory = xformPath(projectRoot, _targetDirectory);
    const pattern = targetDirectory+"/**/*.css";
    const fsWatcher = cwatchCSS(targetDirectory, (docPath: string) => {
        _internalMinify(docPath, config, _log);
    },
    (docPath: string) => {
        doDelete(docPath, config, _log);
    }, _log);
    _log.debug(`Started chokidar watcher for ${pattern}`);
    return fsWatcher;
}


export interface WatchInfo {
    pid: number;

    fsWatcher: FSWatcher;
}

export class Watcher {

    watchList: Map<string, WatchInfo>  = new Map<string, WatchInfo>();

    constructor() {
    }

    doLaunch(_srcdir: string, projectRoot: string, config: CompilerConfig, _log: ILog): Promise<string> {
        const srcdir =  xformPath(projectRoot, _srcdir);
        const compiler = getCurrentCompiler(config, _log);
        const self = this;
        return new Promise<string>(function(resolve, reject) {
            const pids = self.watchList.get(srcdir);
            if (pids !== null && pids !== undefined) {
                reject(`${srcdir} already being watched ( pids ${pids} )`);
                return;
            }
            doSingleLaunch(compiler, srcdir, projectRoot, config, _log).then(
                (value: ProcessOutput) => {
                    if (value.killed) {
                        reject(`Unable to launch sass watcher for ${srcdir}. process killed. Please check sassBinPath property.`);
                        return;
                    }
                    if (value.pid === undefined || value.pid === null || value.pid <= 0) {
                        self.watchList.delete(srcdir);
                        reject(`Unable to launch sass watcher for ${srcdir}. pid is undefined. Please check sassBinPath property.`);
                        return;
                    }
                    const fsWatcher = doMinify(srcdir, projectRoot, config, _log);
                    self.watchList.set(srcdir, {
                        pid: value.pid,
                        fsWatcher: fsWatcher
                    });
                    resolve(`Launched css watchers`);
                },
                err => {
                    reject(`${srcdir} - ${err}`);
                }
            );
        });
    }

    public ClearWatchDirectory(srcdir: string, _log: ILog) : boolean {
        const watchInfo = this.watchList.get(srcdir);
        let cleared = false;
        if (watchInfo !== null && watchInfo !== undefined) {
            _log.appendLine(`About to unwatch ${srcdir} with sass watcher pid ${watchInfo.pid}`);
            killProcess(watchInfo.pid, _log);
            if (watchInfo.fsWatcher !== undefined && watchInfo.fsWatcher !== null) {
                _log.appendLine(`About to clear chokidar watcher for sass watcher pid ${watchInfo.pid}`);
                closeCWatcher(watchInfo.fsWatcher, _log);
            }
            cleared = true;
        } else {
            _log.appendLine(`Trying to unwatch ${srcdir}. But no watcher launched earlier`);
            cleared = true;
        }
        this.watchList.delete(srcdir);
        return cleared;
    }

    public ClearWatch(_srcdir: string, projectRoot: string, _log: ILog): boolean {
        const srcdir = xformPath(projectRoot, _srcdir);
        return this.ClearWatchDirectory(srcdir, _log);
    }

    public ClearAll(_log: ILog) {
        this.watchList.forEach((watchInfo: WatchInfo, key: string) => {
            _log.appendLine(`Unwatching ${key} with pid ${watchInfo.pid}`);
            killProcess(watchInfo.pid, _log);
            if (watchInfo.fsWatcher !== undefined && watchInfo.fsWatcher !== null) {
                closeCWatcher(watchInfo.fsWatcher, _log);
            }
        });
        this.watchList.clear();
    }

    /**
     * Relaunch relaunches all the watch processes for the watch directories
     */
    public Relaunch(projectRoot: string, config: CompilerConfig, _log: ILog) : Array<Promise<string>> {
        this.ClearAll(_log);
        const promises = new Array<Promise<string>>();
        for (const _srcdir of config.watchDirectories) {
            promises.push(this.doLaunch(_srcdir, projectRoot, config, _log));
        }
        return promises;
    }

    public GetWatchList(): Map<string, WatchInfo> {
        return this.watchList;
    }

}

/**
 * watchDirectory adds a given directory to the list of directories being watched.
 *
 * Returns false, if directory already being watched. true, if the directory is being watched anew.
 * @param srcdir
 * @param config
 */
export function watchDirectory(srcdir: string, config: CompilerConfig) : Promise<boolean> {
    return  new Promise<boolean>(function(resolve, reject) {
        for(const watchDir of config.watchDirectories) {
            if (watchDir === srcdir) {
                resolve(false);
                return;
            }
        }
        config.watchDirectories.push(srcdir);
        resolve(true);
    });
}

export function unwatchDirectory(srcdir: string, config: CompilerConfig) : Promise<string> {
    return  new Promise<string>(function(resolve, reject) {
        for(var i = 0; i < config.watchDirectories.length; ++i) {
            if (config.watchDirectories[i] === srcdir) {
                config.watchDirectories.splice(i, 1);
                resolve(`${srcdir} unwatched successfully`);
                return;
            }
        }
        reject(`${srcdir} not being watched before`);
    });
}

