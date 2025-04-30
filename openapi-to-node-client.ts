import { readFileSync, writeFileSync } from 'fs';
import { getApi } from './openapi_parser';
import { write, test_it_printer, RegionPrinter } from './auxiliar';
import { MochaTest, APITESTNODE, REAMEMaker } from './walkers';
import { enums } from './schema-extractor';
import { globals } from './globals';
import { APITestMaker } from './walker/APITestMaker';
import { DOCMaker as DeclarationMaker } from './walker/DeclarationWalker';

enum commands {
	json = 'json',
	test = 'test',
	declarations = 'def',
	api_call = 'call',
	readme = 'readme'
}
const [_,__, command = commands.json] = process.argv;

const {API,grouped_schemas, interfaces, filters, filternames, rawpaths, servers, version } = getApi('./openapi.yaml');

switch(command) {
	case  commands.readme:
		let README_DATA = '';
		function print(data:string) {
			README_DATA += `${data}\n`;
		}
		function TABLE(data:string, name:string) {
			print(`### ${name}`);
			print('|Command|Reference|');
			print('|---|---|');
			print(data);
		}
		const README = new REAMEMaker('server');
		const { devDependencies: {typescript}} = require(process.cwd() + '/package.json');
		API.Children.map(d =>TABLE(d.toString(README), d.Name));
		writeFileSync('./README.md',
			readFileSync('_readme.md', 'utf-8')
			.replace('{{commands}}', README_DATA)
			.replace('{{version}}', version)
			.replace('{{typescript}}', typescript)
		)
		break;
	case commands.json:
		let DEF:any = API.toJSON();
		DEF.remote_server = API.apiServer;
		write('./specification.json', JSON.stringify(DEF, null, 2));
		write('./src/specification.json', JSON.stringify(DEF, null, 2));
		break;
	case  commands.api_call:
		const API_CALL_TEST = write.bind(null,  './api_call_test.ts');
		const API_CALL_REGION = RegionPrinter('./api_call_test.ts');
		const APITester = new APITestMaker('server');
		API_CALL_TEST(`import { Filter, ${Object.keys(grouped_schemas).join(', ')}, ${filternames.join(', ')} } from "./src/interfaces";`);
		API_CALL_TEST(`import { Linodev4} from "./src/";`);
		API_CALL_TEST("const server = new Linodev4('personal-key-secured');");
		API.Children.map(d =>API_CALL_REGION(d.toString(APITester), d.Name));
		break;
	case commands.declarations:
		const Documenter = new DeclarationMaker('Linodev4', 'api_key:string, send?:Function');
		DeclarationMaker.interfacesNames = Object.keys(grouped_schemas);
		const region = RegionPrinter('./src/interfaces.ts');
		region(globals, 'Support');
		region(enums().join('\n'), 'Enumerations');
		region(interfaces.join('\n'), 'Models');
		region(filters.join('\n'), 'Filterables');
		API.Children.map(d =>region(d.toString(Documenter), d.Name));
		// write('./index.d.ts', `import {IAccount, IDomains, IImages, ILinode, ILongview, IManaged, INetworking, INodebalancers, IProfile, IRegions, ISupport, IVolumes} from './interfaces';`);
		// write('./index.d.ts', Documenter.definition(API));
		break;
	case commands.test:
		const MochaTester = new MochaTest('server', 'personal-key-secured');
		for(const NODE of API.Children) {
			const TEST_FILE = `./test/${NODE.Name}.test.ts`;
			const Test = write.bind(null, TEST_FILE);
			const writeIT = test_it_printer(TEST_FILE);
			let first = false;
			Test(`import * as Mocha from 'mocha';`);
			Test(`import { expect, assert } from 'chai';`);
			Test(`import { Filter, ${Object.keys(grouped_schemas).join(', ')}, ${filternames.join(', ')} } from '../src/interfaces';`);
			Test(`import { Linodev4 } from '../src/';`);
			Test("const server = new Linodev4('personal-key-secured', async (data) => Promise.resolve(data) );");
			Test(`describe('${NODE.route}', () => {`);
			let Children = NODE.Children;
			let DEFS:string= [].concat.apply([],
				NODE.Verbs.map(v => {
					return MochaTester.toDeclaration(v, NODE.PathParameters).map(d=> new APITESTNODE(v.rawroute, NODE.route, v.verb,d,v.isList)) as any;
				})
			)
			.map(MochaTester.MochaPrint.bind(MochaTester, rawpaths, servers,NODE.Name))
			.join('\n\t\t');
			writeIT(NODE.Name, DEFS);
			for(const ITS of Children) {
				let moc = MochaTester.toProp(ITS).map(MochaTester.MochaPrint.bind(MochaTester, rawpaths, servers ,NODE.Name)).join('\n\t\t')
				writeIT(ITS.Name, moc);
			}
			Test(`});`);
		}
		break;
}

