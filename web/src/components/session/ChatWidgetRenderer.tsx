import { useCallback, useEffect, useRef, useState } from "react";

const CDN_WHITELIST = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "esm.sh",
];

const DANGEROUS_TAGS =
  /<(iframe|object|embed|meta|link|base|form)[\s>][\s\S]*?<\/\1>/gi;
const DANGEROUS_VOID = /<(iframe|object|embed|meta|link|base)\b[^>]*\/?>/gi;

function sanitizeForIframe(html: string): string {
  return html.replace(DANGEROUS_TAGS, "").replace(DANGEROUS_VOID, "");
}

const STYLE_BLOCK = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{
  background:#18181b;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  font-size:14px;line-height:1.6;padding:12px;overflow-x:hidden;
}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #3f3f46;padding:6px 8px;text-align:left}
th{background:#27272a;font-weight:600;color:#e4e4e7}
td{color:#a1a1aa}
pre{background:#27272a;padding:10px;border-radius:6px;overflow-x:auto;color:#a1a1aa}
code{font-family:monospace;font-size:13px}
a{color:#60a5fa}
img,svg{max-width:100%;height:auto}
`;

function buildReceiverSrcdoc(): string {
  const cspDomains = CDN_WHITELIST.map((d) => "https://" + d).join(" ");
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${cspDomains}`,
    "style-src 'unsafe-inline'",
    "img-src * data: blob:",
    "media-src * data: blob:",
    "font-src * data:",
    "connect-src 'none'",
  ].join("; ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${STYLE_BLOCK}</style>
</head>
<body style="margin:0;padding:0;">
<div id="__root"></div>
<script>(function(){
var root=document.getElementById('__root');
var _t=null;
function _h(){
if(_t)clearTimeout(_t);
_t=setTimeout(function(){
var h=document.body.scrollHeight;
if(h>0)parent.postMessage({type:'widget:resize',height:h},'*');
},60);
}
var _ro=new ResizeObserver(_h);
_ro.observe(document.body);

function finalizeHtml(html){
var tmp=document.createElement('div');
tmp.innerHTML=html;
var ss=tmp.querySelectorAll('script');
var scripts=[];
for(var i=0;i<ss.length;i++){
scripts.push({src:ss[i].src||'',text:ss[i].textContent||'',attrs:[]});
for(var j=0;j<ss[i].attributes.length;j++){
var a=ss[i].attributes[j];
if(a.name!=='src')scripts[scripts.length-1].attrs.push({name:a.name,value:a.value});
}
ss[i].remove();
}
root.innerHTML=tmp.innerHTML;
for(var i=0;i<scripts.length;i++){
var n=document.createElement('script');
if(scripts[i].src)n.src=scripts[i].src;
else if(scripts[i].text)n.textContent=scripts[i].text;
for(var j=0;j<scripts[i].attrs.length;j++)n.setAttribute(scripts[i].attrs[j].name,scripts[i].attrs[j].value);
root.appendChild(n);
}
_h();
}

window.addEventListener('message',function(e){
if(!e.data)return;
if(e.data.type==='widget:finalize'){
finalizeHtml(e.data.html);
setTimeout(_h,150);
}
});
parent.postMessage({type:'widget:ready'},'*');
})();</script>
</body>
</html>`;
}

interface ChatWidgetRendererProps {
  code: string;
  title?: string;
}

export function ChatWidgetRenderer({ code, title }: ChatWidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const handleMessage = useCallback((e: MessageEvent) => {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "widget:resize" && typeof e.data.height === "number") {
      setHeight(Math.min(e.data.height + 4, 800));
    }
    if (e.data.type === "widget:ready") {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "widget:finalize", html: sanitizeForIframe(code) },
        "*",
      );
    }
  }, [code]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div className="my-3 rounded-lg border border-zinc-700 overflow-hidden bg-zinc-900">
      {title && (
        <div className="bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 border-b border-zinc-700">
          {title}
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={buildReceiverSrcdoc()}
        sandbox="allow-scripts allow-popups"
        style={{ width: "100%", height: `${height}px`, border: "none" }}
        title={title ?? "Widget"}
      />
    </div>
  );
}
