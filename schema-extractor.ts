//@ts-ignore
import * as i from 'i';
import { ISchemaObject, IPathItemObject } from './open_api_3';

export const inflect = new i();
inflect.inflections.singular('ips', 'ips');
let master_enums:string[] = [];
export enum API2TS {
	object = 'any',
	number = 'number',
	integer = 'number',
	string = 'string',
	boolean = 'boolean',
	array = 'any[]'
}
let register_enums = true;
class Property {
	static allOf(definition:ISchemaObject) {
		let merge = {};
		if(definition.allOf) {
			const allOf = definition.allOf;
			delete definition.allOf;
			for(let target of allOf) {
				merge = Property.mergeProp(merge as ISchemaObject, target);
			}
		}
		return Object.keys(merge).length ? Property.mergeProp(merge as ISchemaObject, definition) : definition;
		// return merge ? Property.mergeProp(merge as ISchemaObject, definition) : definition;
	}
	static mergeProp (base:any = {}, target:any = {}) {
		if(base.allOf || target.allOf) {
			base  = this.allOf(base);
			target  = this.allOf(target);
		}
		let allkeys = Object.keys(base).concat(Object.keys(target));
		allkeys = allkeys.filter( (f, i) =>allkeys.indexOf(f) === i);
		let c:any = {};
		for(const key of allkeys) {
			let test =  target[key] || base[key];
			if ( test.constructor === Object ) {
				c[key] = this.mergeProp(base[key], target[key]);
			} else {
				c[key] = test;
			}
		}
		return c;
	}
	static makeEnum(name:string, def:string[]) {
		if(register_enums)
			master_enums.push(`export enum ${name} {\n\t${def.filter(d=>d).map(d=>{return `${d.replace(/ |\//gm, '_')} = '${d}'`}).join(',\n\t')}\n}`);
		return name;
	}
	static getTypescriptType(definition:any = {}, interfaceName:string = '', property: string = '') :string {
		let type;
		if (definition.enum) {
			type = Property.makeEnum(`${interfaceName}${inflect.titleize(property).replace(/ /gm, '')}`, definition.enum);
		} else if (definition.properties) {
			if(definition.ref_name) return definition.ref_name;
			let params:any = {};
			Object.keys(definition.properties).map(p=> {
				params[p] = this.ensureParam(definition.properties[p]);
			});
			let res = Object.keys(params).map(p=> `${p}: ${API2TS[params[p].type]}`).join(', ');
			type = `{ ${res} }`;
		} else if (definition.type === 'array') {
			if(definition.items) {
				let type1 = Property.getTypescriptType(definition.items.properties);
				let type2 = Property.getTypescriptType(definition.items);
				type = `${type1 || type2}[]`;
			}
		}
		return type || API2TS[definition.type as any];
	}
	static ensureParam(param:any) {
		if (param.allOf) {
			return [].concat.apply([], param.allOf.map(this.ensureParam))[0];
		}
		return param;
	}
}
export function range(min?:number, max?:number) {
	if( min === undefined && max) {
		return `<= ${max}`;
	} else if (min && max === undefined) {
		return `>= ${min}`;
	} else {
		return `[${min} .. ${max}]`;
	}
}
function makeProperty (property:string, definition:IPathItemObject,required:boolean, interfaceName:string) {
	let type = Property.getTypescriptType(definition, interfaceName, property);
	let {minimum, maximum, minLength, maxLength} = definition;
	let length:string[]=[];
	if (minimum || maximum ) {
		length = [`Values ${range(minimum, maximum)}.`, ' '];
	}
	if (minLength || maxLength ) {
		length = [`${range(minLength, maxLength)} characters.`, ' '];
	}
	let comments:string[] = [
		definition.deprecated ? '@deprecated' : '',
		...length,
		...(definition.description || '').split('\n'),
		definition['x-linode-filterable'] ? '\n\t * @filterable':'',
		definition.example ? `@example\n\t * ${definition.example}`:''
	].filter(c=>c);
return `
	/**
 	 * ${comments.join('\n\t * ')}
 	*/
	${definition.readOnly ? 'readonly ': ''}${property}${required ? '':'?'}:${type}`;
}
export function ReadSchemas (schemas:any) {
	for(const key of Object.keys(schemas)) {
		let data = schemas[key] as ISchemaObject;
		data.properties = Property.allOf(data).properties;
	}
}
export function enums() {
	return master_enums;
}
function objit(obj:any, fn:(s:string,sd:any) => void) {
	for(const key of Object.keys(obj)) {
		fn(key, obj[key]);
	}
}
export function filterable (schemas:any) {
	register_enums = false;
	let filterables:any =  {};
	objit(schemas, (model, {properties}) => {
		objit(properties, (property, propDef)=>{
			if (propDef['x-linode-filterable']) {
				filterables[model] = filterables[model] || [];
				filterables[model].push( makeProperty(property, propDef, false, model) );
			}
		});
	});
	register_enums = true;
	let list:string[] = [];
	let filternames:string[] = [];
	objit(filterables, (model, list_props)=>{
		filternames.push(`${model}Filter`);
		list.push(`export interface ${model}Filter {${list_props.join('')}\n}`);
	});
	return [list, filternames];
}
export function createInterface(schemas:any) {
	return Object.keys(schemas).map(name => {
		let data = schemas[name] as ISchemaObject;
		let required = data.required || [];
		let description = data.description ?  `/**\n * ${data.description}\n */` : '';
		return `${description}\nexport interface ${name} {\n\t${Object.keys(data.properties).map(prop=> makeProperty(prop, data.properties[prop], required.indexOf(prop) >-1, name)).join('\n')}\n}`;
	});
}
