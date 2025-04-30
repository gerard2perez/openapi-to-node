import { readFileSync } from "fs";
import { safeLoad } from 'js-yaml';
import { OpenApi } from './openapi';
import { createInterface, filterable, ReadSchemas } from './schema-extractor';

declare global {
	interface Object {
		[Symbol.iterator]:() => Iterator<[string, any, number, number]>
	}
}
function iterable(object) {
	Object.defineProperty(object, Symbol.iterator, {
		value: function() {
			let keys = Object.keys(this);
			let data:any = this;
			let total = keys.length;
			return {
				i: 0,
				next() {
					let current = this.i;
					let key = keys[current];
					return {
						value: [
							key,
							data[key],
							current,
							total
						],
						done: this.i++ === total
					};
				}
			};
		}
	});
	return object;
}

let COMPONENTS:any;

function getRef(object:any, path:string) {
	let route = path.split('/');
	route.shift();
	route.shift();
	let current = COMPONENTS;
	let name;
	for(const prop of route) {
		current = current[prop];
		name = prop;
	}
	Object.keys(current).map(p=>{
		object[p] = current[p];
	});
	object.ref_name = name;
	delete object.$ref;
}
function fixRef(object:any) {
	for(const key of Object.getOwnPropertyNames(object) ) {
		if(key === '$ref') {
			getRef(object, object.$ref);
			fixRef(object);
		} else if (object[key] instanceof Object) {
			fixRef(object[key]);
		}
	}
}
let grouped_paths:any;
export function groupPaths(FILE:string) {
	if(!grouped_paths) {
		// let yaml = load('./openapi.yaml');
		let obj = JSON.stringify(safeLoad(readFileSync('./openapi.yaml', 'utf8')), null, 2)
		// let obj = JSON.stringify(yaml, null, 2)
			.replace(/ \\\\ /gm, " \\\\\\n ")
			.replace(/"personalAccessToken": \[\]/gm, '"personalAccessToken": [\n\n\t\t\t]')
			.replace(/"oauth": \[\]/gm, '"oauth": [\n\n\t\t\t]')
			.replace(/"example": \[\]/gm, '"example": [\n\n\t\t\t]')
			.replace(/:\\n  \*/gm, ":\\n\\n  *");
		// console.log(obj);
		let { paths, components, info:{version}, servers } = JSON.parse(obj); // require(resolve(FILE));
		COMPONENTS = components;
		Object.keys(paths).map(p=>fixRef(paths[p]));
		let grouped:{[property:string]:[[string,any]]} = {};
		for(const [key, config] of iterable(paths)) {
			let namespace = key.split('/').slice(1)[0] as string;
			grouped[namespace] = (grouped[namespace] || []) as [[string,any]];
			grouped[namespace].push([key, config]);
		}
		ReadSchemas(COMPONENTS.schemas);
		grouped_paths = {rawpaths:paths, paths:grouped, schemas: COMPONENTS.schemas, version, servers};
	}
	return grouped_paths;
}
export function getApi (FILE:string) {
	const {rawpaths, schemas, version, servers} = groupPaths(FILE);
	const [filters, filternames] = filterable(schemas);
	const apiServer = servers[0].url;
	OpenApi.setFilterables(filternames);
	let APINODES:{[property:string]:OpenApi} = {};
	APINODES['/'] = new OpenApi(apiServer, '/', {} as any, true);

	for(const [route, config, index] of rawpaths as Object) {
		let NEW_NODE = new OpenApi(apiServer, route, config, index === 0);
		APINODES[NEW_NODE.route] = NEW_NODE;
		let PARENT = APINODES[NEW_NODE.ParentRoute];
		let current = route;
		while(!PARENT) {
			let CPARENT = new OpenApi(apiServer, NEW_NODE.ParentRoute, {} as any, false);
			APINODES[CPARENT.route] = CPARENT;
			APINODES[CPARENT.route].add(current);
			current = CPARENT.route;
			PARENT = APINODES[CPARENT.ParentRoute];

		}
		PARENT.add(current);
	}
	OpenApi.setNode(APINODES);
	return {
		servers,
		version,
		API: APINODES['/'],
		rawpaths: rawpaths,
		grouped_schemas: schemas,
		filternames,
		filters,
		interfaces: createInterface(schemas)
	};
}
