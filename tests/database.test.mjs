import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
let db;
const operator='11111111-1111-4111-8111-111111111111';
const descriptor=Array(128).fill(0.1);
async function lookup(d=descriptor,name=null){return (await db.query('select public.face_lookup($1::double precision[],$2::text) as result',[d,name])).rows[0].result;}
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values ('${operator}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202609160001_face_registry.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.face_operators values ('${operator}'); set request.jwt.claim.sub = '${operator}';`);
});
after(async()=>{await db.close();});
test('registration, duplicate, identification, unknown and ambiguous paths',async()=>{
 assert.equal((await lookup(descriptor,'Alex')).status,'registered');
 const duplicate=await lookup(descriptor,'Different name');
 assert.equal(duplicate.status,'already_registered');assert.equal(duplicate.name,'Alex');
 assert.equal((await lookup()).status,'identified');
 assert.equal((await lookup(Array(128).fill(0.9))).status,'not_found');
 assert.equal((await lookup([0.625,...descriptor.slice(1)],'Near duplicate')).status,'ambiguous');
 assert.equal((await db.query('select count(*)::int n from public.face_people')).rows[0].n,1);
});
test('reject malformed vectors and empty names',async()=>{
 for(const vector of [[],[1],Array(128).fill(null),Array(128).fill(Infinity)])await assert.rejects(lookup(vector,'Invalid'));
 await assert.rejects(lookup(descriptor,'  '));
});
test('reject users without operator membership',async()=>{
 await db.exec("set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222'");
 await assert.rejects(lookup(),/Operator access required/);
 await db.exec(`set request.jwt.claim.sub = '${operator}'`);
});
test('authenticated clients cannot read biometric rows directly',async()=>{
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from public.face_people'),/permission denied/);
 await db.exec('reset role');
});
test('anonymous role cannot execute matching',async()=>{
 await db.exec('set role anon');
 await assert.rejects(lookup(),/permission denied/);
 await db.exec('reset role');
});
