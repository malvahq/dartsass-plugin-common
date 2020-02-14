// Copyright (c) 2019 MalvaHQ
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

'use strict';
import 'mocha';
import { removeStdIn } from '../src/minifier';
import { expect } from 'chai';
import { getInputSourceMapFromBuffer } from '../src/cssfile';

const InputSourceMap = `
{"version":3,"sourceRoot":"","sources":["../src/modules/_comp.scss", "$stdin", "../src/main.scss"]}
`;

function findStdin(value: string) {
    return value === "$stdin";
}

describe('minifier' , () => {

    it('removeStdIn', () => {
        const inputSourceMap = getInputSourceMapFromBuffer(Buffer.from(InputSourceMap));
        const outputSourceMap = removeStdIn(inputSourceMap);
        const entry = outputSourceMap.sources.find(findStdin);
        expect(entry).to.be.undefined;
    });

});