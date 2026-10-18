// Runs actual auth/quota/routes against an isolated SQLite database. Only the
// Cloudflare/Next host adapters are replaced; application SQL is not mocked.
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
export let database;
class Statement {
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async run(){const result=database.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}
  async first(){return database.prepare(this.sql).get(...this.args)||null;}
  async all(){return {success:true,results:database.prepare(this.sql).all(...this.args)};}
}
export const env={ADMIN_USERNAME:"admin",ADMIN_PASSWORD:"synthetic-admin-password",DB:{
  prepare(sql){return new Statement(sql);},
  async batch(statements){database.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());database.exec("COMMIT");return results;}catch(error){database.exec("ROLLBACK");throw error;}}
}};
export const jar=new Map();
export async function cookies(){return {get:name=>jar.get(name),set:(name,value,options)=>jar.set(name,{value,options})};}
export function redirect(path){throw new Error(`Redirect: ${path}`);}
export function reset(){
  database?.close();database=new DatabaseSync(":memory:");database.exec("PRAGMA foreign_keys=ON");jar.clear();
  const root=new URL("../../drizzle/",import.meta.url);
  for(const file of readdirSync(root).filter(name=>name.endsWith(".sql")).sort())database.exec(readFileSync(new URL(file,root),"utf8"));
}
export function close(){database?.close();database=undefined;jar.clear();}
