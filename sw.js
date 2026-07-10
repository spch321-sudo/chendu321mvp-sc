/* 晨讀321 · Service Worker
   策略：
   - 導覽請求（HTML）：網路優先、離線退回快取 → 內容永遠是最新的，斷網也打得開
   - 其他同源靜態檔：stale-while-revalidate → 秒開，背景默默更新
   - 非 GET、跨網域（例如 Azure TTS Worker）：完全不攔截
   - 有新版本時：postMessage 通知頁面浮出「已有新版本 · 立即更新」膠囊
   改版時只要把 VERSION 加一號，使用者就會收到更新提示。
*/
var VERSION = "1.0.8";
var CACHE   = "chendu321-sc-" + VERSION;

var CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon-32.png",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(CORE.map(function(u){
        return c.add(new Request(u, {cache:"reload"})).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      var stale = keys.filter(function(k){ return k !== CACHE && k.indexOf("chendu321-sc") === 0; });
      return Promise.all(stale.map(function(k){ return caches.delete(k); }))
        .then(function(){ return self.clients.claim(); })
        .then(function(){
          if(!stale.length) return;   /* 第一次安裝，不用打擾使用者 */
          return self.clients.matchAll({type:"window"}).then(function(cs){
            cs.forEach(function(c){ try{ c.postMessage({type:"update-available"}); }catch(_){} });
          });
        });
    })
  );
});

self.addEventListener("message", function(e){
  if(e && e.data && e.data.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                                  /* TTS 是 POST，放行 */
  var url;
  try{ url = new URL(req.url); }catch(_){ return; }
  if(url.protocol !== "http:" && url.protocol !== "https:") return; /* blob:／data: 一律放行，否則語音取不到 */
  if(url.origin !== self.location.origin) return;                   /* 跨網域不攔截 */

  if(req.mode === "navigate"){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put("./index.html", copy); });
        return res;
      }).catch(function(){
        return caches.match("./index.html").then(function(r){ return r || caches.match("./"); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && res.status === 200 && res.type === "basic"){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
