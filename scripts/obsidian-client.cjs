// Bounded real-app transport, restricted to a marked disposable test vault.
const {execFileSync}=require('node:child_process');
const {readFileSync,realpathSync}=require('node:fs');
const {basename,join}=require('node:path');
const assert=require('node:assert/strict');
module.exports=function client(path){
  const vault=realpathSync(path);
  assert.match(basename(vault),/^Nebula-Focus-/);
  assert.equal(JSON.parse(readFileSync(join(vault,'.nebula-focus-test-vault'))).plugin,'nebula-focus');
  const warnings=[];
  function cli(...args){
    try{return execFileSync('/Applications/Obsidian.app/Contents/MacOS/obsidian-cli',[`vault=${basename(vault)}`,...args],{encoding:'utf8',timeout:15000,killSignal:'SIGKILL'}).trim();}
    catch(error){
      const out=String(error.stdout||'').trim();
      let complete=false;
      try { complete=args[0]==='dev:cdp' && typeof JSON.parse(out)==='object'; } catch {}
      complete ||= args[0]==='eval' && out.split('\n').some(line=>line.startsWith('=> '));
      complete ||= args[0]==='plugin:reload' && out==='Reloaded: nebula-focus';
      complete ||= args[0]==='dev:screenshot' && out===args[1]?.slice(5);
      if(error.code==='ETIMEDOUT' && complete){warnings.push({command:args[0],reason:'CLI timed out after complete response'});return out;}
      throw error;
    }
  }
  function evaluate(code){
    const program=`(async()=>{try{return JSON.stringify({ok:true,value:await(async()=>{${code}})()})}catch(e){return JSON.stringify({ok:false,error:e.stack||String(e)})}})()`;
    const encoded=Buffer.from(program).toString('base64');
    const result=cli('eval',`code=eval(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))))`);
    const line=result.split('\n').find(line=>line.startsWith('=> '));
    if(!line)throw Error(result);
    const data=JSON.parse(line.slice(3));if(!data.ok)throw Error(data.error);return data.value;
  }
  function cdp(method,params={}){return JSON.parse(cli('dev:cdp',`method=${method}`,`params=${JSON.stringify(params)}`));}
  return {vault,name:basename(vault),cli,evaluate,cdp,warnings};
};
