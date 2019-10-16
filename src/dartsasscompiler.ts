// Copyright (c) 2018-19 MalvaHQ
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT


'use strict';
import * as path from 'path';

import sass = require("sass");
import { getImporter } from './importer';
import { CompilerConfig } from './config';
import { xformPath, xformPaths} from './util';
import { IDocument } from './document';
import { ILog } from './log';
import { getOutputCSS, getOutputMinifiedCSS} from './target';
import { autoPrefixCSS } from './writer';
import { ProcessOutput } from './run';
import { CodeNotImplemented } from './compiler';

export interface Info {
    info: string;
}

var NoWatchOutput: ProcessOutput = {
    pid: -1,
    code: CodeNotImplemented,
    msg: 'Watch Not implemented in built-in sass package. Check if sassbinPath is set.'
};

/**
 * Compile a given sass file based on DartSass implementation.
 *
 * More details of the API at -
 * https://github.com/sass/dart-sass/blob/master/README.md#javascript-api .
 */
export class DartSassCompiler {


    constructor() {
    }

    public validate(config: CompilerConfig): Promise<string> {
        return new Promise(function(resolve, reject) {
            resolve('');
        });
    }

    public compileAll(config: CompilerConfig, projectRoot: string, _log: ILog) : Promise<string> {
        return new Promise(function(resolve, reject) {
            reject('Not yet implemented. To Compile All the sass files inside the given workspace');
        });
    }

    public which(config: CompilerConfig, _log: ILog) : Promise<string> {
        const self = this;
        return new Promise(function(resolve, reject) {
            self.sayVersion(config, _log).then(
                data => resolve(data),
                err => reject(err)
            )
        });

    }

    public sayVersion(config: CompilerConfig, _log: ILog): Promise<string> {
        const info = sass as unknown as Info;
        const version = info.info;
        return new Promise(function(resolve, _) {
            resolve(`${version}`);
        });
    }

    public compileDocument(document: IDocument, config: CompilerConfig,_log: ILog): Promise<string> {
        const input = document.getFileName();
        const output = getOutputCSS( document, config, _log);
        const compressedOutput = getOutputMinifiedCSS(document, config, _log);
        if (config.debug) {
            _log.appendLine("Scss working directory: " + config.sassWorkingDirectory);
            _log.appendLine("include path: " + config.includePath.join(","));
        }
        _log.appendLine(`${input} -> ${output}`);
        const self = this;
        return new Promise<string>(function(resolve, reject) {
            self.asyncCompile(document, false, output, config, _log).then(
                value => {
                    if (!config.disableMinifiedFileGeneration) {
                        self.asyncCompile(document, true, compressedOutput, config,  _log).then(
                            value => resolve(value),
                            err => reject(err)
                        )
                    }
                },
                err => reject(err)
            )
        });
    }

    public watch(srcdir: string, projectRoot: string, compressed: boolean, config: CompilerConfig, _log: ILog) : Promise<ProcessOutput> {
        return new Promise<ProcessOutput>(function(resolve, reject) {
            reject(NoWatchOutput);
        });
    }

    handleError(err: sass.SassException, config : CompilerConfig, _log: ILog): Promise<string> {
        return new Promise( function(resolve, reject){
            const fileonly = path.basename(err.file);
            const formattedMessage = ` ${err.line}:${err.column} ${err.formatted}`;
            _log.appendLine(`${err.formatted}`);
            reject(`${fileonly}: ${formattedMessage}`);
        });
    }

    asyncCompile(document: IDocument, compressed: boolean, output: string,
        config : CompilerConfig,
        _log: ILog): Promise<string> {
        const sassWorkingDirectory  = xformPath(document.getProjectRoot(), config.sassWorkingDirectory);
        const includePaths = xformPaths(document.getProjectRoot(), config.includePath);
        const self = this;
        return new Promise<string>(function(resolve, reject) {
            sass.render({
                file: document.getFileName(),
                importer: getImporter(sassWorkingDirectory),
                includePaths: includePaths,
                outputStyle: compressed ? 'compressed': 'expanded',
                outFile: output,
                sourceMap: true
            }, function (err: sass.SassException, result: sass.Result) {
                if (err) {
                    self.handleError(err, config, _log).then(
                        value => {
                            resolve(value)
                        },
                        err => {
                            reject(err);
                        }
                    )
                } else {
                    autoPrefixCSS(output, result.css, config,  _log).then(
                        value => resolve(value),
                        err => reject(err)
                    )
                }
            });
        });
    }


}
