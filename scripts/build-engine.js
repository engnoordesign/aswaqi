import ts from 'typescript';
import {readFileSync,writeFileSync} from 'node:fs';
const source=new URL('../shared/engine.ts',import.meta.url);
writeFileSync(new URL('../shared/engine.js',import.meta.url),ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
