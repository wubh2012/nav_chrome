/* 正式果园控制器：只维护界面状态，全部存档变更由后台果园服务提交。 */
window.PixelGarden = (() => {
  'use strict';
  const C=window.OrchardCore;
  let state=C.fresh(),host,world,detail,toastBox,ready=false,pending=false,queue=Promise.resolve(),refreshTimer;
  const ui={menu:false,edit:false,selectedId:null,placing:null,tab:'trees',notice:'',tones:[],detail:null,fishing:null};
  let origin=null,drag=null,draggedUntil=0,toastTimer,biteTimer;
  const mutating=new Set(['toggle','plant-tree','tree-harvest','tree-water','sow','crop-water','crop-harvest','forage','recipe','gift','chat','pet','craft-decor','turn','store','color','undo','reel','stone-answer','tone']);
  function identity(element){
    if(!element?.dataset?.orchard)return null;
    return {scope:detail?.contains(element)?'detail':world?.contains(element)?'world':'home',action:element.dataset.orchard,attrs:Object.fromEntries(['index','id','kind','route','friend','gift','color','tone','place'].filter(k=>element.dataset[k]!==undefined).map(k=>[k,element.dataset[k]]))};
  }
  function focusIdentity(value){
    if(!value)return;
    const scope=value.scope==='detail'?detail:value.scope==='world'?world:host;
    let selector=`[data-orchard="${CSS.escape(value.action)}"]`;
    for(const [k,v]of Object.entries(value.attrs))selector+=`[data-${k}="${CSS.escape(v)}"]`;
    const target=scope?.querySelector(selector);if(target&&!target.disabled)target.focus({preventScroll:true});
  }
  function view(){return OrchardView.create(state,Date.now(),{...ui,dark:document.documentElement.dataset.theme==='dark'});}
  const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function enter(element){if(element&&!reducedMotion())element.animate([{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:220,easing:'ease-out'});}
  function paintDetail(v){
    const water=ui.detail?.kind==='fishing'?detail.querySelector('.fishing-water'):null;
    const d=v.dialog(ui.detail);
    detail.innerHTML=`<header class="dialog-head"><div><span class="eyebrow">${d.eyebrow||'我的小果园'}</span><h2 id="orchard-dialog-title">${d.title}</h2></div><button class="dialog-close" data-orchard="close-detail" aria-label="关闭">×</button></header><div class="dialog-body">${d.body}</div>`;
    const next=detail.querySelector('.fishing-water');
    // 保留水面节点：收线和后台刷新不会让持续动效从第一帧重新开始。
    if(water&&next&&water.dataset.place===next.dataset.place){
      const phaseChanged=water.dataset.phase!==next.dataset.phase;
      Object.assign(water.dataset,next.dataset);water.style.cssText=next.style.cssText;
      water.querySelector('.fishing-caption').textContent=next.querySelector('.fishing-caption').textContent;
      if(phaseChanged)water.querySelector('.fishing-catch').innerHTML=next.querySelector('.fishing-catch').innerHTML;
      next.replaceWith(water);
    }
  }
  function render(){
    if(!host||drag)return;
    const overlays=[world,detail].map(scope=>[scope,scope?.querySelector('.orchard-feedback')]);
    const focus=identity(document.activeElement),v=view(),night=C.environment().night;
    document.body.dataset.orchardNight=String(night);
    document.getElementById('garden-scene-slot').innerHTML=`<div id="garden-scene" class="garden-scene orchard-home" data-interactive="${state.enabled}">${v.homeScene()}</div>`;
    document.getElementById('garden-panel-slot').innerHTML=v.homePanel();
    host.querySelector('.garden-panel')?.classList.add('orchard-home');
    if(world.open){const scroll=world.scrollTop;world.innerHTML=v.world();world.scrollTop=scroll;}
    world.dataset.night=detail.dataset.night=String(night);
    if(detail.open&&ui.detail)paintDetail(v);
    for(const scope of [host,world,detail]){scope.setAttribute('aria-busy',String(pending));scope.querySelectorAll('button[data-orchard]').forEach(b=>{if(pending&&mutating.has(b.dataset.orchard))b.disabled=true;});}
    const book=host.querySelector('.garden-notebook'),pocket=host.querySelector('.garden-pocket');
    if(ui.menu&&book&&pocket)book.style.setProperty('--garden-menu-height',Math.max(160,pocket.getBoundingClientRect().top-24)+'px');
    focusIdentity(focus);
    positionToast();
    for(const [scope,overlay]of overlays)if(overlay)scope.append(overlay);
  }
  function positionToast(){if(toastBox)(detail?.open?detail:world?.open?world:document.body).append(toastBox);}
  function clearFeedback(){toastBox.hidden=true;document.querySelectorAll('.orchard-feedback').forEach(element=>element.remove());}
  function showToast(message){if(!message)return;toastBox.textContent=message;toastBox.hidden=false;positionToast();clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastBox.hidden=true,5000);}
  function send(action){return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,response)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(response);};
    // 后台重启或消息丢失时释放提交队列；过期回调不能覆盖后续操作。
    const timer=setTimeout(()=>{const error=new Error('果园服务响应超时，请刷新页面确认进度后再试。');error.code='ORCHARD_TIMEOUT';finish(error);},10000);
    try{chrome.runtime.sendMessage({type:'ORCHARD_ACTION',action},response=>{const error=chrome.runtime.lastError;if(error)finish(new Error(error.message));else if(!response?.state)finish(new Error(response?.message||'果园服务暂时无法读取进度，请刷新页面再试。'));else finish(null,response);});}catch(error){finish(error);}
  });}
  function accept(value,force=false){const normalized=C.normalize(value);if(!force&&normalized.createdAt===state.createdAt&&normalized.revision<state.revision)return;state=normalized;if(ui.selectedId&&!state.landscape.items.some(i=>i.id===ui.selectedId))ui.selectedId=null;render();}
  function feedback(action){
    if(reducedMotion()||action.type==='read'||action.type==='toggle')return;
    const scope=detail.open?detail:world.open?world:host;
    const effects={'tree-harvest':['harvest','果子收好啦'],'crop-harvest':['harvest','收下这份生长'],'tree-water':['water','喝到水啦'],'crop-water':['water','喝到水啦'],sow:['grow','种下一点期待'],'plant-tree':['grow','小树安家啦'],forage:['gather','发现收好啦'],recipe:['craft','做好啦'],'decor-craft':['craft','小物件做好啦'],gift:['heart','小心意送到啦'],chat:['heart','又熟悉了一点'],pet:['heart','小橘蹭了蹭你'],stone:['spark','发现小秘密'],chime:['spark','鸟儿记住了旋律'],'fish-reel':['harvest','水边的小收获']};
    const effect=effects[action.type]||(action.type.startsWith('decor-')?['place','小角落调整好了']:null);
    if(!effect)return;
    scope.querySelector('.orchard-feedback')?.remove();
    const box=document.createElement('div');box.className='orchard-feedback';box.dataset.effect=effect[0];box.setAttribute('aria-hidden','true');
    for(let i=0;i<6;i++){const dot=document.createElement('span');dot.className='feedback-particle';dot.style.setProperty('--particle-x',`${(i-2.5)*19}px`);dot.style.setProperty('--particle-delay',`${i*35}ms`);box.append(dot);}
    const label=document.createElement('span');label.className='feedback-label';label.textContent=effect[1];box.append(label);scope.append(box);setTimeout(()=>box.remove(),1200);
    let target=scope.querySelector('.dialog-art svg,.crop-preview i,.friend-story,.recipe-list,.puzzle-picture');
    if(world.open&&!detail.open&&action.type.startsWith('decor-'))target=world.querySelector('.workshop-hit.selected')||world.querySelector('.map-wrap');
    if(target)target.animate([{scale:'1'},{scale:'1.035'},{scale:'1'}],{duration:380,easing:'ease-out'});
    host.querySelector('.garden-pocket strong')?.animate([{scale:'1'},{scale:'1.18'},{scale:'1'}],{duration:350,easing:'ease-out'});
  }
  function commit(action,{quiet=false}={}){
    const run=queue.then(async()=>{
      let succeeded=false;
      pending=true;if(action.type!=='read')render();
      try{const response=await send(action);succeeded=response.success&&(!response.fishing||response.fishing.outcome==='caught');accept(response.state);if(response.message&&!quiet){ui.notice=response.message;showToast(response.message);}return response;}
      catch(error){ui.notice=error.code==='ORCHARD_TIMEOUT'?error.message:'果园进度暂未保存，请刷新页面后再试。';showToast(ui.notice);console.warn('[PixelGarden]',error);return {success:false,message:ui.notice};}
      finally{pending=false;render();if(succeeded)feedback(action);}
    });
    queue=run.catch(()=>{});return run;
  }
  function cancelFishing(){clearTimeout(biteTimer);biteTimer=null;ui.fishing=null;}
  function closeDetail(){if(ui.detail?.kind==='fishing')cancelFishing();const overlay=detail.querySelector('.orchard-feedback');if(detail.open)detail.close();ui.detail=null;if(overlay)(world.open?world:host).append(overlay);positionToast();focusIdentity(origin);}
  function openDetail(spec){if(spec.kind!=='fishing'&&ui.detail?.kind==='fishing')cancelFishing();if(!detail.open)origin=identity(document.activeElement);clearFeedback();ui.menu=false;ui.detail=spec;paintDetail(view());detail.dataset.kind=spec.kind;detail.dataset.night=String(C.environment().night);if(!detail.open)detail.showModal();render();enter(detail.querySelector('.dialog-body'));}
  function openWorld(edit=false){closeDetail();clearFeedback();ui.menu=false;ui.edit=edit;ui.placing=null;ui.selectedId=null;render();world.innerHTML=view().world();if(!world.open)world.showModal();world.scrollTop=0;enter(world.querySelector('.orchard-world-content'));}
  function closeWorld(){closeDetail();drag=null;ui.edit=false;ui.placing=null;ui.selectedId=null;if(world.open)world.close();render();host.querySelector('.garden-pocket')?.focus({preventScroll:true});}
  function mapPoint(event,svg){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  async function placePoint(point){
    const x=Math.round(point.x/20)*20,y=Math.round(point.y/20)*20;
    if(ui.placing){const kind=ui.placing,response=await commit({type:'decor-place',kind,x,y});if(response.success){ui.selectedId=response.state.landscape.nextId-1;ui.placing=null;render();}}
    else if(ui.selectedId)await commit({type:'decor-move',id:ui.selectedId,x,y});
  }
  async function act(target){const action=target.dataset.orchard;
    if(target.disabled||pending&&mutating.has(action))return;
    if(action==='menu'){ui.menu=!ui.menu;render();if(ui.menu)enter(host.querySelector('.garden-notebook'));return;}
    if(action==='close-detail'){closeDetail();return;}
    if(action==='close-world'){closeWorld();return;}
    if(action==='toggle'){await commit({type:'toggle'});return;}
    if(action==='help'){openDetail({kind:'help'});return;}
    if(!ready){const response=await commit({type:'read'});ready=!!response.state;return;}
    if(!state.enabled){showToast('先在「我的果园」里开启互动，再继续照料。');return;}
    if(action==='walk'){openWorld();return;}
    if(action==='edit'){openWorld(true);return;}
    if(action==='finish'){ui.edit=false;ui.placing=null;ui.selectedId=null;render();return;}
    if(action==='tab'){ui.tab=target.dataset.tab;render();enter(world.querySelector('.journal-entries'));return;}
    if(action==='palette'){ui.selectedId=null;ui.placing=target.dataset.kind;render();return;}
    if(action==='select-item'){ui.selectedId=Number(target.dataset.id);ui.placing=null;render();return;}
    if(action==='copy'){const item=state.landscape.items.find(i=>i.id===ui.selectedId);if(item&&state.landscape.bag[item.kind]){ui.placing=item.kind;ui.selectedId=null;render();}return;}
    if(action==='craft-decor'){await commit({type:'decor-craft',kind:target.dataset.kind});return;}
    if(action==='turn'||action==='store'||action==='color'){const id=ui.selectedId;await commit({type:'decor-'+action,id,color:Number(target.dataset.color)});return;}
    if(action==='undo'){await commit({type:'decor-undo',expectedRevision:state.revision});ui.selectedId=null;render();return;}
    if(action==='forage'){await commit({type:'forage',id:target.dataset.id});return;}
    if(action==='pet'){await commit({type:'pet'});return;}
    if(action==='pond'){await commit({type:'observe'},{quiet:true});openDetail({kind:'pond'});return;}
    if(action==='tree'||action==='crop'){openDetail({kind:action,index:Number(target.dataset.index)});return;}
    if(['plant','book','recipes','letters','find','album','stone','chime'].includes(action)){if(action==='chime')ui.tones=[];openDetail({kind:action});return;}
    if(action==='friend'||action==='cat'){openDetail({kind:'friend',id:target.dataset.friend||'cat'});return;}
    if(action==='route'){openDetail({kind:'route',route:target.dataset.route});return;}
    if(action==='creature'){openDetail({kind:'creature',id:target.dataset.creature});return;}
    if(action==='plant-tree'){const response=await commit({type:'plant-tree',kind:target.dataset.kind});if(response.success)closeDetail();return;}
    if(action==='tree-harvest'||action==='tree-water'||action==='crop-harvest'||action==='crop-water'){const response=await commit({type:action,index:ui.detail?.index});if(response.success&&action==='crop-harvest')closeDetail();return;}
    if(action==='sow'){await commit({type:'sow',index:ui.detail?.index,kind:target.dataset.kind});return;}
    if(action==='recipe'){await commit({type:'recipe',id:target.dataset.id});return;}
    if(action==='chat'||action==='gift'){await commit({type:action,id:ui.detail?.id,gift:target.dataset.gift});return;}
    if(action==='stone-answer'){await commit({type:'stone',answer:target.dataset.answer});return;}
    if(action==='tone'){const tone=target.dataset.tone,answer=['high','low','middle'];ui.tones.push(tone);if(ui.tones[ui.tones.length-1]!==answer[ui.tones.length-1]){ui.tones=[];showToast('鸟儿又唱了一遍：高、低、中。慢慢试，没有关系。');}if(ui.tones.length===3)await commit({type:'chime',tones:[...ui.tones]});render();const button=detail.querySelector(`[data-tone="${CSS.escape(tone)}"]`);if(button&&!reducedMotion())button.animate([{rotate:'0deg'},{rotate:'-4deg'},{rotate:'4deg'},{rotate:'0deg'}],{duration:350,easing:'ease-out'});return;}
    if(action==='fishing'){cancelFishing();ui.fishing={phase:'ready',place:'pond',progress:0,notice:'',caught:null};openDetail({kind:'fishing'});return;}
    const f=ui.fishing;if(!f||ui.detail?.kind!=='fishing')return;
    if(action==='fish-place'&&['ready','caught','miss','released'].includes(f.phase))f.place=target.dataset.place;
    if(action==='cast'&&['ready','caught','miss','released'].includes(f.phase)){
      clearTimeout(biteTimer);clearFeedback();Object.assign(f,{phase:'wait',progress:0,notice:'',caught:null});
      // 自动咬钩，只改变界面状态；收获必须由一次收线提交后台判定。
      biteTimer=setTimeout(()=>{biteTimer=null;if(ui.fishing!==f||ui.detail?.kind!=='fishing'||!detail.open||f.phase!=='wait')return;f.phase='bite';f.notice='小鱼上钩了！点一次「收线」就好，不用着急。';render();},5000+Math.floor(Math.random()*15000));
    }
    if(action==='reel'&&f.phase==='bite'){
      f.phase='reel';f.progress=100;f.notice='正在把鱼线收回来…';render();
      let response;
      try{[response]=await Promise.all([commit({type:'fish-reel',place:f.place},{quiet:true}),new Promise(resolve=>setTimeout(resolve,reducedMotion()?0:500))]);}
      finally{
        // 关闭或换页后不再重绘旧窗口，已发出的保存仍由后台完成。
        if(ui.fishing===f){
          const result=response?.fishing,valid=response?.success&&['caught','miss','released'].includes(result?.outcome)&&(result.outcome==='miss'||Object.prototype.hasOwnProperty.call(C.FISH,result.fish));
          f.phase=valid?result.outcome:'ready';f.caught=valid?result.fish:null;f.progress=0;
          const outdated=response?.message==='果园操作无法识别。'||response?.success&&!valid;
          f.notice=outdated?'果园后台尚未更新，请在扩展管理页重新加载插件，再刷新此页。':response?.message||'这次收线暂未确认，请刷新页面确认进度后再试。';
          render();
        }
      }
      return;
    }
    render();
  }
  function bind(scope){
    scope.addEventListener('click',event=>{const target=event.target.closest('[data-orchard]');if(target){if(scope===world&&event.target.closest('.editing-map')&&performance.now()<draggedUntil)return;act(target).catch(error=>{console.warn('[PixelGarden]',error);showToast('请稍后再试。');});return;}if(scope===world&&ui.edit&&event.target.closest('.editing-map')&&performance.now()>=draggedUntil)placePoint(mapPoint(event,event.target.closest('.editing-map')));});
    scope.addEventListener('keydown',event=>{const target=event.target.closest('g[data-orchard]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();act(target);}if(scope===world&&ui.edit&&ui.selectedId&&!detail.open&&!event.target.closest('input,textarea,select,[contenteditable]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();const item=state.landscape.items.find(i=>i.id===ui.selectedId);if(item){const [x,y]={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];placePoint({x:item.x+x,y:item.y+y});}}});
  }
  async function init(app){
    if(host)return;host=app;
    world=document.createElement('dialog');world.id='orchard-world';world.className='orchard-world';world.setAttribute('aria-labelledby','orchard-world-title');
    detail=document.createElement('dialog');detail.id='orchard-dialog';detail.className='orchard-dialog';detail.setAttribute('aria-labelledby','orchard-dialog-title');
    toastBox=document.createElement('p');toastBox.className='orchard-toast';toastBox.setAttribute('role','status');toastBox.hidden=true;
    document.body.append(world,detail,toastBox);render();
    for(const scope of [document.getElementById('garden-scene-slot'),document.getElementById('garden-panel-slot'),world,detail])bind(scope);
    world.addEventListener('cancel',event=>{event.preventDefault();closeWorld();});detail.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
    for(const dialog of [world,detail])dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){if(dialog===detail)closeDetail();else closeWorld();}});
    world.addEventListener('pointerdown',event=>{if(!ui.edit||pending||event.button!==0)return;const item=event.target.closest('.workshop-item[data-id]'),svg=event.target.closest('.editing-map');if(!item||!svg)return;const saved=state.landscape.items.find(i=>i.id===Number(item.dataset.id));if(!saved)return;ui.selectedId=saved.id;ui.placing=null;drag={id:saved.id,svg,start:mapPoint(event,svg),origin:{x:saved.x,y:saved.y},element:item,moved:false,pointerId:event.pointerId};world.setPointerCapture(event.pointerId);event.preventDefault();});
    world.addEventListener('pointermove',event=>{if(!drag)return;const p=mapPoint(event,drag.svg),x=p.x-drag.start.x,y=p.y-drag.start.y;if(Math.hypot(x,y)>5)drag.moved=true;drag.element.setAttribute('transform',`translate(${x} ${y})`);});
    world.addEventListener('pointerup',event=>{if(!drag)return;const d=drag,p=mapPoint(event,d.svg);drag=null;d.element.removeAttribute('transform');world.releasePointerCapture(d.pointerId);draggedUntil=d.moved?performance.now()+250:0;if(d.moved)placePoint({x:d.origin.x+p.x-d.start.x,y:d.origin.y+p.y-d.start.y});else render();});
    world.addEventListener('pointercancel',()=>{drag=null;render();});
    document.addEventListener('pointerdown',event=>{if(ui.menu&&!event.target.closest('#garden-panel')){ui.menu=false;render();}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&ui.menu&&!world.open&&!detail.open){ui.menu=false;render();host.querySelector('.garden-pocket')?.focus();}});
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&Object.prototype.hasOwnProperty.call(changes,C.KEY)){try{accept(changes[C.KEY].newValue,true);}catch(error){showToast(error.message);}}});
    const response=await commit({type:'read'},{quiet:true});ready=!!response.state;
    const refresh=()=>{document.body.dataset.orchardPaused=String(document.hidden);if(!document.hidden&&!pending)commit({type:'read'},{quiet:true});};
    refreshTimer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('pagehide',()=>{clearInterval(refreshTimer);cancelFishing();},{once:true});
  }
  return {init};
})();
