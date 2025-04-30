export let globals = `export interface LinodeResponse<T> {
	data:T[]
	page:number
	pages:number
	results:number
	errors?:any[]
}
export type Filter<TInstance extends {}> = TInstance | {
	'+and'?:TInstance[]
	'+or'?:TInstance[]
	'+gt'?:TInstance[]
	'+gte'?:TInstance[]
	'+lt'?:TInstance[]
	'+lte'?:TInstance[]
	'+contains'?:TInstance[]
	'+neq'?:TInstance[]
	'+order_by'?:TInstance[]
	'+order'?:TInstance[]
}`;
