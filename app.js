'use strict';
// Port of the original Python Canny + contour detector. No Hough transform.
const CFG={width:1280,height:720,fps:30,cannyLow:50,cannyHigh:150,minArea:1500,circleCircularity:0.80,circleVertices:7,polygonEpsilon:0.02,trackDistance:80,maxMissing:10};
const el=id=>document.getElementById(id);
const video=el('video'),out=el('output'),edgeCanvas=el('edges');
const ctx=out.getContext('2d',{willReadFrequently:true}),edgeCtx=edgeCanvas.getContext('2d');
let stream=null, running=false, raf=0, cvReady=false, busy=false, nextId=1, tracks=new Map(), installPrompt=null;
const setStatus=s=>{el('status').textContent=s;};
function readyCheck(){if(window.cv && typeof cv.Mat==='function' && typeof cv.Canny==='function'){cvReady=true;el('start').disabled=false;setStatus('Ready · choose a camera');return true;}return false;}
const cvTimer=setInterval(()=>{if(readyCheck())clearInterval(cvTimer);},250);
setTimeout(()=>{if(!cvReady)setStatus('OpenCV loading; check network / files');},12000);
async function listCameras(){
  if(!navigator.mediaDevices?.enumerateDevices){setStatus('Camera API unavailable: use HTTPS or localhost');return;}
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();const cameras=devices.filter(d=>d.kind==='videoinput');
    const current=el('cameras').value;el('cameras').replaceChildren();
    cameras.forEach((cam,i)=>{const o=document.createElement('option');o.value=cam.deviceId;o.textContent=cam.label||`Camera ${i+1}`;el('cameras').appendChild(o);});
    if(!cameras.length){const o=document.createElement('option');o.value='';o.textContent='Default camera';el('cameras').appendChild(o);}
    if([...el('cameras').options].some(o=>o.value===current))el('cameras').value=current;
  }catch(e){setStatus(`Camera list error: ${e.message}`);}
}
async function startCamera(){
  if(!cvReady)return;
  stopCamera();
  try{
    const deviceId=el('cameras').value;
    const constraints={audio:false,video:{width:{ideal:CFG.width},height:{ideal:CFG.height},frameRate:{ideal:CFG.fps},...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}})}};
    stream=await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject=stream;await video.play();
    out.width=edgeCanvas.width=video.videoWidth||CFG.width;
    out.height=edgeCanvas.height=video.videoHeight||CFG.height;
    tracks.clear();nextId=1;running=true;el('stop').disabled=false;el('start').disabled=true;
    await listCameras();setStatus(`Running · ${out.width}×${out.height}`);raf=requestAnimationFrame(processFrame);
  }catch(e){setStatus(`Camera error: ${e.message}`);stopCamera(false);}
}
function stopCamera(updateStatus=true){running=false;cancelAnimationFrame(raf);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}video.srcObject=null;el('stop').disabled=true;el('start').disabled=!cvReady;if(updateStatus)setStatus('Stopped');}
function rightAngleQuad(approx){
  if(approx.rows!==4 || !cv.isContourConvex(approx))return null;
  const pts=[];for(let i=0;i<4;i++)pts.push([approx.data32S[i*2],approx.data32S[i*2+1]]);
  const lengths=[];
  for(let i=0;i<4;i++){
    const p=pts[i],a=pts[(i+3)%4],b=pts[(i+1)%4];
    const ax=a[0]-p[0],ay=a[1]-p[1],bx=b[0]-p[0],by=b[1]-p[1];
    const la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);if(!la||!lb||Math.abs((ax*bx+ay*by)/(la*lb))>0.20)return null;
    lengths.push(lb);
  }
  return Math.max(...lengths)/Math.min(...lengths)<1.15?'Square':'Rectangle';
}
function classify(contour){
  const area=cv.contourArea(contour);if(area<CFG.minArea)return null;
  const perimeter=cv.arcLength(contour,true);if(perimeter<=0)return null;
  const approx=new cv.Mat();
  try{
    cv.approxPolyDP(contour,approx,CFG.polygonEpsilon*perimeter,true);
    const quad=rightAngleQuad(approx);if(quad)return quad;
    if(approx.rows>=CFG.circleVertices && 4*Math.PI*area/(perimeter*perimeter)>CFG.circleCircularity)return 'Circle';
    return null;
  }finally{approx.delete();}
}
function extractDetections(source){
  const gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),kernel=cv.Mat.ones(3,3,cv.CV_8U),contours=new cv.MatVector(),hierarchy=new cv.Mat();
  const detections=[];
  try{
    cv.cvtColor(source,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),1.4,1.4,cv.BORDER_DEFAULT);
    cv.Canny(blur,edges,CFG.cannyLow,CFG.cannyHigh,3,true);
    cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,kernel);
    cv.findContours(edges,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){
      const c=contours.get(i);
      try{
        const shape=classify(c);if(!shape)continue;
        const r=cv.boundingRect(c),points=[];
        for(let j=0;j<c.rows;j++)points.push([c.data32S[j*2],c.data32S[j*2+1]]);
        detections.push({shape,center:[r.x+r.width/2,r.y+r.height/2],points});
      }finally{c.delete();}
    }
    cv.imshow(edgeCanvas,edges);
    return detections;
  }finally{gray.delete();blur.delete();edges.delete();kernel.delete();contours.delete();hierarchy.delete();}
}
function track(detections){
  for(const t of tracks.values())t.missing++;
  const matched=new Set();
  for(const d of detections){
    let best=null,dist=CFG.trackDistance;
    for(const [id,t] of tracks){
      if(matched.has(id))continue;
      const a=t.shape==='Square'||t.shape==='Rectangle'?'Box':t.shape;
      const b=d.shape==='Square'||d.shape==='Rectangle'?'Box':d.shape;
      if(a!==b)continue;
      const dd=Math.hypot(d.center[0]-t.center[0],d.center[1]-t.center[1]);
      if(dd<dist){best=id;dist=dd;}
    }
    if(best===null)best=nextId++;
    tracks.set(best,{...d,missing:0});matched.add(best);
  }
  for(const [id,t] of tracks)if(t.missing>CFG.maxMissing)tracks.delete(id);
  return [...tracks.values()].filter(t=>t.missing===0);
}
function drawResults(detections){
  let circle=false,square=false;
  ctx.lineWidth=3;ctx.strokeStyle='#ff0000';ctx.lineJoin='round';
  for(const d of detections){
    if(d.points.length<2)continue;
    ctx.beginPath();ctx.moveTo(...d.points[0]);for(let i=1;i<d.points.length;i++)ctx.lineTo(...d.points[i]);ctx.closePath();ctx.stroke();
    if(d.shape==='Circle')circle=true;else square=true;
  }
  const labels=[];if(circle)labels.push('Circle Found');if(square)labels.push('Square Found');
  ctx.fillStyle='#ff0000';ctx.font='bold 36px Arial, sans-serif';ctx.textAlign='right';ctx.textBaseline='top';
  labels.forEach((label,i)=>ctx.fillText(label,out.width-24,18+i*48));
}
function processFrame(){
  if(!running||busy)return;
  busy=true;
  try{
    if(video.readyState>=2){
      ctx.drawImage(video,0,0,out.width,out.height);
      const frame=cv.imread(out);
      try{drawResults(track(extractDetections(frame)));}finally{frame.delete();}
    }
  }catch(e){setStatus(`Processing error: ${e.message}`);stopCamera(false);return;}
  finally{busy=false;}
  if(running)raf=requestAnimationFrame(processFrame);
}
el('start').addEventListener('click',startCamera);el('stop').addEventListener('click',()=>stopCamera());el('refresh').addEventListener('click',listCameras);
el('cameras').addEventListener('change',()=>{if(running)startCamera();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;el('install').hidden=false;});
el('install').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;el('install').hidden=true;});
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
listCameras();
