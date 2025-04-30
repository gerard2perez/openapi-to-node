import { OpenAPiVerb, Walker, OpenApi } from "../openapi";
import { APITESTNODE } from "../walkers";
import { notEqual } from "assert";

export class APITestMaker extends Walker {
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

					// if(!verb.ReturnValue) {
					// 	console.log(verb);
					// }
					if (method_name === 'get') {
						calls = [`get()&[retval:${verb.ReturnValue||'unknown'}]`];
					} else {
						calls = [`${method_name}(${parameter})&[retval:${verb.ReturnValue||'unknown'}]`];
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
			return this.toDeclaration(v, node.PathParameters).map(d=> new APITESTNODE(v.rawroute, node.route, v.verb,d,v.isList, v.ReturnValue))
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
				let verb = node.Verbs.find(v=>v.verb === r.verb && v.rawroute == r.rawroute);
				if(r && verb)r.returnValue = verb.ReturnValue;
				if(r.call.includes('[retval:')) {
					r.returnValue  = r.call.replace(/.*retval:(.*)\]/, "$1");
					r.call = r.call.split('&')[0];
				}
				return r;
			}).filter(r=>r);
		}
		return res as APITESTNODE[];
		// return res;
	}
	fullTree(node:OpenApi): string[] {
		let res = this.toProp(node).map(n=>{
			//@ts-ignore
			let retunValue = n.returnValue || 'any';
			return `(async()=>{\tlet ${n.isList ? '{data, page, pages, results}' : `res:${retunValue}`} = await ${this.Name}.${n.call}\t});`;
		});
		return res;
	}
}
