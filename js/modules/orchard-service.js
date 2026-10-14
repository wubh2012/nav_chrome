/* 后台唯一写入入口：每次操作读取最新存档，并在同一队列内校验、提交。 */
(function(root){
  'use strict';
  const Core=typeof module==='object'&&module.exports?require('./orchard-core.js'):root.OrchardCore;
  function create(storage,clock=Date.now,random=()=>Math.random()){
    let queue=Promise.resolve();
    function handle(message){
      const run=queue.then(async()=>{
        const now=clock(),saved=await storage.get([Core.KEY,Core.LEGACY_KEY]);
        const source=saved[Core.KEY]??saved[Core.LEGACY_KEY];
        const action=message.action||{type:'read'};
        // 收线结果由后台抽样，忽略前台传入的成功结果或随机数。
        const result=Core.transition(source,action.type==='fish-reel'?{type:'fish-reel',place:action.place,roll:random()}:action,now);
        if(result.changed||!saved[Core.KEY])await storage.set({[Core.KEY]:result.state});
        return {success:result.ok,state:result.state,message:result.message,...(result.fishing?{fishing:result.fishing}:{})};
      });
      queue=run.catch(()=>{});
      return run;
    }
    return {handle};
  }
  const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else root.OrchardService=api;
})(typeof globalThis==='object'?globalThis:this);
