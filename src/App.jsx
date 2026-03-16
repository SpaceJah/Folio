import { useState, useEffect, useRef, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, LineChart, Line, ReferenceLine, Legend
} from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0f1e", surface: "#0d1526", card: "#141d2e", card2: "#1a2540",
  border: "#1e2d45", accent: "#00d4ff", green: "#00e676", red: "#ff4757",
  yellow: "#ffd32a", text: "#e8f0fe", muted: "#6b7fa3", purple: "#7c3aed",
};
const PALETTE = ["#00d4ff","#00e676","#7c3aed","#f59e0b","#ec4899","#06b6d4","#84cc16","#f97316"];
const SECTORS = { AAPL:"Technology", MSFT:"Technology", JNJ:"Healthcare", PG:"Consumer Staples", BTC:"Crypto", ETH:"Crypto" };

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n, d=2) => n==null||isNaN(n) ? "—" : n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtUSD = n => n==null||isNaN(n) ? "—" : (n<0?"-$":"$")+fmt(Math.abs(n));
const fmtQty = (n, type) => {
  if (n==null||isNaN(n)) return "—";
  if (type==="crypto") return Math.abs(n)<0.001 ? n.toPrecision(4) : parseFloat(n.toFixed(4)).toString();
  return parseFloat(n.toFixed(4)).toString();
};
const computeFromTxs = txs => {
  let shares=0, cost=0;
  [...txs].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(tx=>{
    if(tx.txType==="buy"){cost+=tx.shares*tx.price;shares+=tx.shares;}
    else shares=Math.max(0,shares-tx.shares);
  });
  return {shares,avgCost:shares>0?cost/shares:0};
};

// ── Claude API price + data fetcher ──────────────────────────────────────
function extractJSON(text) {
  // Strip markdown code fences if present
  const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  // Try to find the outermost { } block by counting braces
  let start = stripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === "{") depth++;
    else if (stripped[i] === "}") { depth--; if (depth === 0) return stripped.slice(start, i + 1); }
  }
  return null;
}

async function fetchMarketData(tickers) {
  const list = tickers.map(t=>`${t.ticker}(${t.type})`).join(", ");
  const prompt = `Search the web and fetch current live market data for these assets: ${list}

Also fetch current values for these market indices: S&P 500, NASDAQ, DOW JONES, Bitcoin.

For each asset include: current price, day change %, 52-week high, 52-week low, market cap, volume, and for stocks also P/E ratio and beta.

Also find 3 recent news headlines relevant to these specific tickers.

You MUST respond with ONLY a raw JSON object. No markdown. No code fences. No explanation. Start your response with { and end with }. Use exactly this structure:
{"prices":{"AAPL":{"price":213.5,"change_pct":-0.42,"high_52w":260.10,"low_52w":164.08,"market_cap":"3.2T","pe_ratio":33.2,"volume":"52.3M","beta":1.24},"BTC":{"price":67420,"change_pct":1.23,"high_52w":109000,"low_52w":49000,"market_cap":"1.3T","volume":"28.4B"}},"indices":{"S&P 500":{"value":5280.5,"change_pct":0.31},"NASDAQ":{"value":18420.3,"change_pct":0.55},"DOW":{"value":39820.1,"change_pct":0.18},"Bitcoin":{"value":67420,"change_pct":1.23}},"news":[{"title":"Apple reports strong earnings","source":"Reuters","ticker":"AAPL","time":"2h ago"},{"title":"Fed holds rates steady","source":"Bloomberg","ticker":"ALL","time":"4h ago"},{"title":"Bitcoin rises on ETF inflows","source":"CoinDesk","ticker":"BTC","time":"1h ago"}]}`;

  // Use VITE_ANTHROPIC_API_KEY from .env for local/deployed use
  // Inside Claude.ai artifacts no key is needed (handled by the platform)
  const apiKey = typeof import.meta !== "undefined" ? import.meta.env?.VITE_ANTHROPIC_API_KEY : undefined;
  const reqHeaders = { "Content-Type": "application/json" };
  if (apiKey) {
    reqHeaders["x-api-key"] = apiKey;
    reqHeaders["anthropic-version"] = "2023-06-01";
    reqHeaders["anthropic-dangerous-direct-browser-iframes"] = "true";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: reqHeaders,
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API error");
  const text = data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
  const jsonStr = extractJSON(text);
  if (!jsonStr) throw new Error(`No JSON found. Response preview: ${text.slice(0, 120)}`);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON parse failed: ${e.message}. Preview: ${jsonStr.slice(0, 120)}`);
  }
}

// ── Seed data ─────────────────────────────────────────────────────────────
const SEED = [
  {id:1,ticker:"AAPL",type:"stock", transactions:[{id:101,txType:"buy",date:"2024-07-16",shares:2,price:235.00}]},
  {id:2,ticker:"JNJ", type:"stock", transactions:[{id:201,txType:"buy",date:"2024-07-16",shares:3,price:149.69}]},
  {id:3,ticker:"MSFT",type:"stock", transactions:[{id:301,txType:"buy",date:"2024-07-16",shares:1,price:453.96}]},
  {id:4,ticker:"PG",  type:"stock", transactions:[{id:401,txType:"buy",date:"2026-07-16",shares:3,price:164.68}]},
  {id:5,ticker:"BTC", type:"crypto",transactions:[
    {id:501,txType:"buy",date:"2026-01-15",shares:0.0000993,price:96504.48},
    {id:502,txType:"buy",date:"2026-02-04",shares:0.00002577,price:74505.24},
  ]},
  {id:6,ticker:"ETH", type:"crypto",transactions:[
    {id:601,txType:"buy",date:"2026-02-01",shares:0.00037304,price:2304.15},
    {id:602,txType:"buy",date:"2026-02-04",shares:0.00087131,price:2303.58},
  ]},
];
const INIT = SEED.map(h=>{const{shares,avgCost}=computeFromTxs(h.transactions);return{...h,shares,avgCost};});

// ── Subcomponents ─────────────────────────────────────────────────────────
function DotsMenu({onTx,onDelete}){
  const [open,setOpen]=useState(false); const ref=useRef();
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(
    <div ref={ref} style={{position:"relative"}}>
      <button className="btn btn-ghost btn-sm" style={{padding:"4px 9px",fontSize:15}} onClick={e=>{e.stopPropagation();setOpen(o=>!o)}}>···</button>
      {open&&<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#1a2540",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",zIndex:30,minWidth:168,boxShadow:"0 8px 28px rgba(0,0,0,.5)"}}>
        <div className="mitem" onClick={e=>{e.stopPropagation();setOpen(false);onTx()}}><span>＋</span>Log Transaction</div>
        <div className="mitem danger" onClick={e=>{e.stopPropagation();setOpen(false);onDelete()}}><span>✕</span>Remove Holding</div>
      </div>}
    </div>
  );
}

function IndexCard({name,val,chg}){
  const pos=chg>=0;
  return(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",minWidth:0}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{name}</div>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:17,color:C.text}}>{typeof val==="number"&&val>1000?fmt(val,0):fmt(val,2)}</div>
      <div style={{fontSize:12,color:pos?C.green:C.red,marginTop:2}}>{pos?"▲":"▼"} {fmt(Math.abs(chg))}%</div>
    </div>
  );
}

function StatRow({label,val,col}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
      <span style={{fontSize:12,color:C.muted}}>{label}</span>
      <span style={{fontSize:13,fontWeight:500,color:col||C.text}}>{val}</span>
    </div>
  );
}

function MiniBar({pct,color}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{width:48,height:5,borderRadius:3,background:"#1e2d45",overflow:"hidden"}}>
        <div style={{width:`${Math.min(100,Math.max(0,pct))}%`,height:"100%",background:color||C.accent,borderRadius:3}}/>
      </div>
      <span style={{fontSize:12}}>{fmt(pct)}%</span>
    </div>
  );
}

// Simulated portfolio value over time (based on cost basis + live gain)
function buildPortfolioHistory(enriched){
  const today = new Date(); const points=[];
  // Generate 30 days of simulated history ending at current value
  const totalNow = enriched.reduce((s,h)=>s+h.value,0);
  const totalCost = enriched.reduce((s,h)=>s+h.costBasis,0);
  for(let i=29;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    // Simulate a plausible path from cost to current
    const progress=(29-i)/29;
    const noise=(Math.sin(i*2.1)+Math.cos(i*1.3))*totalCost*0.012;
    const val=totalCost+(totalNow-totalCost)*Math.pow(progress,0.7)+noise;
    points.push({date:d.toLocaleDateString("en-US",{month:"short",day:"numeric"}),value:parseFloat(val.toFixed(2))});
  }
  return points;
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App(){
  const [holdings,setHoldings]=useState(INIT);
  const [mktData,setMktData]=useState({prices:{},indices:{},news:[]});
  const [tab,setTab]=useState("portfolio");
  const [modal,setModal]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  const [form,setForm]=useState({});
  const [txForm,setTxForm]=useState({txType:"buy",date:new Date().toISOString().slice(0,10),shares:"",price:"",holdingId:""});
  const [filter,setFilter]=useState("all");
  const [fetchState,setFetchState]=useState({status:"idle",error:null});
  const [lastRefresh,setLastRefresh]=useState(null);
  const [chartRange,setChartRange]=useState("1M");
  const fetchedRef=useRef(false);

  const fetchPrices=useCallback(async(list)=>{
    setFetchState({status:"fetching",error:null});
    try{
      const result=await fetchMarketData(list.map(h=>({ticker:h.ticker,type:h.type})));
      setMktData({
        prices:result.prices||{},
        indices:result.indices||{},
        news:result.news||[],
      });
      setLastRefresh(new Date());
      setFetchState({status:"done",error:null});
    }catch(e){
      setFetchState({status:"error",error:e.message});
    }
  },[]);

  useEffect(()=>{if(!fetchedRef.current){fetchedRef.current=true;fetchPrices(INIT);}},[]);

  const enriched=holdings.map(h=>{
    const pd=mktData.prices[h.ticker];
    const price=pd?.price??h.avgCost;
    const value=price*h.shares;
    const costBasis=h.avgCost*h.shares;
    const gain=value-costBasis;
    const gainPct=costBasis>0?(gain/costBasis)*100:0;
    return{...h,price,pd,value,costBasis,gain,gainPct,hasLive:!!pd?.price&&!pd?.error};
  });

  const totalVal=enriched.reduce((s,h)=>s+h.value,0);
  const totalCost=enriched.reduce((s,h)=>s+h.costBasis,0);
  const totalGain=totalVal-totalCost;
  const totalGainPct=totalCost>0?(totalGain/totalCost)*100:0;
  const stockVal=enriched.filter(h=>h.type==="stock").reduce((s,h)=>s+h.value,0);
  const cryptoVal=enriched.filter(h=>h.type==="crypto").reduce((s,h)=>s+h.value,0);
  const vis=filter==="all"?enriched:enriched.filter(h=>h.type===filter);
  const selected=enriched.find(h=>h.id===selectedId);
  const isFetching=fetchState.status==="fetching";
  const liveCount=enriched.filter(h=>h.hasLive).length;

  // Chart data
  const portfolioHistory=buildPortfolioHistory(enriched);
  const pieData=enriched.map((h,i)=>({name:h.ticker,value:h.value,pct:totalVal>0?(h.value/totalVal)*100:0}));
  const gainBarData=enriched.map(h=>({name:h.ticker,gain:parseFloat(h.gain.toFixed(2)),pct:parseFloat(h.gainPct.toFixed(2))}));

  // Sector breakdown
  const sectorMap={};
  enriched.forEach(h=>{
    const s=SECTORS[h.ticker]||"Other";
    sectorMap[s]=(sectorMap[s]||0)+h.value;
  });
  const sectorData=Object.entries(sectorMap).map(([name,value])=>({name,value,pct:totalVal>0?(value/totalVal)*100:0}));

  function addHolding(){
    if(!form.ticker||!form.type||!form.shares||!form.avgCost)return alert("Fill all fields.");
    const h={id:Date.now(),ticker:form.ticker.toUpperCase(),type:form.type,shares:parseFloat(form.shares),avgCost:parseFloat(form.avgCost),transactions:[]};
    setHoldings(p=>[...p,h]);fetchPrices([h]);setModal(null);setForm({});
  }
  function addTransaction(){
    const hid=selectedId||parseInt(txForm.holdingId);
    if(!hid||!txForm.shares||!txForm.price)return alert("Fill all fields.");
    const tx={id:Date.now(),txType:txForm.txType,date:txForm.date,shares:parseFloat(txForm.shares),price:parseFloat(txForm.price)};
    setHoldings(p=>p.map(h=>{
      if(h.id!==hid)return h;
      const txs=[...h.transactions,tx];
      const{shares,avgCost}=computeFromTxs(txs);
      return{...h,transactions:txs,shares,avgCost};
    }));
    setModal(null);
    setTxForm({txType:"buy",date:new Date().toISOString().slice(0,10),shares:"",price:"",holdingId:""});
  }
  function removeHolding(id){
    if(!window.confirm("Remove this holding?"))return;
    setHoldings(p=>p.filter(h=>h.id!==id));
    if(selectedId===id)setSelectedId(null);
  }

  const CustomTooltip=({active,payload,label})=>{
    if(!active||!payload?.length)return null;
    return <div style={{background:"#1a2540",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:12}}>
      <div style={{color:C.muted,marginBottom:4}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{color:p.value>=0?C.green:C.red,fontWeight:500}}>{p.name==="gain"?fmtUSD(p.value):p.name==="value"?fmtUSD(p.value):`${fmt(p.value)}%`}</div>)}
    </div>;
  };

  const gainIsPos=totalGain>=0;

  return(
    <div style={{fontFamily:"'DM Mono','Fira Code',monospace",background:C.bg,minHeight:"100vh",color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:2px}
        input,select{outline:none;background:#0d1526;border:1px solid #1e2d45;color:#e8f0fe;padding:10px 14px;border-radius:8px;font-family:inherit;font-size:14px;width:100%}
        input:focus,select:focus{border-color:#00d4ff}
        .btn{cursor:pointer;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:13px;font-weight:500;transition:all .2s}
        .btn-primary{background:#00d4ff;color:#0a0f1e}.btn-primary:hover{background:#33ddff;transform:translateY(-1px)}
        .btn-ghost{background:transparent;color:#6b7fa3;border:1px solid #1e2d45}.btn-ghost:hover{border-color:#00d4ff;color:#00d4ff}
        .btn-sm{padding:5px 10px;font-size:12px}
        .row{display:flex;gap:12px;align-items:center}
        .rb{display:flex;justify-content:space-between;align-items:center}
        .card{background:#141d2e;border:1px solid #1e2d45;border-radius:16px;padding:20px}
        .tag{display:inline-flex;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500}
        .tag-stock{background:#1a2a4a;color:#00d4ff;border:1px solid #003d5c}
        .tag-crypto{background:#1a2a1a;color:#00e676;border:1px solid #004422}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
        .modal{background:#111827;border:1px solid #1e2d45;border-radius:20px;padding:32px;width:100%;max-width:440px;max-height:90vh;overflow-y:auto}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;font-size:11px;color:#6b7fa3;text-transform:uppercase;letter-spacing:1px;padding:9px 12px;border-bottom:1px solid #1e2d45;white-space:nowrap}
        td{padding:11px 12px;border-bottom:1px solid #0d1526;font-size:13px}
        tr:last-child td{border-bottom:none}
        tr:hover td{background:#141d2e88}
        .nav-tab{cursor:pointer;padding:7px 16px;border-radius:8px;font-size:13px;color:#6b7fa3;transition:all .2s;border:1px solid transparent}
        .nav-tab.active{background:#141d2e;border-color:#1e2d45;color:#e8f0fe}
        .nav-tab:hover:not(.active){color:#e8f0fe}
        .fpill{cursor:pointer;padding:5px 14px;border-radius:20px;font-size:12px;border:1px solid #1e2d45;color:#6b7fa3;transition:all .2s;background:transparent}
        .fpill.active{border-color:#00d4ff;color:#00d4ff;background:#00d4ff11}
        .plb{display:inline-flex;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:500}
        .stat-box{background:#0d1526;border-radius:12px;padding:14px}
        .sidebar-item{cursor:pointer;padding:12px 14px;border-radius:12px;margin-bottom:6px;border:1px solid #1e2d45;background:#141d2e;transition:all .2s}
        .sidebar-item:hover{border-color:#2a3d5a}
        .sidebar-item.active{border-color:#00d4ff;background:#00d4ff08}
        .mitem{display:flex;align-items:center;gap:8px;padding:10px 16px;font-size:13px;cursor:pointer;color:#e8f0fe;transition:background .15s}
        .mitem:hover{background:#243050}
        .mitem.danger{color:#ff4757}.mitem.danger:hover{background:#ff475718}
        .news-item{padding:14px 0;border-bottom:1px solid #1e2d45;cursor:pointer}
        .news-item:last-child{border-bottom:none}
        .news-item:hover .news-title{color:#00d4ff}
        .news-title{font-size:13px;font-weight:500;color:#e8f0fe;margin-bottom:5px;transition:color .2s;line-height:1.4}
        .range-btn{cursor:pointer;padding:4px 10px;border-radius:6px;font-size:11px;border:1px solid #1e2d45;color:#6b7fa3;background:transparent;transition:all .2s}
        .range-btn.active{border-color:#00d4ff;color:#00d4ff;background:#00d4ff11}
        .w52-bar{height:6px;border-radius:3px;background:#1e2d45;position:relative;overflow:hidden}
        .legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        @keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fi{animation:fi .25s ease}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .pulse{animation:pulse 1.4s ease infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{display:inline-block;animation:spin .9s linear infinite}
        .progress-bar{height:2px;background:#1e2d45;border-radius:2px;overflow:hidden}
        .progress-fill{height:100%;background:linear-gradient(90deg,#00d4ff,#00e676);border-radius:2px}
      `}</style>

      {/* ── Top Nav ── */}
      <div style={{borderBottom:`1px solid ${C.border}`,padding:"0 24px",position:"sticky",top:0,zIndex:50,background:"#0a0f1ef2",backdropFilter:"blur(16px)"}}>
        <div style={{maxWidth:1340,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",height:58}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:19,letterSpacing:"-0.5px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.accent}}>◈</span> FOLIO
          </div>
          <div className="row" style={{gap:4}}>
            {[["portfolio","Portfolio"],["holdings","Holdings"],["transactions","Transactions"]].map(([t,l])=>(
              <div key={t} className={`nav-tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{l}</div>
            ))}
          </div>
          <div className="row" style={{gap:8}}>
            {isFetching?(
              <span style={{fontSize:12,color:C.muted,display:"flex",gap:6,alignItems:"center"}}><span className="spin">↻</span>Fetching…</span>
            ):lastRefresh?(
              <span style={{fontSize:12,color:liveCount===enriched.length?C.green:liveCount>0?C.yellow:C.red}}>
                {liveCount}/{enriched.length} live · {lastRefresh.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
              </span>
            ):null}
            <button className="btn btn-ghost" style={{padding:"6px 12px",fontSize:12}} disabled={isFetching} onClick={()=>fetchPrices(holdings)}>{isFetching?"…":"↻ Refresh"}</button>
            <button className="btn btn-primary" style={{padding:"7px 16px"}} onClick={()=>setModal("add-holding")}>+ Add</button>
          </div>
        </div>
        {isFetching&&<div style={{maxWidth:1340,margin:"0 auto",paddingBottom:6}}><div className="progress-bar"><div className="progress-fill pulse" style={{width:"55%"}}/></div></div>}
      </div>

      {fetchState.status==="error"&&<div style={{background:"#ff475718",borderBottom:"1px solid #ff475733",padding:"8px 24px",fontSize:12,color:C.red}}>⚠ {fetchState.error}</div>}

      <div style={{maxWidth:1340,margin:"0 auto",padding:"24px"}}>

        {/* ══════════ PORTFOLIO TAB ══════════ */}
        {tab==="portfolio"&&(
          <div className="fi">

            {/* Market indices bar */}
            {Object.keys(mktData.indices).length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                {Object.entries(mktData.indices).map(([name,d],i)=>(
                  <IndexCard key={i} name={name} val={d.value} chg={d.change_pct??0}/>
                ))}
              </div>
            )}

            {/* Main two-column layout */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20,marginBottom:20}}>

              {/* Left: portfolio value + holdings table */}
              <div style={{display:"flex",flexDirection:"column",gap:20}}>

                {/* Portfolio value card */}
                <div className="card">
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Portfolio Value</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:14,flexWrap:"wrap"}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:36,color:C.text,lineHeight:1}}>{fmtUSD(totalVal)}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:16,fontWeight:600,color:gainIsPos?C.green:C.red}}>{gainIsPos?"+":""}{fmtUSD(totalGain)}</span>
                        <span className="plb" style={{background:gainIsPos?"#00e67618":"#ff475718",color:gainIsPos?C.green:C.red,fontSize:13}}>{gainIsPos?"▲":"▼"}{fmt(Math.abs(totalGainPct))}%</span>
                        <span style={{fontSize:12,color:C.muted}}>all-time unrealized</span>
                      </div>
                    </div>
                  </div>

                  {/* Range selector */}
                  <div style={{display:"flex",gap:6,marginBottom:12}}>
                    {["1W","1M","3M","YTD","1Y","ALL"].map(r=>(
                      <button key={r} className={`range-btn ${chartRange===r?"active":""}`} onClick={()=>setChartRange(r)}>{r}</button>
                    ))}
                  </div>

                  {/* Portfolio area chart */}
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={portfolioHistory} margin={{top:4,right:4,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={gainIsPos?C.green:C.red} stopOpacity={0.25}/>
                          <stop offset="95%" stopColor={gainIsPos?C.green:C.red} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4566" vertical={false}/>
                      <XAxis dataKey="date" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} interval={4}/>
                      <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+fmt(v,0)} width={64}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Area type="monotone" dataKey="value" stroke={gainIsPos?C.green:C.red} strokeWidth={2} fill="url(#vGrad)"/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Holdings table */}
                <div className="card">
                  <div className="rb" style={{marginBottom:16}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15}}>Holdings</div>
                    <div className="row" style={{gap:6}}>
                      {["all","stock","crypto"].map(f=>(
                        <button key={f} className={`fpill ${filter===f?"active":""}`} onClick={()=>setFilter(f)}>
                          {f==="all"?"All":f==="stock"?"Stocks":"Crypto"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr><th>Asset</th><th>Price</th><th>Day</th><th>Qty</th><th>Buy Price</th><th>% Portfolio</th><th>Unrealized Gain ($)</th><th>Unrealized Gain (%)</th><th></th></tr>
                    </thead>
                    <tbody>
                      {vis.map(h=>{
                        const pd=h.pd;
                        const pos=h.gain>=0;
                        return(
                          <tr key={h.id} style={{cursor:"pointer"}} onClick={()=>{setSelectedId(h.id===selectedId?null:h.id);setTab("holdings")}}>
                            <td>
                              <div className="row" style={{gap:9}}>
                                <div style={{width:32,height:32,borderRadius:8,background:h.type==="crypto"?"#00e67618":"#00d4ff18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:h.type==="crypto"?C.green:C.accent,flexShrink:0}}>{h.ticker.slice(0,4)}</div>
                                <div><div style={{fontWeight:500,fontSize:13}}>{h.ticker}</div><span className={`tag tag-${h.type}`}>{h.type}</span></div>
                              </div>
                            </td>
                            <td>{pd?.loading?<span className="pulse" style={{color:C.muted,fontSize:11}}>…</span>:pd?.error?<span style={{color:C.yellow,fontSize:11}}>⚠</span>:<span style={{fontWeight:500}}>${fmt(h.price,h.price>100?2:4)}</span>}</td>
                            <td>{pd?.changePct!=null&&!pd?.loading?<span style={{fontSize:11,padding:"2px 6px",borderRadius:4,background:pd.changePct>=0?"#00e67618":"#ff475718",color:pd.changePct>=0?C.green:C.red}}>{pd.changePct>=0?"▲":"▼"}{fmt(Math.abs(pd.changePct))}%</span>:<span style={{color:C.muted}}>—</span>}</td>
                            <td style={{color:C.muted,fontVariantNumeric:"tabular-nums"}}>{fmtQty(h.shares,h.type)}</td>
                            <td>${fmt(h.avgCost,h.avgCost>100?2:4)}</td>
                            <td><MiniBar pct={totalVal>0?h.value/totalVal*100:0} color={h.type==="crypto"?C.green:C.accent}/></td>
                            <td><span className="plb" style={{background:pos?"#00e67618":"#ff475718",color:pos?C.green:C.red}}>{pos?"+":""}{fmtUSD(h.gain)}</span></td>
                            <td style={{color:pos?C.green:C.red,fontWeight:500}}>{pos?"▲":"▼"}{fmt(Math.abs(h.gainPct))}%</td>
                            <td onClick={e=>e.stopPropagation()}><DotsMenu onTx={()=>{setSelectedId(h.id);setModal("add-tx")}} onDelete={()=>removeHolding(h.id)}/></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom charts row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  {/* Gain bar */}
                  <div className="card">
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:14}}>Unrealized Gain / Loss</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={gainBarData} barSize={26}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false}/>
                        <XAxis dataKey="name" tick={{fill:C.muted,fontSize:11}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>(v>=0?"$":"-$")+fmt(Math.abs(v),0)} width={56}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <ReferenceLine y={0} stroke={C.border}/>
                        <Bar dataKey="gain" name="gain" radius={[4,4,0,0]}>
                          {gainBarData.map((d,i)=><Cell key={i} fill={d.gain>=0?C.green:C.red} opacity={0.85}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Return % horizontal bars */}
                  <div className="card">
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:14}}>Return % by Asset</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={gainBarData} layout="vertical" barSize={18}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" horizontal={false}/>
                        <XAxis type="number" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${v>0?"+":""}${fmt(v)}%`}/>
                        <YAxis type="category" dataKey="name" tick={{fill:C.text,fontSize:11}} axisLine={false} tickLine={false} width={36}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <ReferenceLine x={0} stroke={C.border}/>
                        <Bar dataKey="pct" name="pct" radius={[0,4,4,0]}>
                          {gainBarData.map((d,i)=><Cell key={i} fill={d.pct>=0?C.green:C.red} opacity={0.85}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Right sidebar */}
              <div style={{display:"flex",flexDirection:"column",gap:16}}>

                {/* Summary stats */}
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:12}}>Portfolio Highlights</div>
                  <StatRow label="Total Value" val={fmtUSD(totalVal)}/>
                  <StatRow label="Unrealized Gain/Loss" val={`${totalGain>=0?"+":""}${fmtUSD(totalGain)}`} col={gainIsPos?C.green:C.red}/>
                  <StatRow label="All-time Return" val={`${totalGainPct>=0?"+":""}${fmt(totalGainPct)}%`} col={gainIsPos?C.green:C.red}/>
                  <StatRow label="Stocks" val={fmtUSD(stockVal)}/>
                  <StatRow label="Crypto" val={fmtUSD(cryptoVal)}/>
                  <StatRow label="# Holdings" val={enriched.length}/>
                  <div style={{paddingTop:4}}/>
                </div>

                {/* Allocation donut */}
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:4}}>Allocation</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={78} dataKey="value" paddingAngle={2}>
                        {pieData.map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]} stroke="none"/>)}
                      </Pie>
                      <Tooltip formatter={(v,n,p)=>[fmtUSD(v),p.payload.name]}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px"}}>
                    {pieData.map((d,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
                        <div className="legend-dot" style={{background:PALETTE[i%PALETTE.length]}}/>
                        <span style={{color:C.muted}}>{d.name}</span>
                        <span style={{color:C.text,fontWeight:500}}>{fmt(d.pct)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sector breakdown */}
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:14}}>Sector Breakdown</div>
                  {sectorData.map((s,i)=>(
                    <div key={i} style={{marginBottom:12}}>
                      <div className="rb" style={{marginBottom:4}}>
                        <span style={{fontSize:12,color:C.text}}>{s.name}</span>
                        <span style={{fontSize:12,color:C.muted}}>{fmt(s.pct)}%</span>
                      </div>
                      <div style={{height:6,borderRadius:3,background:"#1e2d45",overflow:"hidden"}}>
                        <div style={{width:`${s.pct}%`,height:"100%",background:PALETTE[i%PALETTE.length],borderRadius:3,transition:"width .5s"}}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* News feed */}
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:12}}>Market News</div>
                  {mktData.news.length===0?(
                    <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:"16px 0"}}>{isFetching?"Fetching news…":"No news loaded yet"}</div>
                  ):mktData.news.map((n,i)=>(
                    <div key={i} className="news-item">
                      <div className="news-title">{n.title}</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        {n.ticker&&n.ticker!=="ALL"&&<span className={`tag tag-${enriched.find(h=>h.ticker===n.ticker)?.type||"stock"}`}>{n.ticker}</span>}
                        <span style={{fontSize:11,color:C.muted}}>{n.source}</span>
                        <span style={{fontSize:11,color:C.muted}}>· {n.time}</span>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ══════════ HOLDINGS DETAIL TAB ══════════ */}
        {tab==="holdings"&&(
          <div className="fi" style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:18}}>
            {/* Sidebar */}
            <div>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>Holdings</div>
              {enriched.map(h=>(
                <div key={h.id} className={`sidebar-item ${selectedId===h.id?"active":""}`} onClick={()=>setSelectedId(h.id===selectedId?null:h.id)}>
                  <div className="rb">
                    <div className="row" style={{gap:8}}>
                      <div style={{width:30,height:30,borderRadius:7,background:h.type==="crypto"?"#00e67618":"#00d4ff18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:h.type==="crypto"?C.green:C.accent,flexShrink:0}}>{h.ticker.slice(0,4)}</div>
                      <div><div style={{fontWeight:500,fontSize:13}}>{h.ticker}</div><div style={{fontSize:11,color:C.muted}}>{fmtQty(h.shares,h.type)}</div></div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:13,fontWeight:500}}>{h.pd?.loading?<span className="pulse" style={{color:C.muted,fontSize:11}}>…</span>:fmtUSD(h.value)}</div>
                      <div style={{fontSize:11,color:h.gain>=0?C.green:C.red}}>{h.gain>=0?"+":""}{fmt(h.gainPct)}%</div>
                    </div>
                  </div>
                </div>
              ))}
              <button className="btn btn-primary" style={{width:"100%",marginTop:10}} onClick={()=>setModal("add-holding")}>+ Add Holding</button>
            </div>

            {/* Detail panel */}
            {selected?(
              <div className="fi">
                {/* Header */}
                <div className="card" style={{marginBottom:14}}>
                  <div className="rb" style={{marginBottom:18}}>
                    <div>
                      <div className="row" style={{gap:10,marginBottom:6}}>
                        <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28}}>{selected.ticker}</span>
                        <span className={`tag tag-${selected.type}`}>{selected.type}</span>
                        <span style={{fontSize:12,color:C.muted,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4}}>{SECTORS[selected.ticker]||"—"}</span>
                        {selected.pd?.changePct!=null&&!selected.pd?.loading&&(
                          <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,padding:"2px 8px",borderRadius:4,background:selected.pd.changePct>=0?"#00e67618":"#ff475718",color:selected.pd.changePct>=0?C.green:C.red}}>
                            {selected.pd.changePct>=0?"▲":"▼"}{fmt(Math.abs(selected.pd.changePct))}% today
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:26,fontWeight:600,color:C.text,marginBottom:2}}>
                        {selected.pd?.loading?<span className="pulse" style={{fontSize:14}}>fetching…</span>:selected.hasLive?`$${fmt(selected.price,selected.price>100?2:4)}`:<span style={{color:C.yellow,fontSize:14}}>price unavailable</span>}
                      </div>
                    </div>
                    <div className="row" style={{gap:8}}>
                      <button className="btn btn-ghost" style={{padding:"7px 14px",fontSize:12}} onClick={()=>setModal("add-tx")}>+ Log Transaction</button>
                      <button className="btn" style={{padding:"7px 14px",fontSize:12,background:"transparent",color:C.red,border:`1px solid ${C.red}`}} onClick={()=>removeHolding(selected.id)}>Remove</button>
                    </div>
                  </div>

                  {/* My position stats */}
                  <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>My Position</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                    {[
                      {label:"Market Value",     val:fmtUSD(selected.value),col:null},
                      {label:"Purchase Price",   val:fmtUSD(selected.costBasis),col:null},
                      {label:"Avg Buy Price",    val:`$${fmt(selected.avgCost,selected.avgCost>100?2:6)}`,col:null},
                      {label:"Quantity",         val:fmtQty(selected.shares,selected.type),col:null},
                      {label:"Unrealized Gain/Loss",val:fmtUSD(selected.gain),col:selected.gain>=0?C.green:C.red},
                      {label:"Total Return",     val:`${selected.gainPct>=0?"+":""}${fmt(selected.gainPct)}%`,col:selected.gainPct>=0?C.green:C.red},
                    ].map((s,i)=>(
                      <div key={i} className="stat-box">
                        <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:5}}>{s.label}</div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:17,color:s.col||C.text}}>{s.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Market stats from API */}
                  {selected.pd&&!selected.pd.error&&(
                    <>
                      <div style={{fontSize:12,color:C.muted,textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}}>Market Data</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                        {[
                          {label:"Market Cap",    val:selected.pd.market_cap||"—"},
                          {label:"Volume",        val:selected.pd.volume||"—"},
                          ...(selected.type==="stock"?[
                            {label:"P/E Ratio",   val:selected.pd.pe_ratio?fmt(selected.pd.pe_ratio):"—"},
                            {label:"Beta",        val:selected.pd.beta?fmt(selected.pd.beta):"—"},
                          ]:[]),
                          {label:"52W High",      val:selected.pd.high_52w?`$${fmt(selected.pd.high_52w,selected.pd.high_52w>100?2:4)}`:"—"},
                          {label:"52W Low",       val:selected.pd.low_52w?`$${fmt(selected.pd.low_52w,selected.pd.low_52w>100?2:4)}`:"—"},
                        ].map((s,i)=>(
                          <div key={i} style={{padding:"9px 0",borderBottom:`1px solid ${C.border}`,paddingRight:16}}>
                            <span style={{fontSize:11,color:C.muted}}>{s.label}</span>
                            <span style={{fontSize:13,fontWeight:500,float:"right",color:C.text}}>{s.val}</span>
                          </div>
                        ))}
                      </div>

                      {/* 52W range bar */}
                      {selected.pd.high_52w&&selected.pd.low_52w&&(
                        <div style={{marginTop:16}}>
                          <div className="rb" style={{marginBottom:6}}>
                            <span style={{fontSize:11,color:C.muted}}>52-Week Low: ${fmt(selected.pd.low_52w,2)}</span>
                            <span style={{fontSize:11,color:C.muted}}>52-Week High: ${fmt(selected.pd.high_52w,2)}</span>
                          </div>
                          <div className="w52-bar">
                            <div style={{
                              position:"absolute",left:0,top:0,height:"100%",borderRadius:3,
                              background:`linear-gradient(90deg,${C.accent},${C.green})`,
                              width:`${Math.min(100,Math.max(0,((selected.price-selected.pd.low_52w)/(selected.pd.high_52w-selected.pd.low_52w))*100))}%`
                            }}/>
                          </div>
                          <div style={{textAlign:"center",fontSize:11,color:C.accent,marginTop:4}}>
                            Current: ${fmt(selected.price,2)} ({fmt(((selected.price-selected.pd.low_52w)/(selected.pd.high_52w-selected.pd.low_52w))*100,0)}% of 52W range)
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Transaction history */}
                <div className="card">
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:12}}>Transaction History</div>
                  {selected.transactions.length===0?(
                    <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"28px 0"}}>No transactions yet.</div>
                  ):(
                    <table>
                      <thead><tr><th>Date</th><th>Type</th><th>Quantity</th><th>Price Paid</th><th>Total Cost</th></tr></thead>
                      <tbody>
                        {selected.transactions.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(tx=>(
                          <tr key={tx.id}>
                            <td style={{color:C.muted}}>{tx.date}</td>
                            <td><span className="plb" style={{background:tx.txType==="buy"?"#00e67618":"#ff475718",color:tx.txType==="buy"?C.green:C.red}}>{tx.txType.toUpperCase()}</span></td>
                            <td style={{fontVariantNumeric:"tabular-nums"}}>{fmtQty(tx.shares,selected.type)}</td>
                            <td>${fmt(tx.price,tx.price>100?2:6)}</td>
                            <td style={{fontWeight:500}}>{fmtUSD(tx.shares*tx.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300,color:C.muted,fontSize:13,borderRadius:14,border:`1px dashed ${C.border}`}}>← Select a holding to view details</div>
            )}
          </div>
        )}

        {/* ══════════ TRANSACTIONS TAB ══════════ */}
        {tab==="transactions"&&(
          <div className="fi">
            <div className="card">
              <div className="rb" style={{marginBottom:16}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15}}>All Transactions</div>
                <div style={{fontSize:12,color:C.muted}}>{enriched.reduce((s,h)=>s+h.transactions.length,0)} total</div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Ticker</th><th>Type</th><th>Class</th><th>Quantity</th><th>Price Paid</th><th>Total Value</th></tr></thead>
                <tbody>
                  {enriched.flatMap(h=>h.transactions.map(tx=>({...tx,ticker:h.ticker,assetType:h.type})))
                    .sort((a,b)=>new Date(b.date)-new Date(a.date))
                    .map(tx=>(
                      <tr key={tx.id}>
                        <td style={{color:C.muted}}>{tx.date}</td>
                        <td style={{fontWeight:500}}>{tx.ticker}</td>
                        <td><span className="plb" style={{background:tx.txType==="buy"?"#00e67618":"#ff475718",color:tx.txType==="buy"?C.green:C.red}}>{tx.txType.toUpperCase()}</span></td>
                        <td><span className={`tag tag-${tx.assetType}`}>{tx.assetType}</span></td>
                        <td style={{fontVariantNumeric:"tabular-nums"}}>{fmtQty(tx.shares,tx.assetType)}</td>
                        <td>${fmt(tx.price,tx.price>100?2:6)}</td>
                        <td style={{fontWeight:500}}>{fmtUSD(tx.shares*tx.price)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: Add Holding ── */}
      {modal==="add-holding"&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal fi" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,marginBottom:22}}>Add New Holding</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[{label:"Ticker Symbol",key:"ticker",placeholder:"e.g. AAPL, BTC",type:"text"},{label:"Shares / Coins",key:"shares",placeholder:"0.00",type:"number"},{label:"Avg Buy Price Per Unit ($)",key:"avgCost",placeholder:"0.00",type:"number"}].map(f=>(
                <div key={f.key}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>{f.label}</div>
                  <input type={f.type} placeholder={f.placeholder} value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:f.key==="ticker"?e.target.value.toUpperCase():e.target.value}))}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>Asset Type</div>
                <select value={form.type||""} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                  <option value="">Select type…</option>
                  <option value="stock">Stock / ETF</option>
                  <option value="crypto">Crypto</option>
                </select>
              </div>
              <div className="row" style={{marginTop:8}}>
                <button className="btn btn-primary" style={{flex:1}} onClick={addHolding}>Add Holding</button>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{setModal(null);setForm({})}}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Log Transaction ── */}
      {modal==="add-tx"&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal fi" onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,marginBottom:6}}>Log Transaction</div>
            {selected&&<div style={{color:C.muted,fontSize:13,marginBottom:20}}>for {selected.ticker}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {!selected&&(
                <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>Holding</div>
                  <select value={txForm.holdingId} onChange={e=>setTxForm(f=>({...f,holdingId:e.target.value}))}>
                    <option value="">Select holding…</option>
                    {enriched.map(h=><option key={h.id} value={h.id}>{h.ticker} ({h.type})</option>)}
                  </select>
                </div>
              )}
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>Type</div>
                <div className="row" style={{gap:8}}>
                  {["buy","sell"].map(t=>(
                    <button key={t} className="btn" style={{flex:1,background:txForm.txType===t?(t==="buy"?"#00e67628":"#ff475728"):"#0d1526",color:txForm.txType===t?(t==="buy"?C.green:C.red):C.muted,border:`1px solid ${txForm.txType===t?(t==="buy"?C.green:C.red):C.border}`}} onClick={()=>setTxForm(f=>({...f,txType:t}))}>
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>Date</div>
                <input type="date" value={txForm.date} onChange={e=>setTxForm(f=>({...f,date:e.target.value}))}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>Quantity</div>
                <input type="number" step="any" placeholder="0.00" value={txForm.shares} onChange={e=>setTxForm(f=>({...f,shares:e.target.value}))}/>
              </div>
              <div>
                <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"1px"}}>Price Per Unit ($)</div>
                <input type="number" step="any" placeholder="0.00" value={txForm.price} onChange={e=>setTxForm(f=>({...f,price:e.target.value}))}/>
              </div>
              {txForm.shares&&txForm.price&&(
                <div style={{background:"#0d1526",borderRadius:10,padding:"10px 14px",fontSize:13,color:C.muted}}>
                  Total: <span style={{color:C.text,fontWeight:500}}>{fmtUSD(parseFloat(txForm.shares)*parseFloat(txForm.price))}</span>
                </div>
              )}
              <div className="row" style={{marginTop:8}}>
                <button className="btn btn-primary" style={{flex:1}} onClick={addTransaction}>Log Transaction</button>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
