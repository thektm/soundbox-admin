import { useState } from 'react'
import { CheckCheck, ExternalLink, Eye, MessageSquareText, Save, ShieldAlert } from 'lucide-react'
import { Card, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { DataTable } from '../components/DataTable'
import { ProductSelect } from '../components/ProductSelect'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString } from '../lib/api'
import { dateTimeFa, numberFa } from '../lib/format'
import { useDebouncedValue } from '../lib/hooks'
import type { Paginated, Report, SupportTicket } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

type Tab='tickets'|'reports'
type ChangedProps={onChanged:()=>void}
const SEDABOX_ORIGIN='https://sedabox.com'
const slugify=(value:string)=>String(value||'').trim().replace(/\s+/g,'-').replace(/[^\w\u0600-\u06FF\-]/g,'').replace(/-+/g,'-').replace(/^-+|-+$/g,'')
const reportTargetLabel=(x:Report)=>x.song_title?`آهنگ: ${x.song_title}`:x.artist_name?`هنرمند: ${x.artist_name}`:x.reported_user_name?`کاربر: ${x.reported_user_name}`:x.reported_user_phone?`کاربر: ${x.reported_user_phone}`:'هدف نامشخص'
const reportTargetUrl=(x:Report)=>{
 if(x.song)return `${SEDABOX_ORIGIN}/track/${x.song}-${slugify(x.song_title||'آهنگ')}`
 if(x.artist)return `${SEDABOX_ORIGIN}/artist/${x.artist}-${slugify(x.artist_name||'هنرمند')}`
 if(x.reported_user){
  if(String(x.reported_user_unique_id||'').toLowerCase()==='sedabox')return `${SEDABOX_ORIGIN}/user/sedabox`
  const suffix=slugify(x.reported_user_name||x.reported_user_unique_id||'کاربر')||'profile'
  return `${SEDABOX_ORIGIN}/user/${x.reported_user}-${suffix}`
 }
 return ''
}
function ReportTargetLink({report,detail=false}:{report:Report;detail?:boolean}){
 const href=reportTargetUrl(report);const label=reportTargetLabel(report)
 if(!href)return <strong>{label}</strong>
 return <a className={`report-target-link${detail?' report-target-link--detail':''}`} href={href} target="_blank" rel="noopener noreferrer" title="باز کردن در صداباکس"><span>{label}</span><ExternalLink size={detail?16:14}/></a>
}

export default function SupportPage(){
 const[tab,setTab]=useState<Tab>('tickets');const[badgeVersion,setBadgeVersion]=useState(0)
 const pendingTickets=useRemote<Paginated<SupportTicket>>('/admin/support/tickets/'+queryString({status:'open',page:1,page_size:1}),badgeVersion)
 const pendingReports=useRemote<Paginated<Report>>('/admin/reports/'+queryString({has_reviewed:false,page:1,page_size:1}),badgeVersion)
 const refreshBadges=()=>setBadgeVersion(value=>value+1)
 const ticketCount=pendingTickets.data?.count||0;const reportCount=pendingReports.data?.count||0
 return <div className="page-stack"><PageHeader title="پشتیبانی و گزارش‌ها" description="رسیدگی به تیکت هنرمندان و گزارش تخلف کاربران"/>
  <div className="segmented segmented--wide support-tabs"><button className={tab==='tickets'?'is-active':''} onClick={()=>setTab('tickets')}><MessageSquareText size={17}/>تیکت هنرمندان{ticketCount>0?<b>{numberFa(ticketCount)}</b>:null}</button><button className={tab==='reports'?'is-active':''} onClick={()=>setTab('reports')}><ShieldAlert size={17}/>گزارش کاربران{reportCount>0?<b>{numberFa(reportCount)}</b>:null}</button></div>
  <div className={`support-tab-panel${tab==='tickets'?' is-active':''}`} aria-hidden={tab!=='tickets'}><Tickets onChanged={refreshBadges}/></div>
  <div className={`support-tab-panel${tab==='reports'?' is-active':''}`} aria-hidden={tab!=='reports'}><Reports onChanged={refreshBadges}/></div>
 </div>
}

function Tickets({onChanged}:ChangedProps){
 const toast=useToast();const[search,setSearch]=useState('');const q=useDebouncedValue(search);const[status,setStatus]=useState('');const[page,setPage]=useState(1);const[selected,setSelected]=useState<SupportTicket|null>(null);const[response,setResponse]=useState('');const[ticketStatus,setTicketStatus]=useState('');const[busy,setBusy]=useState(false)
 const remote=useRemote<Paginated<SupportTicket>>('/admin/support/tickets/'+queryString({q,status,page,page_size:20}))
 function open(item:SupportTicket){setSelected(item);setResponse(item.admin_response||'');setTicketStatus(item.status)}
 const visibleTicket=(item:SupportTicket)=>!status||item.status===status
 async function save(){if(!selected)return;const target=selected;const snapshot=pageSnapshot(remote.data,target.id);const requestedResponse=response.trim();const previousResponse=(target.admin_response||'').trim();const responseChanged=requestedResponse!==previousResponse;const autoAnswered=Boolean(requestedResponse&&responseChanged&&ticketStatus!=='closed');const requestedStatus=autoAnswered?'answered':ticketStatus;setBusy(true);try{const updated=await api<SupportTicket>(`/admin/support/tickets/${target.id}/`,{method:'PATCH',body:jsonBody({status:requestedStatus,admin_response:requestedResponse})});const optimistic={...target,...updated,status:requestedStatus,admin_response:requestedResponse};remote.setData(current=>setPaginatedItem(current,optimistic,{visible:visibleTicket(optimistic),indexHint:snapshot.index}));setSelected(null);onChanged();toast.show(autoAnswered?'پاسخ تیکت ذخیره شد و وضعیت به «پاسخ داده شده» تغییر کرد.':requestedResponse&&responseChanged?'پاسخ و وضعیت تیکت ذخیره شد.':'تغییرات تیکت ذخیره شد.','success');void verifyExactEntity<SupportTicket>(`/admin/support/tickets/${target.id}/`,{found:server=>{remote.setData(current=>setPaginatedItem(current,server,{visible:visibleTicket(server),indexHint:snapshot.index}));setSelected(current=>current?.id===server.id?server:current);setTicketStatus(current=>current===requestedStatus?server.status:current);setResponse(current=>current===requestedResponse?(server.admin_response||''):current)},missing:()=>{remote.setData(current=>removePaginatedItem(current,target.id));setSelected(current=>current?.id===target.id?null:current)}},{stopWhenFound:server=>server.status===requestedStatus&&(server.admin_response||'')===requestedResponse}).then(outcome=>{if(outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})}catch(e){toast.show(errorMessageFa(e),'error')}finally{setBusy(false)}}
 return <><Card className="toolbar-card"><SearchBox value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="موضوع، نام هنرمند یا شماره همراه"/><div className="filters"><ProductSelect ariaLabel="فیلتر وضعیت تیکت‌ها" value={status} onValueChange={value=>{setStatus(value);setPage(1)}} options={[{value:'',label:'همه وضعیت‌ها'},{value:'open',label:'باز'},{value:'in_progress',label:'در حال بررسی'},{value:'answered',label:'پاسخ داده شده'},{value:'closed',label:'بسته'}]}/></div></Card><Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<><DataTable<SupportTicket> loading={remote.loading} rows={remote.data?.results||[]} emptyTitle="تیکتی وجود ندارد" columns={[
  {key:'artist',title:'هنرمند',render:x=><div><strong>{x.artist_name||'هنرمند'}</strong><div className="subline" dir="ltr">{x.user_phone}</div></div>},{key:'subject',title:'موضوع',render:x=><div className="table-primary"><strong>{x.subject}</strong><span>{x.message}</span></div>},{key:'status',title:'وضعیت',render:x=><StatusBadge value={x.status}/>},{key:'date',title:'آخرین تغییر',render:x=>dateTimeFa(x.updated_at)},{key:'action',title:'بررسی',render:x=><button className="button button--compact" onClick={()=>open(x)}><Eye size={16}/>باز کردن</button>}
 ]}/>{remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}</>}</Card><Modal open={Boolean(selected)} title="رسیدگی به تیکت" onClose={()=>setSelected(null)} wide>{selected&&<div className="ticket-detail"><div className="ticket-meta"><div><span>هنرمند</span><strong>{selected.artist_name||'هنرمند'}</strong></div><div><span>شماره همراه</span><strong dir="ltr">{selected.user_phone}</strong></div><div><span>زمان ثبت</span><strong>{dateTimeFa(selected.created_at)}</strong></div><div><span>وضعیت</span><StatusBadge value={selected.status}/></div></div><Card className="ticket-message"><span>موضوع</span><h3>{selected.subject}</h3><p>{selected.message}</p></Card><div className="form-grid"><Field label="وضعیت"><ProductSelect ariaLabel="وضعیت تیکت" value={ticketStatus} onValueChange={setTicketStatus} options={[{value:'open',label:'باز'},{value:'in_progress',label:'در حال بررسی'},{value:'answered',label:'پاسخ داده شده'},{value:'closed',label:'بسته'}]}/></Field><div/><div className="form-grid__full"><Field label="پاسخ مدیریت" hint="با ثبت پاسخ، زمان و مدیر پاسخ‌دهنده در سرور ثبت می‌شود."><textarea rows={6} value={response} onChange={e=>setResponse(e.target.value)} placeholder="پاسخ روشن و کامل برای هنرمند بنویسید…"/></Field></div><div className="dialog-actions form-grid__full"><button className="button button--ghost" onClick={()=>setSelected(null)}>بستن</button><button className="button button--primary" onClick={()=>void save()} disabled={busy}><Save size={17}/>{busy?'در حال ذخیره…':'ذخیره پاسخ'}</button></div></div></div>}</Modal></>
}

function Reports({onChanged}:ChangedProps){
 const toast=useToast();const[reviewed,setReviewed]=useState('');const[type,setType]=useState('');const[page,setPage]=useState(1);const[selected,setSelected]=useState<Report|null>(null);const[busy,setBusy]=useState(false)
 const remote=useRemote<Paginated<Report>>('/admin/reports/'+queryString({has_reviewed:reviewed,type,page,page_size:20}))
 const visibleReport=(item:Report)=>!reviewed||String(item.has_reviewed)===reviewed
 async function markReviewed(){if(!selected)return;const target=selected;const snapshot=pageSnapshot(remote.data,target.id);setBusy(true);try{const result=await api<Report>(`/admin/reports/${target.id}/`,{method:'PUT',body:jsonBody({has_reviewed:true})});const optimistic={...target,...result,has_reviewed:true};remote.setData(current=>setPaginatedItem(current,optimistic,{visible:visibleReport(optimistic),indexHint:snapshot.index}));setSelected(null);onChanged();toast.show('گزارش به‌عنوان بررسی‌شده ثبت شد.','success');void verifyExactEntity<Report>(`/admin/reports/${target.id}/`,{found:server=>{remote.setData(current=>setPaginatedItem(current,server,{visible:visibleReport(server),indexHint:snapshot.index}));setSelected(current=>current?.id===server.id?server:current)},missing:()=>{remote.setData(current=>removePaginatedItem(current,target.id));setSelected(current=>current?.id===target.id?null:current)}},{stopWhenFound:server=>server.has_reviewed===true}).then(outcome=>{if(outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})}catch(e){toast.show(errorMessageFa(e),'error')}finally{setBusy(false)}}
 return <><Card className="toolbar-card"><div className="filters filters--grow"><ProductSelect ariaLabel="فیلتر بررسی گزارش‌ها" value={reviewed} onValueChange={value=>{setReviewed(value);setPage(1)}} options={[{value:'',label:'همه وضعیت‌ها'},{value:'false',label:'بررسی‌نشده'},{value:'true',label:'بررسی‌شده'}]}/><ProductSelect ariaLabel="فیلتر نوع گزارش" value={type} onValueChange={value=>{setType(value);setPage(1)}} options={[{value:'',label:'همه انواع گزارش'},{value:'song',label:'آهنگ'},{value:'artist',label:'هنرمند'},{value:'user',label:'کاربر'}]}/></div></Card><Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<><DataTable<Report> loading={remote.loading} rows={remote.data?.results||[]} emptyTitle="گزارشی وجود ندارد" columns={[
  {key:'from',title:'گزارش‌دهنده',render:x=><span dir="ltr">{x.user_phone}</span>},{key:'target',title:'هدف گزارش',render:x=><ReportTargetLink report={x}/>},{key:'text',title:'شرح',render:x=><span className="clamp-text">{x.text}</span>},{key:'status',title:'وضعیت',render:x=><StatusBadge value={x.has_reviewed?'done':'pending'}/>},{key:'date',title:'ثبت',render:x=>dateTimeFa(x.created_at)},{key:'action',title:'بررسی',render:x=><button className="icon-button" onClick={()=>setSelected(x)} aria-label="مشاهده گزارش"><Eye size={17}/></button>}
 ]}/>{remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}</>}</Card><Modal open={Boolean(selected)} title="جزئیات گزارش کاربر" onClose={()=>setSelected(null)}>{selected&&<div className="report-detail"><div className="detail-line"><span>گزارش‌دهنده</span><strong dir="ltr">{selected.user_phone}</strong></div><div className="detail-line"><span>هدف</span><ReportTargetLink report={selected} detail/></div><div className="detail-line"><span>زمان ثبت</span><strong>{dateTimeFa(selected.created_at)}</strong></div><Card className="report-text"><p>{selected.text}</p></Card><div className="dialog-actions"><button className="button button--ghost" onClick={()=>setSelected(null)}>بستن</button>{selected.has_reviewed?<span className="reviewed-note"><CheckCheck size={17}/>این گزارش بررسی شده است</span>:<button className="button button--primary" disabled={busy} onClick={()=>void markReviewed()}><CheckCheck size={17}/>{busy?'در حال ثبت…':'ثبت به‌عنوان بررسی‌شده'}</button>}</div></div>}</Modal></>
}
