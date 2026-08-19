import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Eye, FilePenLine, History, Plus, Radio, RotateCcw, Send, ShieldX, Timer, Trash2, XCircle } from 'lucide-react'
import { DataTable } from '../components/DataTable'
import { PersianDateTimePicker } from '../components/PersianDateTimePicker'
import { ProductSelect } from '../components/ProductSelect'
import { Card, Confirm, ErrorState, Field, Modal, PageHeader, Pagination, SearchBox, StatusBadge } from '../components/Ui'
import { useToast } from '../components/toastContext'
import { api, errorMessageFa, jsonBody, queryString, resolveMediaUrl } from '../lib/api'
import { useDebouncedValue } from '../lib/hooks'
import { dateTimeFa, dateTimeTehranFa, numberFa } from '../lib/format'
import type { Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import { useAuth } from '../lib/authContext'
import { can } from '../lib/permissions'
import { pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

type NamedRef = { id?:number; title?:string; name?:string; artistic_name?:string; artistic_name_fa?:string; artistic_name_en?:string }
type SharedMetadataDisplay = { genre_names?:string[]; sub_genre_names?:string[]; mood_names?:string[]; tag_names?:string[] }
type ReleaseTrack = Record<string, unknown> & {
  id:number; title:string; title_en?:string; artist_name?:string; duration_display?:string; duration_seconds?:number|null; status?:string
  audio_file?:string|null; converted_audio_url?:string|null; cover_image?:string|null; original_format?:string|null; release_date?:string|null; language?:string
  featured_artists?:NamedRef[]; genre_ids?:NamedRef[]; sub_genre_ids?:NamedRef[]; mood_ids?:NamedRef[]; tag_ids?:NamedRef[]; genre_names?:string[]
  description?:string; description_en?:string; lyrics?:string; lyrics_en?:string; tempo?:number|null; energy?:number|null; danceability?:number|null; valence?:number|null
  acousticness?:number|null; instrumentalness?:number|null; speechiness?:number|null; live_performed?:boolean; label?:string; label_en?:string
  producers?:string[]; producers_en?:string[]; composers?:string[]; composers_en?:string[]; lyricists?:string[]; lyricists_en?:string[]; credits?:string; credits_en?:string
  metadata_completion?:number; missing_metadata?:string[]; deletion_state?:string; deletion_origin?:'artist'|'admin'|'unknown'|''; release_extras?:{isrc?:string;version?:string;explicit?:boolean;publishing_owner?:string;preview_start?:number;_cover_source?:string}
}
type ReleaseValidation = { valid?:boolean; errors?:Array<Record<string,unknown>>; warnings?:Array<Record<string,unknown>>; summary?:Record<string,unknown> }
type Release = Record<string, unknown> & {
  id:string; album_id?:number|null; title:string; title_en?:string; status:string; release_type?:string; previously_released?:boolean; current_step?:number
  created_at?:string; updated_at?:string; submitted_at?:string|null; reviewed_at?:string|null; scheduled_at?:string|null; published_at?:string|null; taken_down_at?:string|null
  primary_artist_id?:number; primary_artist?:{id:number;name?:string;name_en?:string;artistic_name?:string;artistic_name_en?:string;profile_image?:string|null}|null
  tracks?:ReleaseTrack[]; validation?:ReleaseValidation; release_metadata?:Record<string,unknown>; shared_metadata?:Record<string,unknown>; shared_metadata_display?:SharedMetadataDisplay; track_extras?:Record<string,unknown>
  status_history?:Array<Record<string,unknown>>; admin_note?:string; review_note?:string; lock_version?:number; revision_number?:number; source_release_id?:string|null
  removal_state?:'active'|'artist_deleted'|'admin_unreachable'|'admin_deleted'|'deleted_unavailable'; removal_origin?:string; removal_reason?:string; deleted_track_count?:number; active_track_count?:number; can_restore?:boolean; artist_deleted?:boolean
}
type ReleaseActionResult = Release | { id:string; removed_from_admin_queue:true }
type ReviewTab = 'release'|'tracks'

const actionMap: Record<string, { label:string; icon:typeof CheckCircle2; tone?:string }> = {
  request_changes:{label:'درخواست اصلاح',icon:FilePenLine}, approve:{label:'تأیید برای انتشار',icon:CheckCircle2}, reject:{label:'رد انتشار',icon:XCircle,tone:'danger'},
  schedule:{label:'زمان‌بندی انتشار',icon:Timer}, publish:{label:'انتشار',icon:Radio}, take_down:{label:'خارج کردن از دسترس',icon:ShieldX,tone:'danger'},
  reopen:{label:'بازگشایی برای ویرایش',icon:RotateCcw}, return_to_review:{label:'بازگردانی به بررسی',icon:Send},
}
const expectedStatus: Record<string,string> = {
  request_changes:'changes_requested', approve:'approved', reject:'rejected', schedule:'scheduled', publish:'live', take_down:'taken_down', reopen:'draft', return_to_review:'in_review',
}
const allowed: Record<string,string[]> = {
  in_review:['request_changes','approve','reject','schedule','publish'], changes_requested:['reject','reopen','return_to_review'], approved:['schedule','publish','return_to_review'], scheduled:['publish'], live:['take_down'], rejected:['reopen','return_to_review'], taken_down:['reopen','publish'],
}

const actionLabel=(action:string,status:string)=>{
  if(status==='in_review'&&action==='publish')return 'تأیید و انتشار'
  if(status==='in_review'&&action==='schedule')return 'تأیید و زمان‌بندی'
  if(status==='taken_down'&&action==='publish')return 'بازگرداندن به دسترس'
  return actionMap[action]?.label||'انجام عملیات'
}
const nextScheduleIso=()=>{
  const value=new Date(Date.now()+60*60*1000)
  value.setUTCSeconds(0,0)
  value.setUTCMinutes(Math.ceil(value.getUTCMinutes()/15)*15)
  return value.toISOString()
}
const releaseTypeFa:Record<string,string>={single:'تک‌آهنگ',ep:'ای‌پی',album:'آلبوم',compilation:'مجموعه'}
const yesNo=(value:unknown)=>value?'بله':'خیر'
const asText=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value)
const asList=(value:unknown):string[]=>Array.isArray(value)?value.map(item=>String(item??'').trim()).filter(Boolean):value?String(value).split(',').map(item=>item.trim()).filter(Boolean):[]
const refLabels=(value:unknown):string[]=>Array.isArray(value)?value.map(item=>{
  if(item&&typeof item==='object'){const row=item as NamedRef;return String(row.title||row.artistic_name||row.name||'').trim()}
  return typeof item==='string'&&!/^\d+$/.test(item.trim())?item.trim():''
}).filter(Boolean):[]
const historyLabel=(value:unknown)=>({draft:'پیش‌نویس',in_review:'در حال بررسی',changes_requested:'نیازمند اصلاح',approved:'تأیید شده',scheduled:'زمان‌بندی شده',live:'منتشر شده',rejected:'رد شده',taken_down:'از دسترس خارج'}[String(value)]||'نامشخص')
const languageFa=(value:unknown)=>({fa:'فارسی',en:'انگلیسی',ar:'عربی',tr:'ترکی',ku:'کردی'}[String(value||'').toLowerCase()]||asText(value))
const territoryFa=(value:unknown)=>String(value||'').toUpperCase()==='WORLDWIDE'?'سراسر جهان':asText(value)
const missingMetadataFa=(value:string)=>({composer:'آهنگساز',lyricist:'ترانه‌سرا','publishing owner':'مالک حقوق نشر'}[value]||value)

const releaseRemovalLabel=(release:Release)=>{
  if(release.removal_state==='artist_deleted')return 'حذف‌شده توسط هنرمند'
  if(release.removal_state==='admin_unreachable')return 'خارج از دسترس توسط مدیریت'
  if(release.removal_state==='admin_deleted')return 'حذف‌شده توسط مدیریت'
  if(release.removal_state==='deleted_unavailable')return 'حذف‌شده و غیرقابل بازگردانی'
  return ''
}
const releaseActions=(release:Release)=>{
  if(release.artist_deleted)return []
  if(release.status==='taken_down'&&!release.can_restore)return []
  return allowed[release.status]||[]
}
const deletionOriginFa=(value:unknown)=>value==='artist'?'هنرمند':value==='admin'?'مدیریت':'نامشخص'
const hiddenReviewWarning=(value:unknown)=>{
  const text=String(value||'').trim()
  return text.includes('حق مالکیت ضبط (P-line)')||text.includes('حق مالکیت اثر و کاور (C-line)')
}

const adminValidationMessage=(value:unknown)=>{
  const text=String(value||'').trim()
  const direct:Record<string,string>={
    'عنوان انتشار را وارد کنید.':'عنوان انتشار ثبت نشده است.',
    'یک نوع انتشار معتبر انتخاب کنید.':'نوع انتشار معتبر ثبت نشده است.',
    'یک کاور مربعی برای انتشار بارگذاری کنید.':'کاور مربعی انتشار ثبت نشده است.',
    'یک تاریخ انتشار معتبر انتخاب کنید.':'تاریخ انتشار معتبر ثبت نشده است.',
    'برای محتوای قبلاً منتشرشده، تاریخ انتشار اصلی را وارد کنید.':'تاریخ انتشار اصلی برای محتوای قبلاً منتشرشده ثبت نشده است.',
    'در بخش دسته‌بندی مشترک حداقل یک ژانر انتخاب کنید.':'در دسته‌بندی مشترک، ژانری ثبت نشده است.',
    'حداقل یک قلمرو انتشار انتخاب کنید.':'قلمرو انتشار ثبت نشده است.',
    'اطلاعات حق مالکیت ضبط (P-line) را وارد کنید.':'اطلاعات حق مالکیت ضبط (P-line) ثبت نشده است.',
    'اطلاعات حق مالکیت اثر و کاور (C-line) را وارد کنید.':'اطلاعات حق مالکیت اثر و کاور (C-line) ثبت نشده است.',
    'وارد کردن عنوان ترک الزامی است.':'عنوان این ترک ثبت نشده است.',
    'انتخاب زبان ترک الزامی است.':'زبان این ترک ثبت نشده است.',
    'برای این انتشار حداقل یک ژانر مشترک انتخاب کنید.':'ژانر مشترک برای این انتشار ثبت نشده است.',
    'تکمیل اطلاعات آهنگساز پیشنهاد می‌شود.':'اطلاعات آهنگساز تکمیل نشده است.',
    'تکمیل اطلاعات ترانه‌سرا پیشنهاد می‌شود.':'اطلاعات ترانه‌سرا تکمیل نشده است.',
    'تکمیل اطلاعات مالک حقوق نشر پیشنهاد می‌شود.':'اطلاعات مالک حقوق نشر تکمیل نشده است.',
  }
  if(direct[text])return direct[text]
  if(text.includes('شناسه‌های انتخاب‌شده برای genre'))return 'یکی از ژانرهای انتخاب‌شده معتبر نیست.'
  if(text.includes('شناسه‌های انتخاب‌شده برای subgenre'))return 'یکی از زیرژانرهای انتخاب‌شده معتبر نیست.'
  if(text.includes('شناسه‌های انتخاب‌شده برای mood'))return 'یکی از حال‌وهوای انتخاب‌شده معتبر نیست.'
  if(text.includes('شناسه‌های انتخاب‌شده برای tag'))return 'یکی از برچسب‌های انتخاب‌شده معتبر نیست.'
  return text
}

const historyActionText=(from:unknown,to:unknown,noteValue:unknown='')=>{
  const note=String(noteValue||'').toLocaleLowerCase()
  if(note.includes('توسط هنرمند حذف شد')||note.includes('removed or deleted by the artist'))return 'هنرمند انتشار را حذف کرد'
  if(note.includes('song permanently deleted by an administrator'))return 'مدیریت آخرین رکوردهای انتشار را حذف کرد'
  if(note.includes('song taken down by an administrator'))return 'مدیریت ترک‌های انتشار را حذف امن کرد'
  const key=`${String(from||'')}->${String(to||'')}`
  const labels:Record<string,string>={
    '->draft':'انتشار ایجاد شد',
    'draft->in_review':'هنرمند انتشار را برای بررسی ارسال کرد',
    'changes_requested->in_review':'نسخه اصلاح‌شده برای بررسی دوباره ارسال شد',
    'in_review->changes_requested':'مدیریت درخواست اصلاح ثبت کرد',
    'in_review->approved':'مدیریت انتشار را تأیید کرد',
    'in_review->rejected':'مدیریت انتشار را رد کرد',
    'in_review->scheduled':'انتشار برای زمان مشخص برنامه‌ریزی شد',
    'approved->scheduled':'انتشار برای زمان مشخص برنامه‌ریزی شد',
    'approved->live':'انتشار منتشر شد',
    'scheduled->live':'انتشار منتشر شد',
    'in_review->live':'انتشار تأیید و منتشر شد',
    'live->taken_down':'انتشار از دسترس خارج شد',
    'rejected->draft':'انتشار برای ویرایش دوباره باز شد',
    'changes_requested->draft':'انتشار برای ویرایش دوباره باز شد',
    'taken_down->draft':'انتشار برای ویرایش دوباره باز شد',
    'taken_down->live':'انتشار دوباره منتشر شد',
    'approved->in_review':'انتشار به صف بررسی بازگردانده شد',
    'rejected->in_review':'انتشار به صف بررسی بازگردانده شد',
  }
  return labels[key]||`وضعیت انتشار به «${historyLabel(to)}» تغییر کرد`
}
const historyNoteFa=(value:unknown)=>{
  const text=String(value||'').trim()
  if(!text)return ''
  if(['انتشار توسط هنرمند برای بررسی ارسال شد.','فضای کاری انتشار ایجاد شد.','انتشار منتشر شد.','انتشار تأیید شد.'].includes(text))return ''
  const translated:Record<string,string>={
    'Status changed in Django admin.':'وضعیت از طریق پنل مدیریت تغییر کرد.',
    'All active recordings were removed or deleted by the artist.':'همه ترک‌های فعال این انتشار توسط هنرمند حذف شدند.',
    'Song taken down by an administrator.':'همه ترک‌های فعال این انتشار توسط مدیریت به‌صورت امن از دسترس خارج شدند.',
    'Song permanently deleted by an administrator.':'آخرین ترک‌های این انتشار توسط مدیریت به‌صورت دائمی حذف شدند.',
  }
  return translated[text]||text
}


function InfoCell({label,value,dir}:{label:string;value:unknown;dir?:'rtl'|'ltr'}){return <div><span>{label}</span><strong dir={dir}>{asText(value)}</strong></div>}
function ValueList({values}:{values:string[]}){return values.length?<div className="review-chip-list">{values.map((value,index)=><span key={`${value}-${index}`}>{value}</span>)}</div>:<span className="muted">—</span>}
function TextCard({label,value,dir}:{label:string;value:unknown;dir?:'rtl'|'ltr'}){const text=asText(value);return <div><span>{label}</span><p dir={dir}>{text}</p></div>}

export default function ReleasesPage(){const{user}=useAuth();const canAdd=can(user,'release_add.edit'),canReview=can(user,'releases.review'),canPublish=can(user,'releases.publish'),canTakedown=can(user,'releases.takedown'),canDelete=can(user,'releases.delete');
  const navigate = useNavigate()
  const [search,setSearch]=useState(''); const [status,setStatus]=useState(''); const [page,setPage]=useState(1)
  const [selected,setSelected]=useState<Release|null>(null); const [note,setNote]=useState(''); const [busy,setBusy]=useState(false)
  const [reviewTab,setReviewTab]=useState<ReviewTab>('release'); const [selectedTrackId,setSelectedTrackId]=useState<number|null>(null)
  const [historyOpen,setHistoryOpen]=useState(false); const [scheduleOpen,setScheduleOpen]=useState(false); const [scheduleAt,setScheduleAt]=useState(nextScheduleIso); const [deleteOpen,setDeleteOpen]=useState(false)
  const q=useDebouncedValue(search); const toast=useToast(); const path='/admin/releases/'+queryString({q,status,page,page_size:20})
  const remote=useRemote<Paginated<Release>>(path)
  const visibleInCurrentList=(item:Release)=>!status||item.status===status
  const activeTrack=useMemo(()=>selected?.tracks?.find(track=>track.id===selectedTrackId)||selected?.tracks?.[0]||null,[selected,selectedTrackId])

  async function open(item:Release){
    try{
      const detail=await api<Release>(`/admin/releases/${item.id}/`)
      setSelected(detail);setNote('');setReviewTab('release');setSelectedTrackId(detail.tracks?.[0]?.id||null);setHistoryOpen(false);setScheduleOpen(false);setDeleteOpen(false)
    }catch(err){toast.show(errorMessageFa(err),'error')}
  }
  function close(){setSelected(null);setSelectedTrackId(null);setReviewTab('release');setNote('');setHistoryOpen(false);setScheduleOpen(false);setDeleteOpen(false)}
  function openSchedule(){
    if(!selected)return
    const current=selected.scheduled_at&&new Date(selected.scheduled_at).getTime()>Date.now()?selected.scheduled_at:nextScheduleIso()
    setScheduleAt(current);setScheduleOpen(true)
  }
  async function act(action:string, extra:Record<string,unknown>={}){
    if(!selected)return
    const target=selected; const snapshot=pageSnapshot(remote.data,target.id)
    setBusy(true)
    try{
      const result=await api<ReleaseActionResult>(`/admin/releases/${target.id}/action/`,{method:'POST',body:jsonBody({action,note,lock_version:target.lock_version,...extra})})
      const intendedStatus=expectedStatus[action]
      if(action==='reopen'){remote.setData(current=>removePaginatedItem(current,target.id));close()}
      else{
        const optimistic={...target,...('removed_from_admin_queue' in result?{}:result),status:intendedStatus||target.status}
        remote.setData(current=>setPaginatedItem(current,optimistic,{visible:visibleInCurrentList(optimistic),indexHint:snapshot.index}))
        if(action==='schedule'){setSelected(optimistic);setScheduleOpen(false);setNote('')}
        else close()
      }
      toast.show(action==='reopen'?'انتشار برای ویرایش هنرمند باز شد و از صف مدیریت خارج شد.':'عملیات انتشار با موفقیت انجام شد.','success')
      void verifyExactEntity<Release>(`/admin/releases/${target.id}/`,{
        found:server=>{remote.setData(current=>setPaginatedItem(current,server,{visible:visibleInCurrentList(server),indexHint:snapshot.index}));setSelected(current=>current?.id===server.id?server:current)},
        missing:()=>{remote.setData(current=>removePaginatedItem(current,target.id));setSelected(current=>current?.id===target.id?null:current)},
      },action==='reopen'?{stopOnMissing:true}:{stopWhenFound:server=>server.status===intendedStatus}).then(outcome=>{if(outcome!=='superseded')void remote.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,snapshot.order))})
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setBusy(false)}
  }
  async function confirmSchedule(){
    const timestamp=new Date(scheduleAt).getTime()
    if(!Number.isFinite(timestamp)||timestamp<=Date.now()){
      toast.show('زمان انتشار باید در آینده باشد.','error');return
    }
    await act('schedule',{scheduled_at:scheduleAt})
  }

  async function permanentlyDelete(){
    if(!selected)return
    const target=selected
    setBusy(true)
    try{
      await api(`/admin/releases/${target.id}/`,{method:'DELETE'})
      remote.setData(current=>removePaginatedItem(current,target.id))
      toast.show('انتشار و داده‌های اختصاصی وابسته به آن برای همیشه حذف شد.','success')
      close()
      void remote.revalidate()
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setBusy(false)}
  }

  const metadata=selected?.release_metadata||{}
  const shared=selected?.shared_metadata||{}
  const sharedDisplay=selected?.shared_metadata_display||{}
  const validationErrors=selected?.validation?.errors||[]
  const validationWarnings=selected?.validation?.warnings||[]
  const visibleValidationWarnings=validationWarnings.filter(item=>!hiddenReviewWarning(item.message))
  const coverUrl=resolveMediaUrl(asText(metadata.cover_url)==='—'?'':String(metadata.cover_url||''))
  const hasDeletedState=Boolean(selected&&((selected.removal_state&&selected.removal_state!=='active')||(selected.deleted_track_count||0)>0||selected.tracks?.some(track=>track.status==='deleted')))
  const availableActions=selected?releaseActions(selected).filter(key=>key==='publish'||key==='schedule'?canPublish:key==='take_down'?canTakedown:key==='reopen'&&selected.status==='taken_down'?canTakedown:canReview):[]
  const canDeleteSelected=Boolean(selected&&canDelete&&selected.status!=='draft')
  const hasOperationalActions=availableActions.length>0||canDeleteSelected

  return <div className="page-stack"><PageHeader title="بررسی انتشارها" description={canPublish?"بررسی، تأیید و انتشار آثار":"بررسی و پیگیری وضعیت انتشار آثار"} actions={canAdd?<button className="button button--primary" onClick={()=>navigate('/releases/add')}><Plus size={16}/>افزودن انتشار</button>:undefined}/>
    <Card className="toolbar-card"><SearchBox value={search} onChange={v=>{setSearch(v);setPage(1)}} placeholder="نام انتشار یا هنرمند"/><div className="filters"><ProductSelect ariaLabel="فیلتر وضعیت انتشارها" value={status} onValueChange={value=>{setStatus(value);setPage(1)}} options={[{value:'',label:'همه وضعیت‌ها'},...(canAdd?[{value:'draft',label:'پیش‌نویس‌های مدیریت'}]:[]),{value:'in_review',label:'در حال بررسی'},{value:'changes_requested',label:'نیازمند اصلاح'},{value:'approved',label:'تأیید شده'},{value:'scheduled',label:'زمان‌بندی شده'},{value:'live',label:'منتشر شده'},{value:'rejected',label:'رد شده'},{value:'taken_down',label:'خارج از دسترس'}]}/></div></Card>
    <Card>{remote.error?<ErrorState message={remote.error} retry={()=>void remote.reload()}/>:<><DataTable<Release> loading={remote.loading} rows={remote.data?.results||[]} columns={[
      {key:'title',title:'انتشار',render:r=><div><strong>{r.title}</strong><div className="subline">{r.primary_artist?.artistic_name||r.primary_artist?.name||'—'}</div></div>},
      {key:'type',title:'نوع',render:r=>releaseTypeFa[r.release_type||'']||'نامشخص'}, {key:'status',title:'وضعیت',render:r=><div className="release-state-cell"><StatusBadge value={r.status}/>{releaseRemovalLabel(r)&&<small>{releaseRemovalLabel(r)}</small>}</div>},
      {key:'tracks',title:'ترک‌ها',render:r=>numberFa(r.tracks?.length||0)}, {key:'updated',title:'آخرین تغییر',render:r=>dateTimeFa(String(r.updated_at||r.created_at||''))},
      {key:'action',title:(canReview||canPublish||canTakedown||canDelete)?'بررسی':'مشاهده',render:r=>r.status==='draft'&&canAdd?<button className="button button--compact" onClick={()=>navigate(`/releases/add/${r.id}`)}><FilePenLine size={16}/>ادامه ویرایش</button>:<button className="button button--compact" onClick={()=>void open(r)}><Eye size={16}/>جزئیات</button>},
    ]}/>{remote.data&&<Pagination count={remote.data.count} page={page} pageSize={20} onPage={setPage}/>}</>}</Card>

    <Modal open={Boolean(selected)} title={hasOperationalActions?"بررسی کامل انتشار":"جزئیات انتشار"} onClose={close} wide className="release-review-modal">{selected&&<div className="release-review">
      <div className="release-review-head">
        {coverUrl?<img src={coverUrl} alt="کاور انتشار"/>:<div className="release-review-cover-empty">بدون کاور</div>}
        <div className="release-review-title"><span>{releaseTypeFa[selected.release_type||'']||'انتشار'}</span><h3>{selected.title}</h3><p dir="ltr">{selected.title_en||'—'}</p><small>{selected.primary_artist?.artistic_name||selected.primary_artist?.name||'—'}</small></div>
        <div className="release-review-head__tools"><StatusBadge value={selected.status}/><button type="button" className="button button--compact release-history-button" onClick={()=>setHistoryOpen(true)}><History size={15}/>سابقه انتشار</button></div>
      </div>
      <div className="review-tabs" role="tablist">
        <button className={reviewTab==='release'?'is-active':''} onClick={()=>setReviewTab('release')}>اطلاعات انتشار</button>
        <button className={reviewTab==='tracks'?'is-active':''} onClick={()=>setReviewTab('tracks')}>ترک‌ها و فایل صوتی <b>{numberFa(selected.tracks?.length||0)}</b></button>
      </div>

      <div className="release-review-scroll">
      {selected.removal_state&&selected.removal_state!=='active'&&<div className={`release-removal-notice release-removal-notice--${selected.removal_state}`}><div><ShieldX size={18}/><span><strong>{releaseRemovalLabel(selected)}</strong>{selected.removal_state==='artist_deleted'?<small>این انتشار توسط هنرمند حذف شده است. سوابق آن حفظ می‌شود.</small>:selected.removal_state==='admin_unreachable'?<small>این انتشار توسط مدیریت از دسترس مخاطبان خارج شده است. داده‌ها و آمار حفظ شده‌اند و این اقدام قابل بازگردانی است.</small>:selected.removal_state==='admin_deleted'?<small>رکوردهای این انتشار توسط مدیریت حذف شده‌اند و انتشار مستقیم دوباره ممکن نیست.</small>:<small>بخشی از داده‌های این انتشار حذف شده و بازگردانی مستقیم آن امکان‌پذیر نیست.</small>}</span></div>{selected.deleted_track_count?<b>{numberFa(selected.deleted_track_count)} ترک حذف‌شده</b>:null}</div>}
      {reviewTab==='release'?<div className="release-review-pane">
        <div className="review-summary-bar review-summary-bar--release">
          <InfoCell label="نوع انتشار" value={releaseTypeFa[selected.release_type||'']||'نامشخص'}/><InfoCell label="قبلاً منتشر شده" value={yesNo(selected.previously_released)}/><InfoCell label="مرحله تکمیل فرم" value={selected.current_step}/><InfoCell label="شماره بازبینی" value={selected.revision_number}/>
        </div>
        {(validationErrors.length>0||visibleValidationWarnings.length>0)&&<section className="review-section review-attention-section"><div className="review-section__title"><strong>موارد قابل بررسی</strong><span>خلاصه نکاتی که بهتر است بررسی شوند</span></div><div className="validation-list validation-list--compact">{validationErrors.map((item,index)=><div className="is-error" key={`e-${index}`}><AlertTriangle size={14}/><span><strong>نیازمند اصلاح</strong>{adminValidationMessage(item.message)}</span></div>)}{visibleValidationWarnings.map((item,index)=><div className="is-warning" key={`w-${index}`}><AlertTriangle size={14}/><span><strong>پیشنهاد تکمیل</strong>{adminValidationMessage(item.message)}</span></div>)}</div></section>}
        <section className="review-section"><div className="review-section__title"><strong>اطلاعات اصلی انتشار</strong><span>اطلاعاتی که هنرمند برای خود انتشار ثبت کرده است</span></div><div className="review-info-grid">
          <InfoCell label="عنوان فارسی" value={selected.title}/><InfoCell label="عنوان انگلیسی" value={selected.title_en} dir="ltr"/><InfoCell label="هنرمند اصلی" value={selected.primary_artist?.artistic_name||selected.primary_artist?.name}/><InfoCell label="آلبوم برای این انتشار ساخته شده" value={yesNo(selected.album_id)}/>
          <InfoCell label="تاریخ انتشار" value={metadata.release_date}/><InfoCell label="تاریخ انتشار اصلی" value={metadata.original_release_date}/><InfoCell label="ناشر فارسی" value={metadata.label}/><InfoCell label="ناشر انگلیسی" value={metadata.label_en} dir="ltr"/>
          <InfoCell label="حق مالکیت ضبط" value={metadata.p_copyright}/><InfoCell label="حق مالکیت اثر و کاور" value={metadata.c_copyright}/><InfoCell label="محدوده انتشار" value={asList(metadata.territories).map(territoryFa).join('، ')}/><InfoCell label="برگرفته از انتشار قبلی" value={yesNo(selected.source_release_id)}/>
        </div></section>
        {Boolean(metadata.description||metadata.description_en)&&<section className="review-section"><div className="review-section__title"><strong>توضیحات انتشار</strong></div><div className="review-text-grid"><TextCard label="توضیحات فارسی" value={metadata.description}/><TextCard label="توضیحات انگلیسی" value={metadata.description_en} dir="ltr"/></div></section>}
        <section className="review-section"><div className="review-section__title"><strong>اطلاعات مشترک ترک‌ها</strong><span>مقادیر مشترکی که هنگام ثبت انتشار وارد شده‌اند</span></div><div className="review-info-grid">
          <InfoCell label="زبان" value={languageFa(shared.language)}/><InfoCell label="ناشر فارسی" value={shared.label}/><InfoCell label="ناشر انگلیسی" value={shared.label_en} dir="ltr"/>
          <div><span>ژانرها</span><ValueList values={asList(sharedDisplay.genre_names)}/></div><div><span>زیرژانرها</span><ValueList values={asList(sharedDisplay.sub_genre_names)}/></div><div><span>حال‌وهوا</span><ValueList values={asList(sharedDisplay.mood_names)}/></div><div><span>برچسب‌ها</span><ValueList values={asList(sharedDisplay.tag_names)}/></div>
          <div><span>تهیه‌کنندگان فارسی</span><ValueList values={asList(shared.producers)}/></div><div><span>تهیه‌کنندگان انگلیسی</span><ValueList values={asList(shared.producers_en)}/></div><div><span>آهنگسازان فارسی</span><ValueList values={asList(shared.composers)}/></div><div><span>آهنگسازان انگلیسی</span><ValueList values={asList(shared.composers_en)}/></div><div><span>ترانه‌سرایان فارسی</span><ValueList values={asList(shared.lyricists)}/></div><div><span>ترانه‌سرایان انگلیسی</span><ValueList values={asList(shared.lyricists_en)}/></div>
        </div></section>
        {(selected.review_note||selected.admin_note)&&<section className="review-section"><div className="review-section__title"><strong>یادداشت‌ها</strong><span>توضیحات ثبت‌شده درباره بررسی این انتشار</span></div><div className="review-text-grid"><TextCard label="توضیح ثبت‌شده برای آخرین تصمیم" value={selected.review_note}/><TextCard label="یادداشت داخلی مدیریت" value={selected.admin_note}/></div></section>}
      </div>:<div className="release-review-pane release-track-workspace">
        <div className="release-track-selector">{selected.tracks?.map((track,index)=><button key={track.id} className={activeTrack?.id===track.id?'is-active':''} onClick={()=>setSelectedTrackId(track.id)}><b>{numberFa(index+1)}</b><span><strong>{track.title}</strong><small>{track.status==='deleted'?`حذف‌شده توسط ${deletionOriginFa(track.deletion_origin)}`:track.duration_display||'مدت نامشخص'}</small></span><StatusBadge value={track.status}/></button>)}</div>
        {activeTrack?<div className="release-track-detail">
          <div className="track-review-head">{activeTrack.cover_image?<img src={resolveMediaUrl(activeTrack.cover_image)} alt="کاور ترک"/>:<div className="track-cover-empty">بدون کاور</div>}<div><span>ترک انتخاب‌شده</span><h3>{activeTrack.title}</h3><p dir="ltr">{activeTrack.title_en||'—'}</p></div><div><span>تکمیل اطلاعات</span><strong>{numberFa(activeTrack.metadata_completion||0)}٪</strong></div></div>
          {activeTrack.status==='deleted'&&<div className="track-deletion-notice"><ShieldX size={17}/><span><strong>این ترک حذف شده است</strong><small>{activeTrack.deletion_origin==='artist'?'این ترک توسط هنرمند حذف شده است.':activeTrack.deletion_origin==='admin'?'حذف توسط مدیریت ثبت شده است. رکورد فقط برای بررسی سوابق نمایش داده می‌شود.':'منشأ حذف در سوابق قدیمی مشخص نیست. تا زمان بررسی، این ترک قابل انتشار نیست.'}</small></span></div>}
          <section className="review-section audio-review-section"><div className="review-section__title"><strong>فایل صوتی اصلی</strong><span>فایل بارگذاری‌شده توسط هنرمند از پیوند امن سرور پخش می‌شود.</span></div>{activeTrack.audio_file||activeTrack.converted_audio_url?<audio key={resolveMediaUrl(activeTrack.audio_file||activeTrack.converted_audio_url)} className="release-audio-player" controls preload="metadata" src={resolveMediaUrl(activeTrack.audio_file||activeTrack.converted_audio_url)}/>:<div className="inline-note">فایل صوتی برای این ترک در دسترس نیست.</div>}<div className="review-info-grid compact"><InfoCell label="قالب اصلی" value={activeTrack.original_format}/><InfoCell label="مدت" value={activeTrack.duration_display||activeTrack.duration_seconds}/><InfoCell label="تاریخ انتشار ترک" value={activeTrack.release_date}/><InfoCell label="زبان" value={languageFa(activeTrack.language)}/></div></section>
          <section className="review-section"><div className="review-section__title"><strong>اطلاعات ترک</strong></div><div className="review-info-grid">
            <InfoCell label="عنوان فارسی" value={activeTrack.title}/><InfoCell label="عنوان انگلیسی" value={activeTrack.title_en} dir="ltr"/><InfoCell label="ناشر فارسی" value={activeTrack.label}/><InfoCell label="ناشر انگلیسی" value={activeTrack.label_en} dir="ltr"/>
            <InfoCell label="شماره دیسک" value={activeTrack.album_disc_number}/><InfoCell label="شماره ترک" value={activeTrack.album_track_number}/><InfoCell label="تک‌آهنگ" value={yesNo(activeTrack.is_single)}/><InfoCell label="کاور اختصاصی ترک" value={yesNo(activeTrack.own_cover_image)}/><InfoCell label="فایل صوتی ثبت شده" value={yesNo(activeTrack.has_audio)}/><InfoCell label="سرعت" value={activeTrack.tempo}/><InfoCell label="انرژی" value={activeTrack.energy}/><InfoCell label="قابلیت رقص" value={activeTrack.danceability}/><InfoCell label="حس مثبت" value={activeTrack.valence}/><InfoCell label="آکوستیک" value={activeTrack.acousticness}/><InfoCell label="بی‌کلام بودن" value={activeTrack.instrumentalness}/><InfoCell label="گفتاری بودن" value={activeTrack.speechiness}/><InfoCell label="اجرای زنده" value={yesNo(activeTrack.live_performed)}/>
          </div></section>
          <section className="review-section"><div className="review-section__title"><strong>طبقه‌بندی و هنرمندان مهمان</strong></div><div className="classification-review-grid"><div><span>ژانرها</span><ValueList values={refLabels(activeTrack.genre_ids).length?refLabels(activeTrack.genre_ids):asList(activeTrack.genre_names)}/></div><div><span>زیرژانرها</span><ValueList values={refLabels(activeTrack.sub_genre_ids)}/></div><div><span>حال‌وهوا</span><ValueList values={refLabels(activeTrack.mood_ids)}/></div><div><span>برچسب‌ها</span><ValueList values={refLabels(activeTrack.tag_ids)}/></div><div><span>هنرمندان مهمان</span><ValueList values={refLabels(activeTrack.featured_artists)}/></div></div></section>
          <section className="review-section"><div className="review-section__title"><strong>حقوق و نسخه ترک</strong></div><div className="review-info-grid"><InfoCell label="کد ISRC" value={activeTrack.release_extras?.isrc} dir="ltr"/><InfoCell label="نسخه" value={activeTrack.release_extras?.version}/><InfoCell label="محتوای صریح" value={yesNo(activeTrack.release_extras?.explicit)}/><InfoCell label="مالک نشر" value={activeTrack.release_extras?.publishing_owner}/><InfoCell label="شروع پیش‌نمایش" value={activeTrack.release_extras?.preview_start!=null?`${numberFa(activeTrack.release_extras.preview_start)} ثانیه`:'—'}/></div></section>
          <section className="review-section"><div className="review-section__title"><strong>عوامل اثر</strong></div><div className="classification-review-grid"><div><span>تهیه‌کنندگان فارسی</span><ValueList values={asList(activeTrack.producers)}/></div><div><span>تهیه‌کنندگان انگلیسی</span><ValueList values={asList(activeTrack.producers_en)}/></div><div><span>آهنگسازان فارسی</span><ValueList values={asList(activeTrack.composers)}/></div><div><span>آهنگسازان انگلیسی</span><ValueList values={asList(activeTrack.composers_en)}/></div><div><span>ترانه‌سرایان فارسی</span><ValueList values={asList(activeTrack.lyricists)}/></div><div><span>ترانه‌سرایان انگلیسی</span><ValueList values={asList(activeTrack.lyricists_en)}/></div></div></section>
          {(activeTrack.description||activeTrack.description_en||activeTrack.lyrics||activeTrack.lyrics_en||activeTrack.credits||activeTrack.credits_en)&&<section className="review-section"><div className="review-section__title"><strong>متن‌ها و توضیحات ترک</strong></div><div className="review-text-grid"><TextCard label="توضیحات فارسی" value={activeTrack.description}/><TextCard label="توضیحات انگلیسی" value={activeTrack.description_en} dir="ltr"/><TextCard label="متن ترانه فارسی" value={activeTrack.lyrics}/><TextCard label="متن ترانه انگلیسی" value={activeTrack.lyrics_en} dir="ltr"/><TextCard label="سایر عوامل فارسی" value={activeTrack.credits}/><TextCard label="سایر عوامل انگلیسی" value={activeTrack.credits_en} dir="ltr"/></div></section>}
          {activeTrack.missing_metadata?.length?<div className="inline-note inline-note--warning">موارد تکمیل‌نشده این ترک: {activeTrack.missing_metadata.map(missingMetadataFa).join('، ')}</div>:null}
        </div>:<div className="inline-note">ترکی برای این انتشار ثبت نشده است.</div>}
      </div>}
      </div>

      {hasOperationalActions&&<div className={`release-review-actions${hasDeletedState?' release-review-actions--deleted':''}`}>
        {!hasDeletedState&&availableActions.length>0&&<Field label="توضیح این اقدام (اختیاری)"><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="در صورت نیاز، دلیل یا توضیح کوتاهی ثبت کنید…"/></Field>}
        {availableActions.length>0&&<div className="action-grid">{availableActions.map(key=>{const item=actionMap[key];const Icon=item.icon;const isSchedule=key==='schedule';return <button key={key} className={`button ${item.tone==='danger'?'button--danger':key==='publish'||key==='approve'?'button--primary':isSchedule?'button--schedule':'button--ghost'}`} disabled={busy} onClick={()=>isSchedule?openSchedule():void act(key)}><Icon size={17}/>{actionLabel(key,selected.status)}</button>})}</div>}
        {canDeleteSelected&&<div className="release-destructive-row"><span><strong>حذف رکورد انتشار</strong><small>برای پاک‌سازی قطعی این انتشار و داده‌های اختصاصی وابسته به آن.</small></span><button type="button" className="button button--danger button--compact" disabled={busy} onClick={()=>setDeleteOpen(true)}><Trash2 size={15}/>حذف دائمی</button></div>}
      </div>}
    </div>}</Modal>

    <Modal open={Boolean(selected)&&historyOpen} title="سابقه انتشار" onClose={()=>setHistoryOpen(false)} wide className="release-history-modal">{selected&&<div className="release-history-dialog">
      <div className="release-history-summary"><div><span>ایجاد انتشار</span><strong>{dateTimeFa(selected.created_at)}</strong></div><div><span>ارسال برای بررسی</span><strong>{dateTimeFa(selected.submitted_at)}</strong></div><div><span>آخرین بررسی مدیریت</span><strong>{dateTimeFa(selected.reviewed_at)}</strong></div><div><span>زمان‌بندی انتشار</span><strong>{dateTimeTehranFa(selected.scheduled_at)}</strong></div><div><span>زمان انتشار</span><strong>{dateTimeFa(selected.published_at)}</strong></div><div><span>آخرین تغییر</span><strong>{dateTimeFa(selected.updated_at)}</strong></div></div>
      <div className="release-history-list">{selected.status_history?.length?selected.status_history.map((item,index)=>{const note=historyNoteFa(item.note);return <article key={String(item.id||index)}><div className="release-history-list__head"><strong>{historyActionText(item.from_status,item.to_status,item.note)}</strong><time>{dateTimeFa(String(item.created_at||''))}</time></div><div className="release-history-list__status">{item.from_status?<><span>وضعیت قبلی: {historyLabel(item.from_status)}</span><span>وضعیت جدید: {historyLabel(item.to_status)}</span></>:<span>وضعیت اولیه: {historyLabel(item.to_status)}</span>}</div>{note?<p><b>توضیح:</b> {note}</p>:null}</article>}):<div className="inline-note">سابقه‌ای برای این انتشار ثبت نشده است.</div>}</div>
    </div>}</Modal>

    <Confirm open={Boolean(selected)&&deleteOpen} title="حذف دائمی انتشار" text={selected?`حذف دائمی «${selected.title}» برگشت‌پذیر نیست و رکورد انتشار، ترک‌های اختصاصی آن، آمار و روابط وابسته‌ای را که فقط به همین انتشار تعلق دارند پاک می‌کند. اگر این اثر قبلاً در برنامه منتشر شده است، برای حفظ آمار و سوابق مالی توصیه می‌شود به‌جای حذف دائمی از «خارج کردن از دسترس» استفاده کنید. حذف دائمی بیشتر برای انتشارهایی مناسب است که هرگز به‌صورت عمومی در دسترس نبوده‌اند.`:''} confirmLabel="حذف دائمی" danger busy={busy} onClose={()=>setDeleteOpen(false)} onConfirm={()=>void permanentlyDelete()}/>

    <Modal open={Boolean(selected)&&scheduleOpen} title="زمان‌بندی انتشار" onClose={()=>{if(!busy)setScheduleOpen(false)}} className="release-schedule-modal">{selected&&<div className="release-schedule-dialog">
      <div className="release-schedule-intro"><Timer size={21}/><div><strong>{selected.status==='in_review'?'تأیید و زمان‌بندی انتشار':'زمان‌بندی انتشار'}</strong><span>تاریخ و ساعت دقیق انتشار را به وقت ایران انتخاب کنید.</span></div></div>
      <Field label="تاریخ و ساعت انتشار"><PersianDateTimePicker value={scheduleAt} onChange={setScheduleAt} placeholder="انتخاب تاریخ و ساعت انتشار"/></Field>
      <div className="release-schedule-selected"><span>زمان انتخاب‌شده</span><strong>{dateTimeTehranFa(scheduleAt)}</strong></div>
      <div className="dialog-actions"><button type="button" className="button button--ghost" disabled={busy} onClick={()=>setScheduleOpen(false)}>انصراف</button><button type="button" className="button button--primary" disabled={busy} onClick={()=>void confirmSchedule()}><Timer size={17}/>{selected.status==='in_review'?'تأیید و زمان‌بندی':'ثبت زمان‌بندی'}</button></div>
    </div>}</Modal>
  </div>
}
