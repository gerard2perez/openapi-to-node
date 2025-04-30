import { appendFileSync, writeFileSync } from "fs";

let files_written:any = [];
export function write(FILE:string, data:string) {
	if(!files_written[FILE]) {
		writeFileSync(FILE, data + '\n');
		files_written[FILE] = true;
	} else {
		appendFileSync(FILE, data + '\n');
	}
}
export function RegionPrinter(FILE:string) {
	return function(data:string, region:string) {
		write(FILE, `//#region ${region}`);
		write(FILE, data);
		write(FILE, '\n//#endregion');
	}
}
export function test_it_printer(FILE:string) {
	return function (name:string, body:string) {
		if(body) {
			write(FILE, `\tit('${name}', async ()=>{`);
			write(FILE, `\t\t${body}`);
			write(FILE, `\t});`);
		}
	}
}
