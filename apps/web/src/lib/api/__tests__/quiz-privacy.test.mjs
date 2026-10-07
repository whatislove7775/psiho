import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
register('data:text/javascript,'+encodeURIComponent(`
export async function resolve(spec, ctx, next) {
 if (spec === '@/lib/i18n') return {url:'data:text/javascript,export const t = s => s;',shortCircuit:true};
 if (spec === './client' && ctx.parentURL?.endsWith('/matching.ts')) return {url:'data:text/javascript,export const api = () => {};',shortCircuit:true};
 return next(spec,ctx);
}`),import.meta.url);
const {saveQuiz,loadQuiz,EMPTY_ANSWERS}=await import('../matching.ts');
const stored=new Map();
globalThis.window={localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}};
const key='aprosop.match.v1';
test('safety answers never enter browser persistence',()=>{
 stored.clear();saveQuiz({...EMPTY_ANSWERS,safety:'now',topics:['anxiety']},true);
 const raw=JSON.parse(stored.get(key));
 assert.equal('safety' in raw.answers,false);
 assert.deepEqual(loadQuiz().answers.topics,['anxiety']);
});
test('legacy safety answer is removed without extending retention',()=>{
 stored.clear();const savedAt=Date.now()-1000;
 stored.set(key,JSON.stringify({answers:{...EMPTY_ANSWERS,safety:'sometimes'},done:true,savedAt}));
 const value=loadQuiz();assert.equal(value.answers.safety,'no');
 const raw=JSON.parse(stored.get(key));assert.equal('safety' in raw.answers,false);assert.equal(raw.savedAt,savedAt);
});
test('expired, undated and future answers are deleted',()=>{
 for(const savedAt of [Date.now()-24*60*60*1000-1,0,Date.now()+60000]){
  stored.set(key,JSON.stringify({answers:EMPTY_ANSWERS,done:true,savedAt}));
  assert.equal(loadQuiz(),null);assert.equal(stored.has(key),false);
 }
});
