import { Walker, OpenAPiVerb, OpenApi } from "../openapi";

export class DOCMaker extends Walker {
	toDeclaration(verb:OpenAPiVerb, PathParameters?:any[]) {
		let calls:string[] = [];
		switch(verb.verb) {
			case 'get':
				if ( verb.isList ) {
					calls = [
						`${verb.Name}(page?:number): Promise<LinodeResponse<${verb.ReturnValue}>>`,
						`${verb.Name}(page:number, page_size:number): Promise<LinodeResponse<${verb.ReturnValue}>>`
					]
					if(verb.FilterClass) {
						calls = calls.concat([
							`${verb.Name}(filter:Filter<${verb.ReturnValue}Filter>):Promise<LinodeResponse<${verb.ReturnValue}>>`,
							`${verb.Name}(page:number, filter:Filter<${verb.ReturnValue}Filter>):Promise<LinodeResponse<${verb.ReturnValue}>>`,
							`${verb.Name}(page:number, page_size:number, filter:Filter<${verb.ReturnValue}Filter>):Promise<LinodeResponse<${verb.ReturnValue}>>`
						]);
					}
				} else {
					let parameter1 = PathParameters ? PathParameters.map(p=>`${p.name}: ${this.toTSKind(p.schema.type)}`) : '';
					let parameter = verb.PathParameters.map(p=>`${p.name}: ${this.toTSKind(p.kind)}`).join(', ');
					let method_name = verb.Name === 'list' ? 'get':verb.Name;
					// calls = [`${verb.Name === 'list' ? 'get' : verb.Name}(${parameter}): Promise<${verb.ReturnValue}>`];
					if (method_name === 'get') {
						calls = [`get(): Promise<${verb.ReturnValue}>`];
					} else {
						calls = [`${method_name}(${parameter}): Promise<${verb.ReturnValue}>`];
					}
				}
				break;
			case 'post':
				calls = [`${verb.Name}(${verb.BodyValue}):Promise<${verb.ReturnValue}>`];
				break;
			case 'put':
				calls = [`${verb.Name}(${verb.BodyValue}):Promise<${verb.ReturnValue}>`];
				break;
			case 'delete':
				calls = [`${verb.Name}():Promise<${verb.ReturnValue}>`];
				break;
		}
		let {Link, Description} = verb;
		return Description.concat(calls);
	}
	toProp(node:OpenApi) {
		let Name = node.Name;
		Name = Walker.Name(Name);
		//
		if(node.IsClass) {
			if(DOCMaker.interfacesNames.includes(Name)) {
				Name = Walker.Name(`${node.ParentRoute.split('/')[1]}-${node.Name}`);
			}
			DOCMaker.interfacesNames.push(Name);
			let desc = Walker.toDescription(node.definition.get);
			desc.push(`(${node.PathParameters.map(p=>`${p.name}: ${this.toTSKind(p.schema.type)}`).join(', ')}):${Name}Class`);
			// /**\n *${node.Link}\n *${node.Description}\n */\n
			return desc;
		} else if (node.isMethod) {
			let res = this.toDeclaration(node.Verbs[0], node.PathParameters);
			return res;
		} else {
			Name = `I${Name}`;
			if(DOCMaker.interfacesNames.includes(Name)) {
				Name = Walker.Name(`i-${node.ParentRoute.split('/')[1]}-${node.Name}`);
			}
			DOCMaker.interfacesNames.push(Name);
			return `${Walker.FnName(node.Name)}:${Name}`;
		}
	}
	public static interfacesNames:string[] = []
}
