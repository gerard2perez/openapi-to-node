import { OpenApi, OpenAPiVerb, Walker, TS2VAL, DocFormater } from "./openapi";
import { isNumber } from "util";
import { API2TS } from "./schema-extractor";

 export class APITESTNODE {
	public constructor(public rawroute:string, public fullpath:string, public verb:string, public call:string, public isList:boolean = false, public link?:string, public returnValue?:string) {}
}
export class REAMEMaker extends Walker {
	toDeclaration(verb:OpenAPiVerb, PathParameters?:any[]) {
		let calls:string[] = [];
		switch(verb.verb) {
			case 'get':
				if ( verb.isList ) {
					calls = [
						`${verb.Name}()`,
						`${verb.Name}(1)`,
						`${verb.Name}(1, 50)`
					]
					if(verb.FilterClass) {
						calls = calls.concat([
							`${verb.Name}({} as Filter<${verb.ReturnValue}Filter>)`,
							`${verb.Name}(2, {} as Filter<${verb.ReturnValue}Filter>)`,
							`${verb.Name}(2, 5, {} as Filter<${verb.ReturnValue}Filter>)`
						]);
					}
				} else {
					// let parameter = PathParameters ? PathParameters.map(p => Walker.toArgExample(p)).join(', ') : '';
					let parameter = verb.PathParameters.map(Walker.toArgExample2).join(', ');
					let method_name = verb.Name === 'list' ? 'get':verb.Name;
					if (method_name === 'get') {
						calls = [`get()`];
					} else {
						calls = [`${method_name}(${parameter})`];
					}
				}
				break;
			case 'post':
				calls = [`${verb.Name}(${verb.BodyValue.replace('data:', '{} as')})`];
				break;
			case 'put':
				calls = [`${verb.Name}(${verb.BodyValue.replace('data:', '{} as')})`];
				break;
			case 'delete':
				calls = [`${verb.Name}()`];
				break;
		}
		return calls;
	}
	toProp(node:OpenApi) : APITESTNODE[] {
		let childs = node.Children.map(this.toProp.bind(this)).map(ch=>{
			// let res2 = (ch as string[]).map(chh=>{
			// 	return `${node.Name}.${chh}`;
			// });
			return [].concat.apply([], ch as any);
		});
		let own = node.Verbs.map(v => {
			return this.toDeclaration(v, node.PathParameters).map(d=> new APITESTNODE(v.rawroute, node.route, v.verb,d,v.isList, v.Link));
		});
		let res:any[] = own.concat(childs);
		res = [].concat.apply([], res);
		if(node.IsClass) {
			res = res.map(r=>{
				let res = `(${node.PathParameters.map(p => Walker.toArgExample(p) ).join(', ')}).${r.call ? r.call : r}`;
				if(r.call) {
					r.call = res;
				} else {
					r = res;
				}
				return r;
			});
		}
		if(!node.IsClass && !node.isMethod && !node.IsProperty) {
			res = res.map(r=>{
				let res = `${Walker.FnName(node.Name)}.${r.call ? r.call : r}`.replace('.(', '(');
				if(r.call) {
					r.call = res;
				} else {
					r = res;
				}
				return r;
				// return `${Walker.FnName(node.Name)}.${r}`.replace('.(', '(');
			});
		} else if (node.IsProperty) {
			res = res.map(r=>{
				let res = `${Walker.FnName(node.Name)}.${r.call ? r.call : r}`.replace('.(', '(');
				if(r.call) {
					r.call = res;
				} else {
					r = res;
				}
				return r;
			});
		}
		return res as APITESTNODE[];
		// return res;
	}
	fullTree(node:OpenApi): string[] {
		let res = this.toProp(node).map(n=>{
			return `|await ${this.Name}.${n.call} | [${n.fullpath}](${n.link})|`;
		});
		return res;
	}
}

export class MochaTest extends Walker {

	MochaPrint(rawpaths:any, servers:any[], parent:string, node:APITESTNODE) {
		let Parameters = rawpaths[node.rawroute].parameters;
		let OpenApi3Definition = rawpaths[node.rawroute][node.verb];
		let api_call = `await server.${parent}.${node.call}`.replace('.(', '(');
		let BodyClass = DocFormater.getContentChallenge('requestBody', OpenApi3Definition).name || '';
		// let must_return = `[${node.verb}] ${servers[0].url + node.fullpath} ${BodyClass}`.trim();
		let must_return:{[property:string]:any} = {
			verb: node.verb,
			route: `${servers[0].url + node.rawroute}`
		};
		if(BodyClass)must_return.body = {};
		let query='';
		let filter:any={
			Authorization: `Bearer ${this.Arguments}`
		};
		if(node.call.includes('list(1)'))query = '?page=1';
		if(node.call.includes('list(1, 50)'))query = '?page=1&page_size=50';
		if(node.call.includes('list({} as'))filter['X-Filter']={};
		if(node.call.includes('list(2, {} as')){
			query = '?page=2';
			filter['X-Filter']={};
		}
		if(node.call.includes('list(2, 5, {} as')){
			query = '?page=2&page_size=5';
			filter['X-Filter']={};
		}

		if(query)must_return.query = query;
		must_return.headers = filter;

		let parameter = Parameters ? Parameters.map(p => {
			let arg = Walker.toArgExample(p);
			if(typeof(arg) === 'string')arg = arg.replace(/\'/gm, '');
			must_return.route = must_return.route.replace(`{${p.name}}`, arg);
			return arg;
		}).join(', ') : '';

		return `expect(${api_call}).to.deep.equal(${JSON.stringify(must_return)});`;
	}
	toDeclaration(verb:OpenAPiVerb, PathParameters?:any[]) {
		let calls:string[] = [];
		switch(verb.verb) {
			case 'get':
				if ( verb.isList ) {
					calls = [
						`${verb.Name}()`,
						`${verb.Name}(1)`,
						`${verb.Name}(1, 50)`
					]
					if(verb.FilterClass) {
						calls = calls.concat([
							`${verb.Name}({} as Filter<${verb.ReturnValue}Filter>)`,
							`${verb.Name}(2, {} as Filter<${verb.ReturnValue}Filter>)`,
							`${verb.Name}(2, 5, {} as Filter<${verb.ReturnValue}Filter>)`
						]);
					}
				} else {
					let parameter = verb.PathParameters.map(Walker.toArgExample2).join(', ');
					let method_name = verb.Name === 'list' ? 'get':verb.Name;
					if (method_name === 'get') {
						calls = [`get()`];
					} else {
						calls = [`${method_name}(${parameter})`];
					}
				}
				break;
			case 'post':
				calls = [`${verb.Name}(${verb.BodyValue.replace('data:', '{} as')})`];
				break;
			case 'put':
				calls = [`${verb.Name}(${verb.BodyValue.replace('data:', '{} as')})`];
				break;
			case 'delete':
				calls = [`${verb.Name}()`];
				break;
		}
		return calls;
	}
	toProp(node:OpenApi) : APITESTNODE[] {
		let childs = node.Children.map(this.toProp.bind(this)).map(ch=>{
			// let res2 = (ch as string[]).map(chh=>{
			// 	return `${node.Name}.${chh}`;
			// });
			return [].concat.apply([], ch as any);
		});
		let own = node.Verbs.map(v => {
			return this.toDeclaration(v, node.PathParameters).map(d=> new APITESTNODE(v.rawroute, node.route, v.verb,d,v.isList));
		});
		let res:any[] = own.concat(childs);
		res = [].concat.apply([], res);
		if(node.IsClass) {
			res = res.map(r=>{
				let res = `(${node.PathParameters.map(p => Walker.toArgExample(p) ).join(', ')}).${r.call ? r.call : r}`;
				if(r.call) {
					r.call = res;
				} else {
					r = res;
				}
				return r;
				// return `${node.Name}(${node.PathParameters.map(p => TS2VAL[this.toTSKind(p.schema.type) as any]).join(', ')}).${r}`;
			});
		}
		if(!node.IsClass && !node.isMethod && !node.IsProperty) {
			res = res.map(r=>{
				let res = `${Walker.FnName(node.Name)}.${r.call ? r.call : r}`.replace('.(', '(');
				if(r.call) {
					r.call = res;
				} else {
					r = res;
				}
				return r;
				// return `${Walker.FnName(node.Name)}.${r}`.replace('.(', '(');
			});
		} else if (node.IsProperty) {
			res = res.map(r=>{
				let res = `${Walker.FnName(node.Name)}.${r.call ? r.call : r}`.replace('.(', '(');
				if(r.call) {
					r.call = res;
				} else {
					r = res;
				}
				return r;
			});
		}
		return res as APITESTNODE[];
		// return res;
	}
	fullTree(node:OpenApi): string[] {
		let res = this.toProp(node).map(n=>{
			return `(async()=>{\tlet ${n.isList ? '{data, page, pages, results}' : 'res'} = await ${this.Name}.${n.call}\t});`;
		});
		return res;
	}
}
