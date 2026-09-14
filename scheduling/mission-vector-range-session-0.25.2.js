(function(){
  'use strict';
  const VERSION='0.25.2-dev';
  const RANGE_KEY='mvciRangeQueue_v0250';
  const AUTO_SESSION_KEY='mvciRangeAutoAttempted_v0250';
  const TAB_KEY='mvciRangeTabId_v0252';
  const AUTO_LEASE_KEY='mvciRangeAutoLease_v0252';
  const LEASE_MS=5*60*1000;
  if(window.top!==window.self||window.__mvciRangeSession0252)return;
  window.__mvciRangeSession0252={version:VERSION,startedAt:Date.now()};

  function tabId(){
    let id='';
    try{
      id=sessionStorage.getItem(TAB_KEY)||'';
      if(!id){id=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;sessionStorage.setItem(TAB_KEY,id);}
    }catch(_){id=`fallback-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
    return id;
  }
  const TAB_ID=tabId();

  // The 0.25 range runner intentionally survives navigation, but localStorage is
  // shared by every open CrewSense tab. Route only its queue key to
  // sessionStorage so two CrewSense tabs cannot resume and navigate the same
  // range queue. All other localStorage keys retain normal behavior.
  const proto=Storage.prototype;
  if(!proto.__mvciRangeSessionPatched0252){
    const get=proto.getItem,set=proto.setItem,remove=proto.removeItem;
    Object.defineProperty(proto,'__mvciRangeSessionPatched0252',{value:true,configurable:false});
    proto.getItem=function(key){
      if(this===window.localStorage&&String(key)===RANGE_KEY)return window.sessionStorage.getItem(RANGE_KEY);
      return get.call(this,key);
    };
    proto.setItem=function(key,value){
      if(this===window.localStorage&&String(key)===RANGE_KEY)return window.sessionStorage.setItem(RANGE_KEY,String(value));
      return set.call(this,key,value);
    };
    proto.removeItem=function(key){
      if(this===window.localStorage&&String(key)===RANGE_KEY)return window.sessionStorage.removeItem(RANGE_KEY);
      return remove.call(this,key);
    };
  }

  // Only one simultaneously-open CrewSense tab should auto-start a range crawl.
  // Other tabs still retain all manual Mission Vector controls. The short lease
  // is refreshed naturally by same-tab navigation and expires after five minutes.
  try{
    const now=Date.now();
    let lease={};
    try{lease=JSON.parse(localStorage.getItem(AUTO_LEASE_KEY)||'{}')}catch(_){lease={};}
    const otherAlive=lease&&lease.tabId&&lease.tabId!==TAB_ID&&Number(lease.expiresAt||0)>now;
    if(otherAlive){
      sessionStorage.setItem(AUTO_SESSION_KEY,'1');
    }else{
      localStorage.setItem(AUTO_LEASE_KEY,JSON.stringify({tabId:TAB_ID,claimedAt:now,expiresAt:now+LEASE_MS}));
    }
  }catch(_){}
})();