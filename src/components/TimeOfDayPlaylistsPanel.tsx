import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Clock3, LoaderCircle, Music2, Pencil, Search, X } from 'lucide-react'
import { useToast } from './toastContext'
import { ErrorState, Field, Modal } from './Ui'
import { api, errorMessageFa, queryString } from '../lib/api'
import { numberFa } from '../lib/format'
import type { Paginated } from '../lib/types'
import { useRemote } from '../lib/useRemote'
import type { PlaylistRecord } from './PlaylistBuilder'
import { mutationFieldsMatch, pageSnapshot, reconcilePaginatedStable, removePaginatedItem, setPaginatedItem, verifyExactEntity } from '../lib/mutationSync'

type TimeKey = 'morning' | 'evening' | 'night'
type EventGroup = {
  id:number
  title:string
  title_en:string
  time_of_day:TimeKey
  playlists:number[]
  playlist_details?:PlaylistRecord[]
  updated_at:string
}

type Slot = {key:TimeKey;label:string;hint:string;defaultFa:string;defaultEn:string}
const SLOTS:Slot[] = [
  {key:'morning',label:'صبح',hint:'انتخاب‌های صبح صفحه جستجو',defaultFa:'برای شروع روز',defaultEn:'Start your day'},
  {key:'evening',label:'عصر',hint:'انتخاب‌های عصر صفحه جستجو',defaultFa:'برای عصر',defaultEn:'For your evening'},
  {key:'night',label:'شب',hint:'انتخاب‌های شب صفحه جستجو',defaultFa:'برای شب',defaultEn:'For the night'},
]

const move = <T,>(items:T[],from:number,to:number) => {
  const next=[...items]
  const [item]=next.splice(from,1)
  next.splice(Math.max(0,Math.min(to,next.length)),0,item)
  return next
}

export function TimeOfDayPlaylistsPanel(){
  const [editing,setEditing]=useState<Slot|null>(null)
  const groups=useRemote<Paginated<EventGroup>>('/admin/event-playlist/'+queryString({page_size:100}))
  const byTime=useMemo(()=>{
    const map=new Map<TimeKey,EventGroup>()
    for(const group of groups.data?.results||[]) if(!map.has(group.time_of_day)) map.set(group.time_of_day,group)
    return map
  },[groups.data])
  const savedGroup=(saved:EventGroup)=>{
    const snapshot=pageSnapshot(groups.data,saved.id)
    const isCreate=snapshot.index<0
    const preferred=isCreate?[saved.id,...snapshot.order]:snapshot.order
    groups.setData(current=>setPaginatedItem(current,saved,{indexHint:isCreate?0:snapshot.index}))
    setEditing(null)
    void verifyExactEntity<EventGroup>(`/admin/event-playlist/${saved.id}/`,{
      found:server=>groups.setData(current=>setPaginatedItem(current,server,{indexHint:isCreate?0:snapshot.index})),
      missing:()=>groups.setData(current=>removePaginatedItem(current,saved.id)),
    },{stopWhenFound:server=>mutationFieldsMatch(server,saved,['title','title_en','time_of_day','playlists'])}).then(outcome=>{if(outcome!=='superseded')void groups.revalidate((current,incoming)=>reconcilePaginatedStable(current,incoming,preferred))})
  }

  return <section className="day-playlists">
    <div className="day-playlists__head">
      <div><strong>پلی‌لیست‌های زمان روز</strong><span>این سه تنظیم مستقیماً بخش پلی‌لیست‌های صبح، عصر و شب صفحه جستجو را کنترل می‌کنند؛ هر بازه می‌تواند ۱ تا ۳ پلی‌لیست مرتب‌شده داشته باشد.</span></div>
      <Clock3 size={18}/>
    </div>
    {groups.error?<ErrorState message={groups.error} retry={()=>void groups.reload()}/>:<div className="day-playlists__grid">
      {SLOTS.map(slot=>{
        const group=byTime.get(slot.key)
        const items=group?.playlist_details||[]
        const ready=items.length>=1&&items.length<=3
        return <article className={ready?'day-slot is-ready':'day-slot'} key={slot.key}>
          <header><div><strong>{slot.label}</strong><span>{slot.hint}</span></div><span className={ready?'day-slot__state is-ready':'day-slot__state'}>{groups.loading?'…':ready?`${numberFa(items.length)} پلی‌لیست`:'تنظیم نشده'}</span></header>
          <div className="day-slot__items">
            {[0,1,2].map(index=>{const playlist=items[index];return <div className={playlist?'day-slot__item':'day-slot__item is-empty'} key={index}>
              <span className="day-slot__index">{numberFa(index+1)}</span>
              {playlist?<><div className="day-slot__art">{playlist.cover_image?<img src={playlist.cover_image} alt="" loading="lazy"/>:<Music2 size={14}/>}</div><strong title={playlist.title}>{playlist.title}</strong></>:<span>جایگاه خالی</span>}
            </div>})}
          </div>
          <button type="button" className="button button--ghost button--compact" onClick={()=>setEditing(slot)} disabled={groups.loading}><Pencil size={14}/>{group?'مدیریت':'تنظیم'}</button>
        </article>
      })}
    </div>}
    {editing&&<TimeSlotEditor slot={editing} group={byTime.get(editing.key)} open onClose={()=>setEditing(null)} onSaved={savedGroup}/>}
  </section>
}

function TimeSlotEditor({slot,group,open,onClose,onSaved}:{slot:Slot|null;group?:EventGroup;open:boolean;onClose:()=>void;onSaved:(saved:EventGroup)=>void|Promise<void>}){
  const toast=useToast()
  const [title,setTitle]=useState(group?.title||slot?.defaultFa||'')
  const [titleEn,setTitleEn]=useState(group?.title_en||slot?.defaultEn||'')
  const [selected,setSelected]=useState<PlaylistRecord[]>((group?.playlist_details||[]).slice(0,3))
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<PlaylistRecord[]>([])
  const [searching,setSearching]=useState(false)
  const [saving,setSaving]=useState(false)


  useEffect(()=>{
    if(!open)return
    let alive=true
    const timer=window.setTimeout(()=>{
      setSearching(true)
      void api<Paginated<PlaylistRecord>>('/admin/playlists/'+queryString({q:query.trim(),page:1,page_size:30}))
        .then(data=>{if(alive)setResults(data.results||[])})
        .catch(err=>{if(alive)toast.show(errorMessageFa(err,'پلی‌لیست‌ها دریافت نشد.'),'error')})
        .finally(()=>{if(alive)setSearching(false)})
    },query?220:0)
    return()=>{alive=false;window.clearTimeout(timer)}
  },[open,query,toast])

  if(!slot)return null
  const selectedIds=new Set(selected.map(item=>item.id))
  const add=(playlist:PlaylistRecord)=>setSelected(current=>current.length>=3||current.some(x=>x.id===playlist.id)?current:[...current,playlist])
  const remove=(id:number)=>setSelected(current=>current.filter(x=>x.id!==id))

  async function save(){
    if(!slot)return
    const activeSlot=slot
    if(!title.trim()||!titleEn.trim()){toast.show('عنوان فارسی و انگلیسی این بخش را کامل کنید.','error');return}
    if(selected.length<1||selected.length>3){toast.show('برای این بازه بین ۱ تا ۳ پلی‌لیست انتخاب کنید.','error');return}
    setSaving(true)
    try{
      const form=new FormData()
      form.append('title',title.trim());form.append('title_en',titleEn.trim());form.append('time_of_day',activeSlot.key)
      selected.forEach(item=>form.append('playlists',String(item.id)))
      const response=await api<EventGroup>(group?`/admin/event-playlist/${group.id}/`:'/admin/event-playlist/',{method:group?'PATCH':'POST',body:form})
      const saved:EventGroup={...response,title:title.trim(),title_en:titleEn.trim(),time_of_day:activeSlot.key,playlists:selected.map(item=>item.id),playlist_details:[...selected]}
      toast.show(`پلی‌لیست‌های ${activeSlot.label} ذخیره شد.`,'success')
      await onSaved(saved)
    }catch(err){toast.show(errorMessageFa(err),'error')}finally{setSaving(false)}
  }

  return <Modal open={open} title={`مدیریت پلی‌لیست‌های ${slot.label}`} onClose={onClose} wide>
    <div className="day-editor">
      <div className="day-editor__titles"><Field label="عنوان فارسی"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field><Field label="عنوان انگلیسی"><input dir="ltr" value={titleEn} onChange={e=>setTitleEn(e.target.value)}/></Field></div>
      <div className="day-editor__selected">
        <div className="day-editor__section-head"><div><strong>تا سه جایگاه نمایشی</strong><span>می‌توانید فقط ۱ پلی‌لیست یا حداکثر ۳ پلی‌لیست انتخاب کنید؛ ترتیب همین ترتیب کلاینت است.</span></div><b>{numberFa(selected.length)}/۳</b></div>
        {[0,1,2].map(index=>{const playlist=selected[index];return <div className={playlist?'day-editor__slot':'day-editor__slot is-empty'} key={index}>
          <span className="day-editor__position">{numberFa(index+1)}</span>
          {playlist?<><div className="day-editor__art">{playlist.cover_image?<img src={playlist.cover_image} alt=""/>:<Music2 size={16}/>}</div><div className="day-editor__playlist-name"><strong>{playlist.title}</strong><span>{numberFa(playlist.songs?.length||0)} آهنگ</span></div><div className="day-editor__moves"><button type="button" className="icon-button icon-button--xs" disabled={index===0} onClick={()=>setSelected(current=>move(current,index,index-1))} aria-label="بالا"><ArrowUp size={14}/></button><button type="button" className="icon-button icon-button--xs" disabled={index===selected.length-1} onClick={()=>setSelected(current=>move(current,index,index+1))} aria-label="پایین"><ArrowDown size={14}/></button><button type="button" className="icon-button icon-button--xs icon-button--danger" onClick={()=>remove(playlist.id)} aria-label="حذف"><X size={14}/></button></div></>:<span className="day-editor__empty-label">یک پلی‌لیست از نتایج پایین انتخاب کنید</span>}
        </div>})}
      </div>
      <div className="day-editor__search">
        <label className="search-box search-box--field"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجوی عنوان فارسی یا انگلیسی پلی‌لیست"/><button type="button" className={query?'search-box__clear is-visible':'search-box__clear'} onClick={()=>setQuery('')} aria-label="پاک کردن"><X size={14}/></button></label>
        <div className="day-editor__results">
          {searching?<div className="builder-inline-loading"><LoaderCircle className="spin" size={17}/>در حال جستجو…</div>:results.map(item=>{const chosen=selectedIds.has(item.id);return <button type="button" className={chosen?'day-editor__candidate is-selected':'day-editor__candidate'} key={item.id} disabled={chosen||selected.length>=3} onClick={()=>add(item)}>
            <div className="day-editor__art">{item.cover_image?<img src={item.cover_image} alt="" loading="lazy"/>:<Music2 size={15}/>}</div><span><strong>{item.title}</strong><small>{numberFa(item.songs?.length||0)} آهنگ</small></span>{chosen?<Check size={15}/>:<span className="day-editor__add">افزودن</span>}
          </button>})}
        </div>
      </div>
      <footer className="dialog-actions"><button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>انصراف</button><button type="button" className="button button--primary" onClick={()=>void save()} disabled={saving||selected.length<1||selected.length>3}>{saving?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}ذخیره تنظیمات</button></footer>
    </div>
  </Modal>
}
