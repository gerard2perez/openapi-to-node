import { IParameterObject, IOperationObject, IPathItemObject } from "./open_api_3";
import { API2TS, inflect, range } from "./schema-extractor";

let filternames:string[];
export enum TS2VAL {
	number = 1,
	string  = "'2'",
	any = '{}'
}
export class Walker {
	static toDescription(definition:IOperationObject | IPathItemObject){
		// let type = Property.getTypescriptType(definition, interfaceName, property);
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
			definition.operationId ? `https://developers.linode.com/api/v4/#operation/${definition.operationId}\n *` : '',
			...length,
			...(definition.description || '').split('\n'),
			definition['x-linode-filterable'] ? '\n\t * @filterable':'',
			definition.example ? `@example\n\t * ${definition.example}`:''
		].filter(c=>c);
		return comments.length ? ['/**', ...comments.map(d=>` * ${d}`), ' */'] : [];
	}
	toTSKind(kind:string) {
		return API2TS[kind as any] || undefined;
	}
	static toArgExample2(def:Argument) {
		if(def.kind === 'string') {
			return `'${def.name}'`;
		}
		return TS2VAL[API2TS[def.kind as any] || undefined as any];
	}
	static toArgExample(def:any) {
		if(def.schema.type === 'string') {
			return `'${def.name}'`;
		}
		return TS2VAL[API2TS[def.schema.type as any] || undefined as any];
	}
	constructor(public Name:string, public Arguments:string = ''){}
	static isListMethod(definition:any) {
		try {
			const schema = definition.responses['200'].content['application/json'].schema;
			return schema.type === 'object' &&
					schema.properties.results &&
					schema.properties.data &&
					schema.properties.page &&
					schema.properties.pages;
		}catch(ex) {}
		return false;
	}
	public static Name(name:string) :string {
		return inflect.camelize(name.replace(/-/gm, '_'));
	}
	public static FnName(name:string) :string {
		return inflect.camelize(name.replace(/-/gm, '_'), false);
	}
	toDeclaration(verb:OpenAPiVerb){}
	toProp(node:OpenApi) {}
	definition (node:OpenApi): string {
		let transfor:(node:OpenApi)=>string[] = this.fullTree.bind(this);
		let result:string = '';
		let preBody = [
			...[].concat.apply([],node.Verbs.map(this.toDeclaration.bind(this)) as any[]),
			...[].concat.apply([],node.Children.map(this.toProp.bind(this)) as any[])
		];
		let body = preBody.join('\n\t');
		if(node.route === '/' ) {
			result = [
				`export class ${this.Name} {`,
				`\tconstructor(${this.Arguments});`,
				`\t${body}`,
				'}'
			].join('\n');
		} else if (node.IsClass) {
			result = `interface ${Walker.Name(node.Name)}Class {\n\t${body}\n}`;
		} else if(!node.isMethod) {
			result = `interface I${Walker.Name(node.Name)} {\n\t${body}\n}`;
		}
		return result;
	}
	fullTree(node:OpenApi): string[] {
		let transfor:(node:OpenApi)=>string[] = this.fullTree.bind(this);
		let result:string[] = [];
		let Children = node.Children;
		let preBody = [
			...[].concat.apply([],node.Verbs.map(v=>this.toDeclaration.bind(this)(v)) as any[]),
			...[].concat.apply([],node.Children.map(c=>this.toProp.bind(this)(c)) as any[])
		];
		let body = preBody.join('\n\t');
		if(node.route === '/' ) {
			result = [
				[
					`export class ${this.Name} {`,
					`\tconstructor(${this.Arguments});`,
					`\t${body}`,
					'}'
				].join('\n')
			];
		} else if (node.IsClass) {
			result = [
				`export interface ${Walker.Name(node.Name)}Class {\n\t${body}\n}`
			];
		} else if(!node.isMethod) {
			result = [`export interface I${Walker.Name(node.Name)} {\n\t${body}\n}`]
		}
		result = [].concat.apply( result, node.Children.map(transfor) as any[] );
		return result;
	}
}
export class DocFormater {
	static parseParameters ( parameters:any[] = []) {
		let result:any = {
			query:{},
			path:{}
		};
		for(const parameter of parameters) {
			let _in = parameter.in || 'query';
			result[_in] = result[_in] || {};
			result[_in][parameter.name] = {
				name: parameter.name,
				type:API2TS[parameter.schema.type],
				description: parameter.description,
				required: !!parameter.required
			};
		}
		return result;
	}
	static getContentChallenge(status:string, data:any) {
		let result:any = {name:undefined, kind:undefined, isArray:false};
		return ['application/json', 'image/png'].filter(type => data[status] && data[status].content[type]).map(type => {
			const schema = data[status].content[type].schema;
			if ( schema ) {
				try {
					if(schema.type === 'string' && schema.format === 'binary')
					return {
						name:'ArrayBuffer',
						kind: 'native'
					};
					result = {
						name: schema.ref_name || schema.properties.data.items.ref_name,
						kind: 'class',
						isArray: !schema.ref_name
					};
					//  || {
					// 	name: schema.properties.data.items.ref_name,
					// 	kind: 'class',
					// 	isArray: true
					// };
				}catch(ex) {
					result = {
						name: API2TS[schema.type] || 'any',
						kind: 'native',
						isArray: false
					};
				}
			}
			return result;
		})[0] || result;
	}
	static formatArgs(parameters:IParameterObject[]) {
		return parameters.map(parameter => {
			return `${parameter.name || 'id'}:${parameter.required?'':'?'}${API2TS[parameter.schema.type]}`;
		}).join(', ');
	}
}
enum API2Header {
	'x-linode-filterable' = 'X-Filter',
	'personal-key' = 'Authorization'
}
enum FMMapper {
	get = 'list',
	post = 'create',
	put = 'update',
	delete = 'delete'
}
export class Argument {
	constructor (public name:string, public kind:string, public location:string, public required:boolean) {

	}
}
export let APINODES:{[property:string]:OpenApi} = {};
export interface SMethod {
	Name: string
	fnName: string
	QueryParameters: any[]
	PathParameters: any[]
	HeaderParameters: any[]
	RequiredArgs: number
	TotalArgs: number
	Verb:string,
	Keep:boolean,
	RelativeRoute
}
export class OpenAPiVerb {
	route: string = '';
	toJSON() :SMethod {
		return {
			Name: this.rawName,
			fnName: this.fnName,
			QueryParameters: this.QueryParameters.map(p=>p.name),
			PathParameters: this.PathParameters.reverse(),
			HeaderParameters: this.HeaderParameters.map(p=>p.location),
			RequiredArgs: this.RequiredArgs,
			Verb: this.verb,
			TotalArgs: this.QueryParameters.length + this.PathParameters.length + (this.BodyClass ? 1:0),
			Keep: this.keepPath,
			RelativeRoute: this.route
		}
	}
	//#region Body
	get fnName () {
		return Walker.FnName(this.Name);
	}
	_keep_path:boolean = true
	get keepPath () {
		return this._keep_path && ![this.verb, 'list', 'update', 'create'].includes(this.Name)
	}
	isList:boolean
	FilterClass:string = ''
	ReturnValue:string = ''
	BodyValue:string = ''
	BodyClass:string = ''
	Arguments: Argument[] = []
	get QueryParameters () {
		return this.Arguments.filter(a=>a.location === 'query');
	}
	get PathParameters () {
		return this.Arguments.filter(a=>a.location === 'path');
	}
	get HeaderParameters () {
		return this.Arguments.filter(a=>a.location !== 'query' && a.location !== 'path' && a.location !== 'body');
	}
	get RequiredArgs () {
		return this.Arguments.filter(a=>a.required).length;
	}
	get Link() {
		// return `${this.endpoint}#tag/${this.definition.operationId}`;
		return `https://developers.linode.com/api/v4/#operation/${this.definition.operationId}`;
	}
	get Description() {
		return Walker.toDescription(this.definition);
	}
	get rawName() {
		let suggested = this.suggested();
		return suggested || ((this.verb === 'get' && !this.isList) ? 'get' : FMMapper[this.verb as any]);
	}
	get Name () : string {
		let suggested = this.suggested();
		return Walker.FnName( suggested || ((this.verb === 'get' && !this.isList) ? 'get' : FMMapper[this.verb as any]));
		// return Walker.FnName(this.suggested() || FMMapper[this.verb as any]);
	}
	constructor(public rawroute:string, private endpoint:string, public verb:string, private definition: IOperationObject, private suggested:Function) {
		this.isList = Walker.isListMethod(definition);
		this.ReturnValue = DocFormater.getContentChallenge('200', definition.responses).name;
		this.BodyClass = DocFormater.getContentChallenge('requestBody', definition).name;
		this.BodyValue = this.BodyClass ? `data: ${this.BodyClass}` : '';
		this.Arguments.push(new Argument('personal-key','Object', API2Header['personal-key'], false));
		(definition.parameters || []).map(param => {
			this.Arguments.push(new Argument(param.name,API2TS[param.schema.type], param.in, param.required));
		});
		if(this.isList) {
			let argument = `${this.ReturnValue}Filter`;
			this.FilterClass = filternames.indexOf(argument) > -1 ? argument : '';
			if (this.FilterClass) {
				this.Arguments.push(new Argument(this.FilterClass,'Object', API2Header['x-linode-filterable'], false));
			}
		}
		if(this.BodyClass) {
			this.Arguments.push(new Argument(this.BodyClass,'Object', 'body', true));
		}
	}
	//#endregion
}
export interface SNode {
	FormatName: string
	Class: SNode
	Properties: SNode[]
	Methods: SMethod[]
	Route: string
	PathParameter: string[]
}
export class OpenApi {
	toJSON() {
		let Classes = this.Children.filter(c=>c.IsClass).map(c => c.toJSON());
		return {
			FormatName: this.Name ? this.fnName: '',
			Class: this.Children.filter(c=>c.IsClass).map(c => c.toJSON())[0],
			Properties: this.Children.filter(c=>c.IsProperty).map(c => c.toJSON()),
			Methods: this.Verbs.map(v=>v.toJSON()),
			Route: this.RelativeRoute,
			PathParameter: this.PathParameters.map(p=>p.name)
			// raw: this
		}
	}
	//#region Body
	get Link():string {
		if(this.IsClass) {
			return this.Verbs[0].Link;
		}
		return `https://developers.linode.com/api/v4/#operation/${this.definition.operationId}`;
	}
	get Description() {
		if(this.IsClass) {
			return this.Verbs[0].Description;
		} else {
			return this.definition.description || '';
		}
	}
	static setFilterables (f:string[]) {
		filternames = f
	}
	static setNode(NODES:any) {
		APINODES = NODES;
	}
	private children:string[] = []
	private _children: OpenApi[] = []
	public get Children() : OpenApi[] {
		return this.children.map(c=>APINODES[c]).filter(cn => {
			if (cn.isMethod ) {
				this.children = this.children.filter(c=>c!=cn.route);
				// cn.Verbs[0].keepPath = false;
				if(this.isMethod && cn.Verbs[0].Name === this.Name) {
					cn.Verbs[0]._keep_path = false;
					cn.Verbs[0].route = cn.RelativeRoute;
				}
				this.Verbs.push(cn.Verbs[0]);
			}
			return !cn.isMethod;
		});
	}
	Verbs:OpenAPiVerb[]
	PathParameters:IParameterObject[]
	QueryParameters: IParameterObject[]
	RelativeRoute:string = ''
	Name:string
	get fnName () {
		return Walker.FnName(this.Name);
	}
	ParentRoute:string
	IsClass:boolean
	get IsProperty () {
		return !this.IsClass && !this.isMethod;
	}
	public get isMethod () {
		return !this.IsClass && this.Verbs.length === 1 && this.children.length === 0 && !this.Verbs.some(v=>v.isList);
	}
	constructor (public apiServer:string, public route:string, public definition:IPathItemObject, isRoot:boolean) {
		let LastRoute = route.split('/').pop();

		this.PathParameters = (definition.parameters || []).filter( p => p.in === 'path');
		this.QueryParameters = (definition.parameters || []).filter( p => p.in === 'query');
		this.ParentRoute = route;
		this.PathParameters.reverse().map(q => this.ParentRoute = this.ParentRoute.replace(new RegExp(`/{${q.name}}$`), ''));
		this.Name = this.ParentRoute.split('/').pop() || '';
		if(this.ParentRoute === route) {
			let parent = this.ParentRoute.split('/');
			parent.pop();
			this.ParentRoute = parent.join('/') || '/';
		}
		this.PathParameters = this.PathParameters.reverse().filter(p => !this.ParentRoute.includes(`/{${p.name}}`) )
		let parent_parameter = this.PathParameters.reverse().filter(p => !this.ParentRoute.includes(`/{${p.name}}`) );
		this.RelativeRoute = `/${route.replace(this.ParentRoute, '')}`.replace('//', '/');
		this.IsClass = this.PathParameters.length === 1 &&  this.PathParameters.some(p=> `{${p.name}}` === LastRoute);

		let parameters = (definition.parameters || []).filter(p => !route.includes(`{${p.name}}`) );
		let keys = Object.keys(this.definition);
		this.Verbs = ['get', 'post', 'put', 'delete'].filter(m=>keys.indexOf(m) > -1).map(v => {
			let own_params = definition[v].parameters || [];
			let params = own_params.concat(parent_parameter) ;
			if(this.IsClass) {
				params = own_params;
			}
			// definition[v].parameters = parameters;
			// definition[v].parameters =
			params = params.filter( (p, i) => params.indexOf(p) === i);
			definition[v].parameters = params;
			let newverb = new OpenAPiVerb(route, apiServer,v,definition[v], ()=> this.isMethod ? this.Name : '')
			return newverb;
		});

		// this.IsProperty = this.Verbs.length === 0;
	}
	add(route:string ) {
		this.children.push(route);
	}
	walk (Formater:Walker) : string[] {
		return Formater.fullTree(this);
	}
	toString(Formater:Walker) {
		// return this.walk(Formater).reverse().join('\n');
		return this.walk(Formater).join('\n');
	}
	inspect (depth:number) :string {
		if(this.route === '/')depth=0;
		if(this.route === '/domains')depth=1;
		let indent = "/" + this.route.split('/').slice(depth).join('/');
		let tabs = ''; for(let i = depth; i > 1; i--) tabs += '\t';
		++depth;
		let children = `(${this.children.length})`;
		let verbs = `[${this.Verbs.map(v=>v.Name).join(', ')}]`;
		return `${tabs}${this.RelativeRoute} ${children} ${verbs} method:${this.isMethod} class:${this.IsClass}\n` + this.Children.map(c=>c.inspect(depth)).join('');
	}
	//#endregion
}
