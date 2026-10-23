import type { Metadata, Viewport } from "next";
import { screenMeasureScript } from "@main/layout";
import { AppResetGate } from "@/shared/components/app-reset-gate";
import { MonochromeSync } from "@/shared/components/monochrome-sync";
import { PdfPreviewHost } from "@/shared/components/pdf-preview-host";
import { ServiceWorker } from "@/shared/components/service-worker";
import { SupabaseSession } from "@/shared/components/supabase-session";
import { TabPrefetch } from "@/shared/components/tab-prefetch";
import { TrialLock } from "@/shared/components/trial-lock";
import { VisualBottom } from "@/shared/components/visual-bottom";
import "./globals.css";

/** White until the head script has measured. Nothing moves until the portfolio measure has landed. */
const MEASURE_CSS = `
html{height:var(--app-h,100svh)!important;bottom:auto!important}
html:not(.compass-sized),html:not(.compass-sized) body{background:#fff!important}
html:not(.compass-sized) .compass-layer,html:not(.compass-sized) .compass-sky-band{visibility:hidden}
html:not(.compass-settled),html:not(.compass-settled) *,html:not(.compass-settled) *::before,html:not(.compass-settled) *::after{transition:none!important;animation:none!important}
main.compass-main.fixed.top-0{height:var(--app-h,100svh)}
div.compass-main.fixed.inset-y-0:not([class*="overflow"]){height:var(--app-h,100svh);bottom:auto;background:#fff}
@media (hover:hover) and (pointer:fine){
  html{bottom:0!important;height:auto!important}
  main.compass-main.fixed.top-0{bottom:0;height:auto}
  main.compass-main:not(.fixed){height:var(--app-h,100dvh)}
  div.compass-main.fixed.inset-y-0:not([class*="overflow"]){bottom:0!important;height:auto!important}
}
`;

/**
 * Motion stays off only for the cold open of the portfolio.
 * The installed app starts at / and then moves to /main in the same document,
 * so an onboarded phone (or one that already has cards) must not be marked settled here.
 * Every other first paint is settled immediately, or the kill-switch would freeze that screen.
 */
const RELEASE_MOTION_SCRIPT = `(function(){
try{localStorage.removeItem("compass.resume-route")}catch(e){}
var root=document.documentElement;
var read=function(name){return root.style.getPropertyValue(name).trim()};
window.__compassHeadMeasure={appH:read("--app-h"),bandH:read("--band-h"),vvBottom:read("--vv-bottom"),hd:read("--hd")};
var path=location.pathname;
var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
if(standalone){
  var pin=function(){if(window.scrollX||window.scrollY)window.scrollTo(0,0)};
  pin();
  window.addEventListener("scroll",pin);
  if(window.visualViewport)window.visualViewport.addEventListener("scroll",pin);
}
var portfolio=path==="/main"||path.indexOf("/main/")===0;
if(!portfolio&&path==="/"){
  try{
    var raw=localStorage.getItem("compass-storage-v4");
    if(raw){
      var state=JSON.parse(raw).state||{};
      if(state.user&&state.user.onboarded)portfolio=true;
      else if(state.cards&&state.cards.length)portfolio=true;
    }
  }catch(e){}
}
if(portfolio&&standalone){
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute("content","#c5e8f7");
}
if(portfolio)return;
document.documentElement.classList.add("compass-settled");
})();`;

/** iOS Safari draws `:active` only on a page with a touchstart listener; without it a tap shows nothing. */
const TOUCH_ACTIVE_SCRIPT = `document.addEventListener("touchstart",function(){},{passive:true});`;

/**
 * Temporary. Records the standalone viewport at cold launch, then after 500ms,
 * 2s, landscape, and the return to portrait. The /main panel only reads this log.
 */
const VIEWPORT_SNAPSHOT_SCRIPT = `(function(){
var root=document.documentElement;
function n(v){return v==null||v!==v?"-":String(Math.round(v))}
function probe(unit){
  var el=document.createElement("div");
  el.style.cssText="position:fixed;top:0;height:100"+unit+";visibility:hidden;pointer-events:none";
  root.appendChild(el);
  var h=el.getBoundingClientRect().height;
  el.remove();
  return h;
}
function envPx(name){
  var el=document.createElement("div");
  el.style.cssText="position:fixed;left:0;visibility:hidden;pointer-events:none;width:0;height:env("+name+")";
  root.appendChild(el);
  var h=el.getBoundingClientRect().height;
  el.remove();
  return h;
}
function box(el){
  if(!el||!el.getBoundingClientRect)return "missing";
  var r=el.getBoundingClientRect();
  var c=getComputedStyle(el);
  return "rect "+n(r.top)+".."+n(r.bottom)+" h"+n(r.height)
    +"\\noff "+el.offsetHeight+" client "+el.clientHeight+" scroll "+el.scrollHeight
    +"\\nh "+c.height+" min "+c.minHeight+" max "+c.maxHeight
    +"\\npos "+c.position+" top "+c.top+" bot "+c.bottom
    +"\\nov "+c.overflow+" bg "+c.backgroundColor;
}
function sample(label){
  var vv=window.visualViewport;
  var standalone=window.matchMedia("(display-mode: standalone)").matches;
  var lines=[
    label+" "+location.pathname+" orient "+(window.matchMedia("(orientation: landscape)").matches?"land":"port"),
    "inner "+n(window.innerHeight)+" outer "+n(window.outerHeight)+" screen "+n(screen.height)+" avail "+n(screen.availHeight),
    "vh "+n(probe("vh"))+" svh "+n(probe("svh"))+" dvh "+n(probe("dvh"))+" lvh "+n(probe("lvh")),
    "vv "+n(vv&&vv.height)+" offTop "+n(vv&&vv.offsetTop)+" pageTop "+n(vv&&vv.pageTop),
    "docClient "+n(root.clientHeight)+" docScroll "+n(root.scrollHeight)+" bodyClient "+n(document.body&&document.body.clientHeight)+" bodyScroll "+n(document.body&&document.body.scrollHeight),
    "safeT "+n(envPx("safe-area-inset-top"))+" safeB "+n(envPx("safe-area-inset-bottom")),
    "display "+standalone+" navStandalone "+(navigator.standalone===true),
    "vars app "+(root.style.getPropertyValue("--app-h").trim()||"-")+" band "+(root.style.getPropertyValue("--band-h").trim()||"-")+" vvb "+(root.style.getPropertyValue("--vv-bottom").trim()||"-"),
    "HTML\\n"+box(root),
    "BODY\\n"+box(document.body),
    "MAIN\\n"+box(document.querySelector("main.compass-main")),
    "BAND\\n"+box(document.querySelector(".compass-sky-band"))
  ];
  return lines.join("\\n");
}
function put(label){
  var log=window.__compassViewportLog||(window.__compassViewportLog=[]);
  var row={label:label,text:sample(label)};
  var i=-1;
  for(var k=0;k<log.length;k++)if(log[k].label===label)i=k;
  if(i>=0)log[i]=row;else log.push(row);
  try{window.dispatchEvent(new Event("compass-viewport-snap"))}catch(e){}
}
put("A");
setTimeout(function(){put("B")},500);
setTimeout(function(){put("C")},2000);
var seenLand=false;
function turned(){
  var land=window.matchMedia("(orientation: landscape)").matches;
  setTimeout(function(){
    if(land){seenLand=true;put("D")}
    else if(seenLand)put("E");
  },500);
}
window.addEventListener("orientationchange",turned);
})();`;

export const metadata: Metadata = {
  metadataBase: new URL("https://adedme.com"),
  title: "ADED",
  description: "ADED",
  manifest: "/manifest.json",
  // `?v=` is the icon's version: /icons/* is cached for a year, so a new icon needs a new address.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png?v=2", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/icon-180.png?v=2", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "ADED", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F9F8F6",
  interactiveWidget: "overlays-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: screenMeasureScript() }} />
        <script dangerouslySetInnerHTML={{ __html: RELEASE_MOTION_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TOUCH_ACTIVE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIEWPORT_SNAPSHOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: MEASURE_CSS }} />
      </head>
      <body className="min-h-full font-sans antialiased">
        <AppResetGate />
        <MonochromeSync />
        <SupabaseSession />
        <VisualBottom />
        <PdfPreviewHost />
        <TabPrefetch />
        <ServiceWorker />
        {children}
        <TrialLock />
      </body>
    </html>
  );
}
