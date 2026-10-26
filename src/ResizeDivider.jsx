import React,{useEffect,useRef,useState} from 'react';

export function ResizeDivider({ratio,onResize}){
  const ref=useRef(null),drag=useRef(null);
  const [width,setWidth]=useState(1000),[resizing,setResizing]=useState(false);
  const minimum=Math.min(.45,280/Math.max(1,width-7));
  const clamp=value=>Math.max(minimum,Math.min(1-minimum,value));
  useEffect(()=>{
    const parent=ref.current.parentElement;
    const observer=new ResizeObserver(()=>setWidth(parent.getBoundingClientRect().width));
    observer.observe(parent);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!resizing)return;
    const previous=document.body.style.userSelect,cursor=document.body.style.cursor;
    document.body.style.userSelect='none';document.body.style.cursor='col-resize';
    return()=>{document.body.style.userSelect=previous;document.body.style.cursor=cursor;};
  },[resizing]);
  const move=event=>{
    if(drag.current!==event.pointerId)return;
    const rect=ref.current.parentElement.getBoundingClientRect();
    onResize(clamp((event.clientX-rect.left-3.5)/(rect.width-7)));
  };
  return <div ref={ref} className={'split-divider'+(resizing?' resizing':'')} role="separator" tabIndex={0} aria-label="调整主会话和右侧面板宽度" aria-orientation="vertical" aria-controls="project-main project-overview" aria-valuemin={Math.round(minimum*100)} aria-valuemax={Math.round((1-minimum)*100)} aria-valuenow={Math.round(clamp(ratio)*100)}
    onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();drag.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);setResizing(true);}}
    onPointerMove={move}
    onPointerUp={event=>{move(event);drag.current=null;setResizing(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onPointerCancel={()=>{drag.current=null;setResizing(false);}}
    onLostPointerCapture={()=>{drag.current=null;setResizing(false);}}
    onDoubleClick={()=>onResize(.55)}
    onKeyDown={event=>{const values={ArrowLeft:ratio-.02,ArrowRight:ratio+.02,Home:minimum,End:1-minimum};if(event.key in values){event.preventDefault();onResize(clamp(values[event.key]));}}}
  />;
}
